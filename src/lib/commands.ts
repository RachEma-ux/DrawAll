// API de commandes (lot 18.1) : chaque opération sur le projet est une commande nommée, aux
// arguments sérialisables (JSON), validée avant exécution et journalisée. La palette, l'interface et
// les scripts passent tous par elle (le magasin du projet n'expose que des commandes). Rejouer le
// journal depuis son état de base reproduit le projet. Fonctions pures.
import type { CadObject, MicroVersion } from '@/types/cad';
import { mirrorObject, moveObject, offsetObject, rotateObject, scaleObject } from './geometry';

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

/** Validateurs propres à certaines commandes (les autres : arguments sérialisables). */
const VALIDATORS: Record<string, (args: unknown[], ctx: { ids: Set<string> }) => string | null> = {
  addObject: ([o]) => (o && typeof o === 'object' && str((o as { kind?: unknown }).kind) ? null : 'objet à créer : type attendu'),
  updateObject: ([id, patch], { ids }) => (!str(id) ? 'identifiant attendu' : !ids.has(id as string) ? `objet ${String(id)} absent` : patch && typeof patch === 'object' ? null : 'modification attendue'),
  removeObject: ([id], { ids }) => (str(id) && ids.has(id as string) ? null : `objet ${String(id)} absent`),
  removeObjects: ([list], { ids }) => (!strs(list) ? 'liste d’identifiants attendue' : (list as string[]).find(i => !ids.has(i)) ? `objet ${(list as string[]).find(i => !ids.has(i))} absent` : null),
  transform: ([list, op], { ids }) => (!strs(list) ? 'liste d’identifiants attendue' : (list as string[]).find(i => !ids.has(i)) ? `objet ${(list as string[]).find(i => !ids.has(i))} absent` : transformError(op)),
  duplicateObjects: ([list, dx, dy], { ids }) => (!strs(list) || (list as string[]).some(i => !ids.has(i)) ? 'objets à dupliquer absents' : (dx !== undefined && !finite(dx)) || (dy !== undefined && !finite(dy)) ? 'décalage fini attendu' : null),
  addLayer: ([name]) => (str(name) ? null : 'nom de calque attendu'),
  addLevel: ([name, elevation]) => (str(name) && finite(elevation) ? null : 'nom et altitude attendus'),
  goTo: ([index]) => (Number.isInteger(index) && (index as number) >= 0 ? null : 'rang de version attendu'),
};

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
export function validateCommand(type: string, args: unknown[], objects: CadObject[]): string | null {
  try { encodeArgs(args); } catch (e) { return e instanceof Error ? e.message : String(e); }
  const v = VALIDATORS[type];
  return v ? v(args, { ids: new Set(objects.map(o => o.id)) }) : null;
}

/** Empreinte comparable d'une version : contenu du projet, sans horodatage ni libellé. */
export function versionDigest(v: MicroVersion): string {
  const { seq: _s, label: _l, time: _t, named: _n, index: _i, ...content } = v;
  void _s; void _l; void _t; void _n; void _i;
  return JSON.stringify(content);
}
