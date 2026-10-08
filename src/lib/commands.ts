// API de commandes (lot 18.1) : chaque opération sur le projet est une commande nommée, aux
// arguments sérialisables (JSON), validée avant exécution et journalisée. La palette, l'interface et
// les scripts passent tous par elle (le magasin du projet n'expose que des commandes). Rejouer le
// journal depuis son état de base reproduit le projet. Fonctions pures.
import { KIND_LABEL, parentsOf, type CadObject, type Layer, type MicroVersion } from '@/types/cad';
import { mirrorObject, moveObject, offsetObject, rotateObject, scaleObject } from './geometry';
import { isRecipe } from './solids';

/** Transformation déclarative (remplace les fonctions, non sérialisables). */
export type TransformOp =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'rotate'; cx: number; cy: number; deg: number }
  | { kind: 'mirror'; axis: 'x' | 'y'; value: number }
  | { kind: 'scale'; cx: number; cy: number; factor: number }
  | { kind: 'offset'; d: number };

export function applyTransform(op: TransformOp): (o: CadObject) => Partial<CadObject> | null {
  switch (op.kind) {
    case 'move': return o => moveObject(o, op.dx, op.dy);
    case 'rotate': return o => rotateObject(o, op.cx, op.cy, op.deg);
    case 'mirror': return o => mirrorObject(o, op.axis, op.value);
    case 'scale': return o => scaleObject(o, op.cx, op.cy, op.factor);
    case 'offset': return o => offsetObject(o, op.d);
  }
}

export interface JournalEntry {
  /** Rang dans le journal (1, 2, 3…). */
  n: number;
  type: string;
  args: unknown[];
  /** Commande refusée par la validation (rien n'est exécuté). */
  refused?: string;
}

export interface Journal {
  /** État du projet au début du journal (paquet de projet sérialisé). */
  base: unknown;
  entries: JournalEntry[];
}

const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown) => typeof v === 'string' && v.length > 0;
const positive = (v: unknown) => finite(v) && (v as number) > 0;
const strs = (v: unknown) => Array.isArray(v) && v.every(str);

function transformError(op: unknown): string | null {
  const t = op as TransformOp;
  if (!t || typeof t !== 'object') return 'transformation attendue';
  switch (t.kind) {
    case 'move': return finite(t.dx) && finite(t.dy) ? null : 'déplacement : dx et dy finis attendus';
    case 'rotate': return finite(t.cx) && finite(t.cy) && finite(t.deg) ? null : 'rotation : centre et angle finis attendus';
    case 'mirror': return (t.axis === 'x' || t.axis === 'y') && finite(t.value) ? null : 'symétrie : axe x ou y et valeur attendus';
    case 'scale': return finite(t.cx) && finite(t.cy) && finite(t.factor) && t.factor > 0 ? null : 'échelle : centre et rapport positif attendus';
    case 'offset': return finite(t.d) ? null : 'décalage : distance finie attendue';
    default: return `transformation inconnue « ${String((t as { kind?: unknown }).kind)} »`;
  }
}

/**
 * Forme complète d'un objet à créer (scripts, assistant) : champs numériques finis, champs texte et
 * listes de points requis par son type. Un objet incomplet serait enregistré puis casserait le rendu.
 */
type Spec = { nums?: string[]; strs?: string[]; /** Nombre minimal de points (x, y). */ points?: number; enums?: Record<string, readonly unknown[]>; extra?: (o: Record<string, unknown>) => string | null };
/** Champs requis de chaque type d'objet (tous les types de KIND_LABEL : un type sans fiche est refusé). */
const SPECS: Record<string, Spec> = {
  line: { nums: ['x1', 'y1', 'x2', 'y2'] },
  rect: { nums: ['x', 'y', 'w', 'h'] },
  circle: { nums: ['cx', 'cy', 'r'] },
  arc: { nums: ['cx', 'cy', 'r', 'start', 'end'] },
  ellipse: { nums: ['cx', 'cy', 'rx', 'ry', 'rotation'] },
  spline: { nums: ['degree'], points: 2 },
  polyline: { points: 2 },
  dimension: { nums: ['offset'], strs: ['targetId'], enums: { style: ['horizontal', 'vertical', 'aligned', 'radial'] } },
  pdim: { nums: ['offset'], points: 1, enums: { mode: ['chain', 'baseline', 'angular', 'level'], axis: ['horizontal', 'vertical', 'aligned'] } },
  blockRef: { nums: ['x', 'y', 'scale'], strs: ['blockId'] },
  text: { nums: ['x', 'y', 'height', 'rotation'], strs: ['content'] },
  wall: { nums: ['x1', 'y1', 'x2', 'y2', 'thickness'], enums: { justification: ['axe', 'gauche', 'droite'] } },
  opening: { nums: ['position', 'width'], strs: ['hostId'], enums: { type: ['porte', 'fenetre'] } },
  room: { nums: ['x', 'y'] },
  slab: { nums: ['thickness'], points: 3 },
  roof: { nums: ['x', 'y', 'w', 'h', 'pitch', 'overhang'] },
  column: {
    nums: ['x', 'y'], enums: { section: ['rect', 'circle'] },
    // Dimensions selon la section : b × h pour un poteau rectangulaire, d pour un poteau circulaire.
    extra: o => (o.section === 'rect' ? (positive(o.b) && positive(o.h) ? null : 'poteau rectangulaire : b et h positifs attendus') : positive(o.d) ? null : 'poteau circulaire : diamètre d positif attendu'),
  },
  beam: { nums: ['x1', 'y1', 'x2', 'y2', 'b', 'h'] },
  solid: { extra: o => (isRecipe(o.recipe) ? null : 'solide : recette attendue') },
  occurrence: { nums: ['x', 'y', 'z', 'angle'], strs: ['sourceId'] },
  projection: { nums: ['x', 'y'], strs: ['sourceId'], enums: { view: ['dessus', 'face', 'cote'] } },
  elevation: { nums: ['x', 'y'], enums: { view: ['nord', 'sud', 'est', 'ouest', 'coupe'] }, extra: o => (o.view === 'coupe' && !str(o.markId) ? 'façade : repère de coupe attendu' : null) },
  north: { nums: ['x', 'y', 'rotation'] },
  section: { nums: ['x1', 'y1', 'x2', 'y2'], strs: ['label'] },
  levelMark: { nums: ['x', 'y', 'elevation'] },
  roughness: { nums: ['x', 'y', 'rotation'], enums: { process: ['quelconque', 'enlevement', 'sans-enlevement'] } },
  views: { nums: ['depth', 'gap'], strs: ['sourceId'] },
  cut: { nums: ['depth', 'gap'], strs: ['sourceId', 'markId'] },
  bom: { nums: ['x', 'y'] },
  balloon: { nums: ['x', 'y'], strs: ['targetId'] },
  underlay: { nums: ['x', 'y', 'w', 'h', 'opacity'], strs: ['assetId'] },
  note: { nums: ['x', 'y', 'time'], extra: o => (typeof o.text === 'string' ? null : 'note : texte attendu') },
};

export function objectShapeError(o: Record<string, unknown>): string | null {
  const kind = o.kind as string;
  const spec = SPECS[kind];
  if (!spec) return `type d’objet inconnu « ${String(kind)} »`;
  for (const k of spec.nums ?? []) if (!finite(o[k])) return `${kind} : ${k} numérique fini attendu`;
  for (const k of spec.strs ?? []) if (!str(o[k])) return `${kind} : ${k} attendu`;
  for (const [k, values] of Object.entries(spec.enums ?? {})) if (!values.includes(o[k])) return `${kind} : ${k} parmi ${values.join(', ')} attendu`;
  if (spec.points) {
    const p = o.points;
    if (!Array.isArray(p) || p.length < 2 * spec.points || p.length % 2 !== 0 || !p.every(finite)) return `${kind} : liste de points (x, y) finie attendue`;
  }
  return spec.extra?.(o) ?? null;
}

/** Type attendu de l'objet désigné, pour les références typées (ouverture → mur, occurrence → pièce…). */
const REF_KIND: Partial<Record<string, string>> = { opening: 'wall', occurrence: 'solid', projection: 'solid' };

type Ctx = { ids: Set<string>; objects: CadObject[]; layerIds?: Set<string>; levelIds?: Set<string>; blockIds?: Set<string> };

/**
 * Références d'un objet : niveau, définition de bloc, objets désignés (parent, repère de coupe, cible
 * d'une liaison) présents et du bon type. Un objet orphelin serait enregistré sans être jamais dessiné.
 */
function referenceError(o: Record<string, unknown>, { objects, levelIds, blockIds }: Ctx): string | null {
  const kind = o.kind as string;
  if (o.levelId !== undefined && levelIds && !(str(o.levelId) && levelIds.has(o.levelId as string))) return `${kind} : niveau ${String(o.levelId)} absent`;
  if (kind === 'blockRef' && blockIds && !blockIds.has(o.blockId as string)) return `blockRef : bloc ${String(o.blockId)} absent`;
  const byId = new Map(objects.map(x => [x.id, x]));
  const c = o as unknown as CadObject;
  const refs = parentsOf(c);
  for (const r of refs) {
    const target = byId.get(r);
    if (!target) return `${kind} : objet désigné ${r} absent`;
    const want = r === (o as { markId?: unknown }).markId ? 'section' : REF_KIND[kind];
    if (want && target.kind !== want) return `${kind} : ${r} n’est pas un objet de type ${want}`;
  }
  const mate = (o as { mate?: { to?: unknown } }).mate;
  if (kind === 'occurrence' && mate && !(str(mate.to) && byId.get(mate.to as string)?.kind === 'occurrence')) return `occurrence : liaison vers ${String(mate.to)} absente`;
  return null;
}

/** Toutes les fiches existent (vérifié par les tests) : chaque type connu est validé. */
export const OBJECT_SPEC_KINDS = Object.keys(SPECS);

/**
 * Validateurs propres à certaines commandes (les autres : arguments sérialisables). Seules les
 * commandes validées ici sont ouvertes aux scripts et à l'assistant (`scriptCommandError`) :
 * l'interface ne passe que des arguments bien formés, un script peut passer n'importe quoi.
 */
const VALIDATORS: Record<string, (args: unknown[], ctx: Ctx) => string | null> = {
  addObject: ([o], ctx) => {
    const { layerIds } = ctx;
    const n = o as { kind?: unknown; layerId?: unknown } | null;
    if (!n || typeof n !== 'object' || !str(n.kind)) return 'objet à créer : type attendu';
    if (!Object.prototype.hasOwnProperty.call(KIND_LABEL, n.kind as string)) return `type d’objet inconnu « ${String(n.kind)} »`;
    if (layerIds && !(str(n.layerId) && layerIds.has(n.layerId as string))) return `objet à créer : calque ${String(n.layerId)} absent`;
    return objectShapeError(n as Record<string, unknown>) ?? referenceError(n as Record<string, unknown>, ctx);
  },
  updateObject: ([id, patch], ctx) => {
    const { ids, objects, layerIds } = ctx;
    if (!str(id)) return 'identifiant attendu';
    if (!ids.has(id as string)) return `objet ${String(id)} absent`;
    if (!patch || typeof patch !== 'object') return 'modification attendue';
    // L'objet résultant doit rester complet et de même type (identifiant inchangé).
    const p = patch as Record<string, unknown>;
    const current = objects.find(o => o.id === id) as unknown as Record<string, unknown>;
    if ('kind' in p && p.kind !== current.kind) return 'modification : le type d’un objet ne change pas';
    if ('id' in p && p.id !== id) return 'modification : l’identifiant ne change pas';
    const next = { ...current, ...p };
    if (layerIds && !(str(next.layerId) && layerIds.has(next.layerId as string))) return `modification : calque ${String(next.layerId)} absent`;
    // Un objet déjà incomplet (projet ancien) reste modifiable ; un objet complet ne peut pas le devenir moins.
    if (objectShapeError(current)) return null;
    return objectShapeError(next) ?? (referenceError(current, ctx) ? null : referenceError(next, ctx));
  },
  removeObject: ([id], { ids }) => (str(id) && ids.has(id as string) ? null : `objet ${String(id)} absent`),
  removeObjects: ([list], { ids }) => (!strs(list) ? 'liste d’identifiants attendue' : (list as string[]).find(i => !ids.has(i)) ? `objet ${(list as string[]).find(i => !ids.has(i))} absent` : null),
  transform: ([list, op], { ids }) => (!strs(list) ? 'liste d’identifiants attendue' : (list as string[]).find(i => !ids.has(i)) ? `objet ${(list as string[]).find(i => !ids.has(i))} absent` : transformError(op)),
  duplicateObjects: ([list, dx, dy], { ids }) => (!strs(list) || (list as string[]).some(i => !ids.has(i)) ? 'objets à dupliquer absents' : (dx !== undefined && !finite(dx)) || (dy !== undefined && !finite(dy)) ? 'décalage fini attendu' : null),
  addLayer: ([name]) => (str(name) ? null : 'nom de calque attendu'),
  addLevel: ([name, elevation]) => (str(name) && finite(elevation) ? null : 'nom et altitude attendus'),
  goTo: ([index]) => (Number.isInteger(index) && (index as number) >= 0 ? null : 'rang de version attendu'),
  setActiveLayerId: ([id]) => (str(id) ? null : 'identifiant de calque attendu'),
  setActiveLevelId: ([id]) => (str(id) ? null : 'identifiant de niveau attendu'),
  nameVersion: ([name]) => (str(name) ? null : 'nom de version attendu'),
  undo: args => (args.length === 0 ? null : 'annuler : sans argument'),
  redo: args => (args.length === 0 ? null : 'rétablir : sans argument'),
};

/** Commandes ouvertes aux scripts et à l'assistant : celles dont les arguments sont entièrement validés. */
export const SCRIPT_COMMANDS = Object.keys(VALIDATORS);

/** Refus d'une commande non ouverte aux scripts (sans validation complète de ses arguments). */
export const scriptCommandError = (type: string): string | null =>
  Object.prototype.hasOwnProperty.call(VALIDATORS, type) ? null : `commande non ouverte aux scripts « ${type} »`;

/**
 * Encodage JSON des arguments : `undefined` (champ retiré, argument facultatif) et `Map` gardés
 * sous une forme marquée ; une fonction ou un nombre non fini rend la commande non journalisable.
 */
export function encodeArgs(v: unknown): unknown {
  if (v === undefined) return { $undef: 1 };
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('nombre non fini'); return v; }
  if (typeof v === 'function') throw new Error('fonction en argument : utiliser une commande déclarative');
  if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [encodeArgs(k), encodeArgs(x)]) };
  if (Array.isArray(v)) return v.map(encodeArgs);
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error('objet non sérialisable');
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, encodeArgs(x)]));
  }
  throw new Error('argument non sérialisable');
}

export function decodeArgs(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeArgs);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.$undef === 1 && Object.keys(o).length === 1) return undefined;
    if (Array.isArray(o.$map) && Object.keys(o).length === 1) return new Map((o.$map as [unknown, unknown][]).map(([k, x]) => [decodeArgs(k), decodeArgs(x)]));
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decodeArgs(x)]));
  }
  return v;
}

/** Une commande est-elle valide (arguments journalisables et cohérents avec le projet) ? */
export function validateCommand(type: string, args: unknown[], objects: CadObject[], layers?: Pick<Layer, 'id'>[], project?: { levels?: { id: string }[]; blocks?: { id: string }[] }): string | null {
  try { encodeArgs(args); } catch (e) { return e instanceof Error ? e.message : String(e); }
  const v = VALIDATORS[type];
  const ids = (l: { id: string }[] | undefined) => (l ? new Set(l.map(x => x.id)) : undefined);
  return v ? v(args, { ids: new Set(objects.map(o => o.id)), objects, layerIds: ids(layers), levelIds: ids(project?.levels), blockIds: ids(project?.blocks) }) : null;
}

/** Empreinte comparable d'une version : contenu du projet, sans horodatage ni libellé. */
export function versionDigest(v: MicroVersion): string {
  const { seq: _s, label: _l, time: _t, named: _n, index: _i, ...content } = v;
  void _s; void _l; void _t; void _n; void _i;
  return JSON.stringify(content);
}
