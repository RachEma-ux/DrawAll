// Branches (lot 14.1) : variantes créées depuis une version. La branche active occupe l'historique
// du projet (`versions`, `pointer`) ; les autres sont rangées dans `branches`, chacune avec son
// historique et sa position. Basculer échange la branche active et une branche rangée. Les objets
// des versions communes sont partagés (aucune copie) ; le compteur d'identifiants reste commun :
// deux variantes ne créent jamais deux objets de même identifiant. Fonctions pures.
import type { Branch, CadObject, ProjectState } from '@/types/cad';

type ActiveBranch = NonNullable<ProjectState['branch']>;
export const MAIN_BRANCH: ActiveBranch = { id: 'BR-0000', name: 'Principale' };

export const activeBranch = (s: ProjectState): ActiveBranch => s.branch ?? MAIN_BRANCH;

export interface BranchInfo { id: string; name: string; active: boolean; from?: { branchId: string; seq: number }; versions: number; current: string }

/** Branches du projet, l'active d'abord. */
export function branchList(s: ProjectState): BranchInfo[] {
  const a = activeBranch(s);
  return [
    { id: a.id, name: a.name, active: true, ...(a.from ? { from: a.from } : {}), versions: s.versions.length, current: s.versions[s.pointer].label },
    ...(s.branches ?? []).map(b => ({ id: b.id, name: b.name, active: false, ...(b.from ? { from: b.from } : {}), versions: b.versions.length, current: b.versions[b.pointer].label })),
  ];
}

/**
 * Identifiant jamais attribué : au-delà des variantes présentes et de toutes celles encore citées
 * (origine d'une variante, dossier publié), même supprimées, pour qu'aucune ne reprenne l'identité
 * d'une autre.
 */
const nextBranchId = (s: ProjectState) => {
  const all = [activeBranch(s), ...(s.branches ?? [])];
  const ids = [...all.map(b => b.id), ...all.flatMap(b => (b.from ? [b.from.branchId] : [])), ...(s.publications ?? []).map(p => p.branchId)];
  const max = Math.max(0, ...ids.map(id => Number(id.match(/(\d+)$/)?.[1] ?? 0)));
  return `BR-${String(max + 1).padStart(4, '0')}`;
};

/** La branche active, rangée telle quelle (historique et position). */
function stored(s: ProjectState): Branch {
  const a = activeBranch(s);
  return { id: a.id, name: a.name, ...(a.from ? { from: a.from } : {}), versions: s.versions, pointer: s.pointer };
}

/**
 * Nouvelle variante depuis la version d'indice `index` de la branche active : son historique reprend
 * les versions jusqu'à celle-ci (partagées), et elle devient active. La branche quittée est rangée
 * intacte, versions postérieures comprises.
 */
export function createBranch(s: ProjectState, name: string, index = s.pointer): ProjectState | { error: string } {
  const n = name.trim();
  if (!n) return { error: 'Nom de variante attendu.' };
  if (branchList(s).some(b => b.name === n)) return { error: `La variante « ${n} » existe déjà.` };
  if (index < 0 || index >= s.versions.length) return { error: 'Version de départ inconnue.' };
  const from = { branchId: activeBranch(s).id, seq: s.versions[index].seq };
  return {
    ...s,
    branches: [...(s.branches ?? []), stored(s)],
    branch: { id: nextBranchId(s), name: n, from },
    versions: s.versions.slice(0, index + 1),
    pointer: index,
  };
}

/** Bascule vers une branche rangée ; l'active est rangée avec sa position. */
export function switchBranch(s: ProjectState, id: string): ProjectState | { error: string } {
  if (activeBranch(s).id === id) return s;
  const target = s.branches?.find(b => b.id === id);
  if (!target) return { error: 'Variante inconnue.' };
  const rest = (s.branches ?? []).filter(b => b.id !== id);
  const branch = { id: target.id, name: target.name, ...(target.from ? { from: target.from } : {}) };
  const out: ProjectState = { ...s, branches: [...rest, stored(s)], versions: target.versions, pointer: target.pointer };
  if (target.id === MAIN_BRANCH.id && !target.from) delete out.branch; else out.branch = branch;
  return out;
}

/** Supprime une branche rangée (jamais l'active). */
export function removeBranch(s: ProjectState, id: string): ProjectState | { error: string } {
  if (activeBranch(s).id === id) return { error: 'La variante active ne se supprime pas : basculez d’abord vers une autre.' };
  if (!s.branches?.some(b => b.id === id)) return { error: 'Variante inconnue.' };
  const branches = s.branches.filter(b => b.id !== id);
  const out = { ...s, branches };
  if (!branches.length) delete (out as Partial<ProjectState>).branches;
  return out;
}

/** Toutes les versions de toutes les branches (pour attribuer des identifiants jamais repris). */
export const allVersions = (s: ProjectState) => [...s.versions, ...(s.branches ?? []).flatMap(b => b.versions)];

/**
 * Suppression définitive d'une photo de note : retirée des notes de toutes les versions de toutes
 * les branches ; l'image quitte le projet si aucun fond de plan d'aucune branche ne s'en sert.
 */
export function purgePhoto(s: ProjectState, assetId: string): ProjectState {
  const purge = (objects: CadObject[]) => objects.map(o => (o.kind === 'note' && o.photoIds?.includes(assetId) ? ({ ...o, photoIds: o.photoIds.filter(p => p !== assetId) } as CadObject) : o));
  const stillUsed = allVersions(s).some(v => v.objects.some(o => o.kind === 'underlay' && o.assetId === assetId));
  const assets = { ...(s.assets ?? {}) };
  if (!stillUsed) delete assets[assetId];
  return {
    ...s,
    versions: s.versions.map(v => ({ ...v, objects: purge(v.objects) })),
    ...(s.branches ? { branches: s.branches.map(b => ({ ...b, versions: b.versions.map(v => ({ ...v, objects: purge(v.objects) })) })) } : {}),
    assets,
  };
}
