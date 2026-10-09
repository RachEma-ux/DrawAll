// Comparaison et fusion de variantes (lot 14.2). Différences d'une version à l'autre (ajouté,
// supprimé, modifié) et fusion à trois voies par identifiant : une modification faite d'un seul côté
// est reprise, des modifications différentes d'un même élément sont un conflit, listé puis tranché
// (garder l'une ou l'autre). Rien n'est tranché en silence. Fonctions pures.
import { parse, references, resolveParameters, type Parameter } from './params/expr';
import { parentsOf, withoutDanglingMates, type CadObject, type MicroVersion, type ProjectState, type Sheet } from '@/types/cad';
import { constraintObjects } from './constraints/model';
import { activeBranch } from './branches';
import { mateLoop } from './assembly';

type WithId = { id: string };
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export type ChangeKind = 'ajouté' | 'supprimé' | 'modifié';
export interface Change { id: string; kind: ChangeKind }

/** Différences de `to` par rapport à `from`, par identifiant. */
export function diffById<T extends WithId>(from: T[], to: T[]): Change[] {
  const a = new Map(from.map(x => [x.id, x])), b = new Map(to.map(x => [x.id, x]));
  const out: Change[] = [];
  for (const x of to) { const p = a.get(x.id); if (!p) out.push({ id: x.id, kind: 'ajouté' }); else if (!same(p, x)) out.push({ id: x.id, kind: 'modifié' }); }
  for (const x of from) if (!b.has(x.id)) out.push({ id: x.id, kind: 'supprimé' });
  return out;
}

/** Collections fusionnées par identifiant. */
export const MERGED_COLLECTIONS = ['objects', 'layers', 'blocks', 'sheets', 'levels', 'constraints', 'parameters', 'zones'] as const;
export type Collection = (typeof MERGED_COLLECTIONS)[number];
/** Réglages fusionnés comme valeurs simples. */
/** `georef` absent est écrit `null` dans le résultat : une suppression d'un côté est reprise. */
export const MERGED_SETTINGS = ['profileId', 'surfaceRule', 'georef'] as const;

export interface Conflict {
  /** Collection et identifiant de l'élément, ou réglage. */
  where: Collection | (typeof MERGED_SETTINGS)[number];
  id: string;
  /** Situation de chaque côté par rapport à l'ancêtre commun. */
  ours: ChangeKind; theirs: ChangeKind;
  oursValue: unknown; theirsValue: unknown;
  /**
   * Objets qui dépendent de l'élément (calque, bloc, niveau) : le supprimer les supprime aussi,
   * plutôt que de laisser des références vers un élément absent.
   */
  dependents?: string[];
}

export interface MergeResult {
  /** Version fusionnée, conflits tranchés en faveur de la variante active (provisoire). */
  merged: Pick<MicroVersion, Collection | (typeof MERGED_SETTINGS)[number]>;
  conflicts: Conflict[];
  /** Changements repris de l'autre variante, sans conflit. */
  taken: { where: string; id: string; kind: ChangeKind }[];
}

const listOf = (v: Partial<MicroVersion>, c: Collection) => ((v[c] as WithId[] | undefined) ?? []);

/** Fusion à trois voies d'une collection ; les éléments gardent l'ordre de la variante active, les ajouts de l'autre à la suite. */
function mergeList(where: Collection, base: WithId[], ours: WithId[], theirs: WithId[], conflicts: Conflict[], taken: MergeResult['taken']): WithId[] {
  const B = new Map(base.map(x => [x.id, x])), O = new Map(ours.map(x => [x.id, x])), T = new Map(theirs.map(x => [x.id, x]));
  const state = (side: Map<string, WithId>, id: string): ChangeKind | null => {
    const b = B.get(id), s = side.get(id);
    if (!b) return s ? 'ajouté' : null;
    if (!s) return 'supprimé';
    return same(b, s) ? null : 'modifié';
  };
  const decide = new Map<string, WithId | null>();
  for (const id of new Set([...B.keys(), ...O.keys(), ...T.keys()])) {
    const so = state(O, id), st = state(T, id);
    if (!st) continue; // l'autre variante n'y a pas touché : la nôtre fait foi
    if (!so) { decide.set(id, T.get(id) ?? null); taken.push({ where, id, kind: st }); continue; }
    if (same(O.get(id) ?? null, T.get(id) ?? null)) continue; // même changement des deux côtés
    conflicts.push({ where, id, ours: so, theirs: st, oursValue: O.get(id) ?? null, theirsValue: T.get(id) ?? null });
  }
  const out: WithId[] = [];
  for (const x of ours) { const d = decide.has(x.id) ? decide.get(x.id)! : x; if (d) out.push(d); }
  for (const x of theirs) if (!O.has(x.id) && decide.get(x.id)) out.push(x);
  return out;
}

/** Fusion de `theirs` dans `ours`, d'ancêtre commun `base`. */
export function merge3(base: MicroVersion, ours: MicroVersion, theirs: MicroVersion): MergeResult {
  const conflicts: Conflict[] = [], taken: MergeResult['taken'] = [];
  const merged: Record<string, unknown> = {};
  for (const c of MERGED_COLLECTIONS) {
    const list = mergeList(c, listOf(base, c), listOf(ours, c), listOf(theirs, c), conflicts, taken);
    if (list.length || ours[c] !== undefined) merged[c] = list;
  }
  dependencyConflicts(base, ours, theirs, merged, conflicts);
  if (merged.objects) merged.objects = withoutDanglingMates(merged.objects as CadObject[]);
  for (const k of MERGED_SETTINGS) {
    // Géoréférencement : l'absence est une valeur (null), pour qu'un retrait soit fusionné comme un changement.
    const val = (v: MicroVersion) => (k === 'georef' ? v[k] ?? null : v[k]);
    const b = val(base), o = val(ours), t = val(theirs);
    if (same(t, b) || same(o, t)) { if (o !== undefined) merged[k] = o; continue; }
    if (same(o, b)) { if (t !== undefined) merged[k] = t; taken.push({ where: k, id: k, kind: t === null ? 'supprimé' : b === null ? 'ajouté' : 'modifié' }); continue; }
    conflicts.push({ where: k, id: k, ours: o === null ? 'supprimé' : 'modifié', theirs: t === null ? 'supprimé' : 'modifié', oursValue: o, theirsValue: t });
    if (o !== undefined) merged[k] = o;
  }
  return { merged: merged as MergeResult['merged'], conflicts, taken };
}

/** Références d'un objet vers les calques, blocs, niveaux et zones (pièce → zone). */
const REFS: { where: 'layers' | 'blocks' | 'levels' | 'zones'; of: (o: CadObject) => string | undefined }[] = [
  { where: 'layers', of: o => o.layerId },
  { where: 'blocks', of: o => (o.kind === 'blockRef' ? o.blockId : undefined) },
  { where: 'levels', of: o => o.levelId },
  { where: 'zones', of: o => (o.kind === 'room' ? o.zoneId : undefined) },
];

/**
 * Dépendances entre collections : un calque, un bloc ou un niveau supprimé d'un côté mais encore
 * utilisé par des objets du résultat (ajoutés ou gardés de l'autre côté) n'est pas supprimé en
 * silence. Il est gardé provisoirement et la suppression devient un conflit à trancher.
 */
function dependencyConflicts(base: MicroVersion, ours: MicroVersion, theirs: MicroVersion, merged: Record<string, unknown>, conflicts: Conflict[]) {
  // Les deux contrôles (calques, blocs, niveaux, zones ; objets désignés) se nourrissent l'un l'autre : un
  // objet rétabli par le second peut désigner un calque supprimé. Répétés jusqu'à stabilité.
  for (let round = 0; round < 50; round++) {
    const mark = conflicts.length + ((merged.objects as unknown[] | undefined)?.length ?? 0);
    // Objets du résultat, et pour un objet en conflit ses deux valeurs possibles : le choix fait plus tard
    // peut retenir l'une ou l'autre, et chacune doit trouver son calque, son bloc, son niveau, sa zone.
    const candidates = conflicts.filter(c => c.where === 'objects').flatMap(c => [c.oursValue, c.theirsValue].filter((v): v is CadObject => !!v));
    const objects = [...((merged.objects as CadObject[] | undefined) ?? []), ...candidates];
    for (const { where, of } of REFS) {
      const list = (merged[where] as WithId[] | undefined) ?? [];
      const present = new Set(list.map(x => x.id));
      const users = new Map<string, string[]>();
      for (const o of objects) { const r = of(o); if (r && !present.has(r) && !users.get(r)?.includes(o.id)) users.set(r, [...(users.get(r) ?? []), o.id]); }
      // Fenêtres de feuille qui montrent un niveau (feuilles du résultat, et les deux valeurs d'une feuille en conflit).
      if (where === 'levels') {
        const sheets = [...((merged.sheets as Sheet[] | undefined) ?? []), ...conflicts.filter(c => c.where === 'sheets').flatMap(c => [c.oursValue, c.theirsValue].filter((v): v is Sheet => !!v))];
        for (const sh of sheets) for (const vp of sh.viewports) if (vp.levelId && !present.has(vp.levelId) && !users.get(vp.levelId)?.includes(sh.id)) users.set(vp.levelId, [...(users.get(vp.levelId) ?? []), sh.id]);
      }
      for (const [id, dependents] of users) {
        const find = (v: MicroVersion) => listOf(v, where).find(x => x.id === id) ?? null;
        const o = find(ours), t = find(theirs), b = find(base);
        const kept = o ?? t ?? b;
        if (!kept) continue; // jamais défini : rien à garder
        const existing = conflicts.find(c => c.where === where && c.id === id);
        if (existing) { existing.dependents = dependents; continue; }
        const kind = (v: unknown): ChangeKind => (v === null ? 'supprimé' : b ? 'modifié' : 'ajouté');
        conflicts.push({ where, id, ours: kind(o), theirs: kind(t), oursValue: o, theirsValue: t, dependents });
        merged[where] = [...list, kept];
      }
    }
    // Objets qui en désignent d'autres (occurrence → pièce, ouverture → mur, vue → source, cote,
    // note) : un objet désigné supprimé d'un côté mais encore désigné dans le résultat est
    // gardé provisoirement ; sa suppression devient un conflit. Répété jusqu'à stabilité (un objet
    // gardé peut lui-même en désigner un autre supprimé).
    // Une liaison d'assemblage n'est pas une dépendance : sa cible disparue, l'occurrence garde sa place sans liaison.
    const refsOf = (o: CadObject) => parentsOf(o);
    for (let pass = 0; pass < 100; pass++) {
      const objs = (merged.objects as CadObject[] | undefined) ?? [];
      const present = new Set(objs.map(o => o.id));
      const users = new Map<string, string[]>();
      for (const o of objs) for (const r of refsOf(o)) if (!present.has(r)) users.set(r, [...(users.get(r) ?? []), o.id]);
      // Contraintes du résultat qui désignent des objets (sinon élaguées sans le dire à l'enregistrement).
      // Une contrainte en conflit compte par ses deux valeurs (le choix peut rétablir l'une ou l'autre).
      type K = Parameters<typeof constraintObjects>[0];
      const ks = [...((merged.constraints as K[] | undefined) ?? []), ...conflicts.filter(c => c.where === 'constraints').flatMap(c => [c.oursValue, c.theirsValue].filter((v): v is K => !!v))];
      for (const k of ks) {
        for (const r of constraintObjects(k)) if (!present.has(r) && !users.get(r)?.includes(k.id)) users.set(r, [...(users.get(r) ?? []), k.id]);
      }
      let added = false;
      for (const [id, dependents] of users) {
        const find = (v: MicroVersion) => (v.objects.find(x => x.id === id) as CadObject | undefined) ?? null;
        const o = find(ours), t = find(theirs), b = find(base);
        const kept = o ?? t ?? b;
        if (!kept) continue; // référence déjà absente partout : rien à garder
        const existing = conflicts.find(c => c.where === 'objects' && c.id === id);
        if (existing) existing.dependents = dependents;
        else {
          const kind = (v: unknown): ChangeKind => (v === null ? 'supprimé' : b ? 'modifié' : 'ajouté');
          conflicts.push({ where: 'objects', id, ours: kind(o), theirs: kind(t), oursValue: o, theirsValue: t, dependents });
        }
        if (!present.has(id)) { merged.objects = [...((merged.objects as CadObject[]) ?? []), kept]; added = true; }
      }
      if (!added) break;
    }
    // Paramètres cités par une expression (contrainte cotée ou autre paramètre), dans le résultat ou dans
    // l'une des deux valeurs d'un élément en conflit : un paramètre cité supprimé devient un conflit.
    const params = (merged.parameters as Parameter[] | undefined) ?? [];
    const named = new Set(params.map(p => p.name));
    const cite = (expr: unknown): string[] => { if (typeof expr !== 'string' || !expr.trim()) return []; try { return [...references(parse(expr))]; } catch { return []; } };
    const exprUsers: { id: string; expr: unknown }[] = [
      ...params.map(p => ({ id: p.id, expr: p.expr })),
      ...((merged.constraints as { id: string; expr?: unknown }[] | undefined) ?? []).map(k => ({ id: k.id, expr: k.expr })),
      ...conflicts.filter(c => c.where === 'parameters' || c.where === 'constraints')
        .flatMap(c => [c.oursValue, c.theirsValue].filter((v): v is { id: string; expr?: unknown } => !!v).map(v => ({ id: v.id, expr: v.expr }))),
    ];
    const missing = new Map<string, string[]>();
    for (const u of exprUsers) for (const n of cite(u.expr)) if (!named.has(n) && !missing.get(n)?.includes(u.id)) missing.set(n, [...(missing.get(n) ?? []), u.id]);
    for (const [name, dependents] of missing) {
      const find = (v: MicroVersion) => (v.parameters ?? []).find(x => x.name === name) ?? null;
      const kept = find(ours) ?? find(theirs) ?? find(base);
      if (!kept) continue; // nom jamais défini : expression déjà en erreur des deux côtés
      const byId = (v: MicroVersion) => (v.parameters ?? []).find(x => x.id === kept.id) ?? null;
      const o = byId(ours), t = byId(theirs), b = byId(base);
      const existing = conflicts.find(c => c.where === 'parameters' && c.id === kept.id);
      if (existing) existing.dependents = dependents;
      else {
        const kind = (v: unknown): ChangeKind => (v === null ? 'supprimé' : b ? 'modifié' : 'ajouté');
        conflicts.push({ where: 'parameters', id: kept.id, ours: kind(o), theirs: kind(t), oursValue: o, theirsValue: t, dependents });
      }
      if (!params.some(p => p.id === kept.id)) merged.parameters = [...((merged.parameters as Parameter[] | undefined) ?? []), kept];
    }
    if (conflicts.length + ((merged.objects as unknown[] | undefined)?.length ?? 0) === mark) break;
  }
}

/**
 * Toutes les différences de `to` par rapport à `from` : chaque collection fusionnée et chaque
 * réglage (comptes de la comparaison).
 */
export function versionDiff(from: MicroVersion, to: MicroVersion): (Change & { where: string })[] {
  const out: (Change & { where: string })[] = [];
  for (const c of MERGED_COLLECTIONS) for (const ch of diffById(listOf(from, c), listOf(to, c))) out.push({ ...ch, where: c });
  for (const k of MERGED_SETTINGS) if (!same(from[k], to[k])) out.push({ id: k, kind: 'modifié', where: k });
  return out;
}

export type Choice = 'nôtre' | 'leur';

/** Version fusionnée avec chaque conflit tranché ; tous doivent l'être. */
export function resolve(r: MergeResult, choices: Record<string, Choice>): MergeResult['merged'] | { error: string } {
  const key = (c: Conflict) => `${c.where}:${c.id}`;
  const missing = r.conflicts.filter(c => !choices[key(c)]);
  if (missing.length) return { error: `${missing.length} conflit${missing.length > 1 ? 's' : ''} à trancher.` };
  const out: Record<string, unknown> = { ...r.merged };
  for (const c of r.conflicts) {
    if (choices[key(c)] !== 'leur') continue;
    if ((MERGED_SETTINGS as readonly string[]).includes(c.where)) { out[c.where] = c.theirsValue; continue; }
    const list = [...((out[c.where] as WithId[] | undefined) ?? [])];
    const i = list.findIndex(x => x.id === c.id);
    if (c.theirsValue === null) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = c.theirsValue as WithId;
    else list.push(c.theirsValue as WithId);
    out[c.where] = list;
  }
  // Suppression retenue d'un calque, d'un bloc ou d'un niveau : ses objets dépendants partent avec lui.
  const gone = new Set<string>();
  for (const c of r.conflicts) {
    if (!c.dependents?.length) continue;
    const value = choices[key(c)] === 'leur' ? c.theirsValue : c.oursValue;
    const list = (out[c.where] as WithId[] | undefined) ?? [];
    if (value === null) {
      out[c.where] = list.filter(x => x.id !== c.id);
      // Dépendants recalculés sur les valeurs retenues (un objet en conflit peut avoir quitté ce calque).
      const objs = (out.objects as CadObject[] | undefined) ?? [];
      // Zone supprimée : ses pièces restent, sans zone (comme la suppression d'une zone dans l'atelier).
      if (c.where === 'zones') {
        out.objects = objs.map(o => {
          if (o.kind !== 'room' || o.zoneId !== c.id) return o;
          const { zoneId: _z, ...rest } = o;
          void _z;
          return rest as CadObject;
        });
        continue;
      }
      // Niveau supprimé : les fenêtres de feuille qui le montraient passent au premier niveau restant,
      // comme lors de la suppression d'un niveau dans l'atelier.
      if (c.where === 'levels' && out.sheets) {
        const first = ((out.levels as WithId[] | undefined) ?? [])[0]?.id;
        out.sheets = (out.sheets as Sheet[]).map(sh => ({ ...sh, viewports: sh.viewports.map(vp => {
          if (vp.levelId !== c.id) return vp;
          if (first) return { ...vp, levelId: first };
          const { levelId: _l, ...rest } = vp;
          void _l;
          return rest;
        }) }));
      }
      const ref = REFS.find(x => x.where === c.where);
      if (ref) { for (const o of objs) if (ref.of(o) === c.id) gone.add(o.id); continue; }
      // Objet supprimé : ses dépendants (objets et contraintes) qui le désignent encore.
      for (const o of objs) if (parentsOf(o).includes(c.id)) gone.add(o.id);
      for (const k of (out.constraints as Parameters<typeof constraintObjects>[0][] | undefined) ?? []) if (constraintObjects(k).includes(c.id)) gone.add(k.id);
    }
  }
  // Dépendants des dépendants (une cote d'une ouverture d'un mur retiré…) : retirés à leur tour. Les choix
  // peuvent aussi rétablir un objet dont le parent a été supprimé sans conflit (ouverture modifiée chez
  // eux, mur supprimé chez nous) : il suit son parent, comme toute suppression en cascade.
  const ids = new Set(((out.objects as WithId[] | undefined) ?? []).map(o => o.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const o of (out.objects as CadObject[] | undefined) ?? []) {
      if (gone.has(o.id)) continue;
      const refs = parentsOf(o);
      if (refs.some(r => gone.has(r) || !ids.has(r))) { gone.add(o.id); grew = true; }
    }
  }
  if (gone.size) {
    out.objects = ((out.objects as WithId[] | undefined) ?? []).filter(o => !gone.has(o.id));
    // Contraintes dépendantes : nommées, ou visant un objet retiré.
    if (out.constraints) {
      out.constraints = (out.constraints as Parameters<typeof constraintObjects>[0][]).filter(k => !gone.has(k.id) && !constraintObjects(k).some(r => gone.has(r)));
    }
  }
  // Liaisons dont la cible n'est plus dans le résultat : retirées, l'occurrence garde sa place (comme une suppression).
  if (out.objects) out.objects = withoutDanglingMates(out.objects as CadObject[]);
  // Rattachements de pièces revus après les choix : une pièce retenue (de l'une ou l'autre variante)
  // dont la zone n'existe plus dans le résultat reste sans zone, jamais rattachée à une zone absente.
  if (out.objects) {
    const zones = new Set(((out.zones as WithId[] | undefined) ?? []).map(z => z.id));
    out.objects = (out.objects as CadObject[]).map(o => {
      if (o.kind !== 'room' || !o.zoneId || zones.has(o.zoneId)) return o;
      const { zoneId: _z, ...rest } = o;
      void _z;
      return rest as CadObject;
    });
  }
  // Choix incompatibles : un paramètre dont on retient la suppression ne peut rester cité par une
  // expression retenue (contrainte cotée ou autre paramètre) ; la valeur cotée se figerait sans le dire.
  const deleted = new Map<string, string>();
  for (const c of r.conflicts) {
    if (c.where !== 'parameters') continue;
    const value = choices[key(c)] === 'leur' ? c.theirsValue : c.oursValue;
    const name = ((c.oursValue ?? c.theirsValue) as Parameter | null)?.name;
    if (value === null && name) deleted.set(name, c.id);
  }
  if (deleted.size) {
    const users = [...((out.parameters as Parameter[] | undefined) ?? []).map(p => ({ id: p.id, expr: p.expr as unknown })), ...((out.constraints as { id: string; expr?: unknown }[] | undefined) ?? [])];
    for (const u of users) {
      if (typeof u.expr !== 'string' || !u.expr.trim()) continue;
      let names: string[] = [];
      try { names = [...references(parse(u.expr))]; } catch { continue; }
      const gone = names.find(n => deleted.has(n));
      if (gone) return { error: `Choix incompatibles : le paramètre ${gone} est supprimé mais ${u.id} le cite encore.` };
    }
  }
  // Un projet garde toujours au moins un calque : deux suppressions disjointes (chaque variante retire
  // un calque différent) videraient la liste sans conflit et l'atelier ne saurait plus où dessiner.
  if (Array.isArray(out.layers) && out.layers.length === 0) return { error: 'Fusion refusée : aucun calque ne resterait (chaque variante en supprime un) ; gardez-en un avant de fusionner.' };
  return out as MergeResult['merged'];
}

/**
 * Paramètres fusionnés : chaque modification, valable de son côté, peut former avec celle de l'autre
 * variante une référence circulaire (a ← b d'un côté, b ← a de l'autre) ou citer un nom disparu.
 * Renvoie l'erreur d'un paramètre en erreur après fusion qui ne l'était dans aucune des deux variantes.
 */
export function mergedParameterError(merged: Parameter[] | undefined, ours: Parameter[] | undefined, theirs: Parameter[] | undefined): string | null {
  // Deux paramètres de même nom (ajoutés chacun dans sa variante) : lequel piloterait les cotes ?
  const seen = new Map<string, string>();
  for (const p of merged ?? []) {
    const other = seen.get(p.name);
    if (other) return `Fusion refusée : deux paramètres portent le nom ${p.name} (${other} et ${p.id}) ; renommez-en un avant de fusionner`;
    seen.set(p.name, p.id);
  }
  const after = resolveParameters(merged ?? []).errors;
  if (!after.size) return null;
  const before = new Set([...resolveParameters(ours ?? []).errors.keys(), ...resolveParameters(theirs ?? []).errors.keys()]);
  for (const [name, msg] of after) if (!before.has(name)) return `Fusion refusée : le paramètre ${name} serait en erreur (${msg})`;
  return null;
}

/**
 * Liaisons fusionnées : A → B d'un côté et B → A de l'autre, valables chacune, forment une boucle
 * qu'aucune variante n'avait. Renvoie le refus, ou null.
 */
export function mergedMateError(merged: CadObject[] | undefined, ours: CadObject[], theirs: CadObject[]): string | null {
  const looped = (objs: CadObject[]) => new Set(objs.filter(o => o.kind === 'occurrence' && o.mate && mateLoop(o.id, o.mate.to, objs)).map(o => o.id));
  const before = new Set([...looped(ours), ...looped(theirs)]);
  const after = [...looped(merged ?? [])].find(id => !before.has(id));
  return after ? `Fusion refusée : les liaisons réunies formeraient une boucle (${after})` : null;
}

export const conflictKey = (c: Conflict) => `${c.where}:${c.id}`;

/**
 * Versions à fusionner : la courante de la variante active (nôtre), la courante de l'autre (leur),
 * et l'ancêtre commun (version de départ de l'une dans l'historique de l'autre).
 */
export function mergeInputs(s: ProjectState, otherId: string): { base: MicroVersion; ours: MicroVersion; theirs: MicroVersion } | { error: string } {
  const other = s.branches?.find(b => b.id === otherId);
  if (!other) return { error: 'Variante inconnue.' };
  const me = activeBranch(s);
  let base: MicroVersion | undefined;
  if (other.from?.branchId === me.id) base = other.versions.find(v => v.seq === other.from!.seq);
  else if (me.from?.branchId === other.id) base = s.versions.find(v => v.seq === me.from!.seq);
  else if (me.from && other.from && me.from.branchId === other.from.branchId) {
    // Deux variantes nées de la même branche : la plus ancienne des deux versions de départ.
    const seq = Math.min(me.from.seq, other.from.seq);
    base = s.versions.find(v => v.seq === seq) ?? other.versions.find(v => v.seq === seq);
  }
  if (!base) return { error: 'Ancêtre commun introuvable : seules une variante et la branche dont elle est partie (ou deux variantes sœurs) se fusionnent.' };
  return { base, ours: s.versions[s.pointer], theirs: other.versions[other.pointer] };
}
