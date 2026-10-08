// Paquet natif (lot 8.2) : export et import du projet entier — historique (par différences, lot 8.1),
// objets de tous les niveaux, calques, blocs, feuilles, profils et réglages de chaque version, compteurs,
// ressources (fonds de plan, photos). Écrit en JSON aux clés triées : exporter, réimporter et
// réexporter donne le même fichier octet pour octet.
import type { BlockDef, CadObject, Layer, Level, ProjectState, Sheet, Asset } from '@/types/cad';
import { decodeHistory, encodeHistory } from '@/lib/history';
import { normalizeProjectState } from '@/store/project';

export const PACKAGE_FORMAT = 'drawall-package';
export const PACKAGE_VERSION = '1.0.0';

/** JSON aux clés triées (indentation de deux espaces) : sortie stable, comparable octet pour octet. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined) out[k] = sort(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}

/** Paquet du projet (sans la date d'export, le contenu ne dépend que du projet). */
export function toPackage(state: ProjectState): string {
  const current = state.versions[state.pointer];
  return canonicalJson({
    manifest: { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, generator: 'DrawAll', unites: 'millimetre' },
    resume: { revision: current.seq, versions: state.versions.length, objets: current.objects.length, ressources: Object.keys(state.assets ?? {}).length },
    projet: encodeHistory(state),
  });
}

export type PackageResult = { ok: true; state: ProjectState; summary: string } | { ok: false; error: string };

/**
 * Lecture d'un paquet : format 1.x (projet entier, historique compris) ou prototype 0.1 (objets,
 * calques, blocs, niveaux, feuilles, ressources de la version courante : une seule version).
 */
export function fromPackage(text: string): PackageResult {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Fichier illisible : ce n’est pas un JSON.' }; }
  const manifest = raw?.manifest as { format?: string; version?: string } | undefined;
  if (!manifest || manifest.format !== PACKAGE_FORMAT) return { ok: false, error: 'Ce fichier n’est pas un paquet DrawAll (manifeste absent).' };
  const major = Number(String(manifest.version ?? '').split('.')[0]);
  if (major === 1) {
    const projet = raw.projet as { versions?: unknown } | undefined;
    if (!projet || !Array.isArray(projet.versions) || projet.versions.length === 0) return { ok: false, error: 'Paquet incomplet : historique absent.' };
    // Paquet abîmé (différence mal formée…) : refus motivé plutôt qu'une exception.
    let state: ProjectState;
    try { state = normalizeProjectState(decodeHistory(projet as { versions: unknown[] })); } catch { return { ok: false, error: 'Paquet abîmé : l’historique ne peut pas être relu.' }; }
    return { ok: true, state, summary: `${state.versions.length} version${state.versions.length > 1 ? 's' : ''}, ${state.versions[state.pointer].objects.length} objet(s)` };
  }
  if (major === 0) {
    // Prototype : instantané de la version courante, sans historique.
    const objects = Array.isArray(raw.objets) ? (raw.objets as CadObject[]) : [];
    let state: ProjectState;
    try {
      state = normalizeProjectState({
        versions: [{ seq: 0, label: 'Import du paquet (prototype)', time: 0, objects, layers: (raw.calques as Layer[] | undefined) ?? [], blocks: (raw.blocs as BlockDef[] | undefined) ?? [], sheets: raw.feuilles as Sheet[] | undefined, levels: raw.niveaux as Level[] | undefined }],
        pointer: 0,
        assets: raw.ressources as Record<string, Asset> | undefined,
      });
    } catch { return { ok: false, error: 'Paquet prototype abîmé : il ne peut pas être relu.' }; }
    return { ok: true, state, summary: `paquet prototype : ${objects.length} objet(s), sans historique` };
  }
  return { ok: false, error: `Version de paquet non prise en charge : ${manifest.version ?? '?'} (attendu 1.x).` };
}
