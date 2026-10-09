// API de commandes (lot 18.1) : chaque opération sur le projet est une commande nommée, aux
// arguments sérialisables (JSON), validée avant exécution et journalisée. La palette, l'interface et
// les scripts passent tous par elle (le magasin du projet n'expose que des commandes). Rejouer le
// journal depuis son état de base reproduit le projet. Fonctions pures.
import { CLASSIFICATION_META, KIND_LABEL, parentsOf, supportedDimensionStyles, withDependents, type CadObject, type CutObj, type DimensionStyle, type Layer, type MicroVersion, type OccurrenceObj, type OpeningObj, type RoofObj, type WallObj } from '@/types/cad';
import { mirrorObject, moveObject, offsetObject, rotateObject, scaleObject } from './geometry';
import { isMate, mateLoop, placeMate, type Mate } from './assembly';
import { isIfcClass, normalizePsets } from './properties';
import { isRecipe, recipeProfileError } from './solids';
import { isValidSpline, type SplineGeom } from './spline';
import { faceOf } from './views';
import { cutView } from './cuts';
import { roofError, roofInput } from './roof';
import { openingFits } from './opening';
import { containedContours } from './hatch';
import { levelIdOf, levelsOf } from './levels';
import { slabContour } from './slab';

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

/**
 * Transformation demandée par un script ou l'assistant : chaque objet désigné doit être modifiable
 * (calque non verrouillé, pas une cote associative ni un fond de plan verrouillé) et accepter
 * l'opération (un rectangle ne tourne que d'un quart de tour…). Sinon la commande ne ferait rien
 * pour lui, en silence. Une note jointe à un objet transformé le suit : elle n'est pas examinée.
 */
export function transformTargetsError(list: string[], op: TransformOp, objects: CadObject[], layers: (Pick<Layer, 'id'> & { locked?: boolean })[]): string | null {
  const f = applyTransform(op);
  const ids = new Set(list);
  for (const id of list) {
    const o = objects.find(x => x.id === id);
    if (!o || (o.kind === 'note' && o.targetId && ids.has(o.targetId))) continue;
    const why = layers.find(l => l.id === o.layerId)?.locked ? 'calque verrouillé'
      : o.kind === 'dimension' ? 'cote associative, elle suit sa cible'
      : o.kind === 'underlay' && o.locked ? 'fond de plan verrouillé'
      : f(o) ? null : 'opération impossible pour ce type d’objet';
    if (why) return `${id} non transformable (${why})`;
    // Modification vide : l'objet suit son parent (ouverture, occurrence…) ; seul, il ne bougerait pas.
    if (Object.keys(f(o)!).length === 0 && !parentsOf(o).some(p => ids.has(p))) return `${id} non transformable (il suit son parent ; transformer aussi ${parentsOf(o).join(', ') || 'son parent'})`;
    // L'objet transformé reste complet (une échelle infime arrondit ses dimensions à zéro…).
    const shape = objectShapeError(o as unknown as Record<string, unknown>) ? null : objectShapeError({ ...o, ...f(o) } as unknown as Record<string, unknown>);
    if (shape) return `${id} non transformable (${shape})`;
  }
  // Murs et ouvertures transformés : chaque ouverture concernée doit tenir dans son mur résultant.
  const moved = (o: CadObject) => (ids.has(o.id) ? ({ ...o, ...f(o) } as CadObject) : o);
  for (const op of objects) {
    if (op.kind !== 'opening') continue;
    const host = objects.find(w => w.id === op.hostId);
    if (host?.kind !== 'wall' || !(ids.has(op.id) || ids.has(host.id))) continue;
    const e = openingFits(moved(op) as OpeningObj, moved(host) as WallObj);
    if (e) return `${op.id} ne tiendrait plus dans ${host.id} (${e})`;
  }
  // Îlots de hachure : chaque îlot reste contenu dans son contour transformé (s'il l'était avant).
  const after = objects.map(moved);
  for (const o of objects) {
    if (!o.holes?.length || !(ids.has(o.id) || o.holes.some(h => ids.has(h)))) continue;
    const before = new Set(containedContours(o, objects));
    const inside = new Set(containedContours(moved(o), after));
    const bad = o.holes.find(h => before.has(h) && !inside.has(h));
    if (bad) return `${bad} ne serait plus un îlot de ${o.id} (hors du contour)`;
  }
  return null;
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
type Spec = { nums?: string[]; /** Dimensions : strictement positives (rayon, largeur, épaisseur…). */ pos?: string[]; strs?: string[]; /** Nombre minimal de points (x, y). */ points?: number; enums?: Record<string, readonly unknown[]>; /** Champs facultatifs : forme exigée s'ils sont présents. */ opt?: Record<string, Opt>; extra?: (o: Record<string, unknown>) => string | null };
type Opt = 'num' | 'pos' | 'nonneg' | 'str' | 'bool' | 'strs' | readonly string[];
const OPT_LABEL: Record<string, string> = { num: 'numérique fini', pos: 'positif', nonneg: 'positif ou nul', str: 'texte', bool: 'booléen', strs: 'liste d’identifiants' };
const optOk = (v: unknown, t: Opt) => (Array.isArray(t) ? t.includes(v as string) : t === 'num' ? finite(v) : t === 'pos' ? positive(v) : t === 'nonneg' ? finite(v) && (v as number) >= 0 : t === 'str' ? str(v) : t === 'bool' ? typeof v === 'boolean' : strs(v));
/** Champs requis de chaque type d'objet (tous les types de KIND_LABEL : un type sans fiche est refusé). */
/** Segment de deux points distincts (mur, repère de coupe) : sinon aucune géométrie. */
const distinct = (what: string) => (o: Record<string, unknown>) => (Math.hypot((o.x2 as number) - (o.x1 as number), (o.y2 as number) - (o.y1 as number)) > 0 ? null : `${what} : deux points distincts attendus`);
/** Tolérance d'une cote : variante connue et valeurs de la variante. */
function toleranceError(t: unknown): string | null {
  const x = t as Record<string, unknown> | null;
  if (!x || typeof x !== 'object') return 'cote : tolérance mal formée';
  if (x.kind === 'symetrique') return finite(x.value) && (x.value as number) >= 0 ? null : 'cote : tolérance symétrique positive ou nulle attendue';
  if (x.kind === 'ecarts') return finite(x.upper) && finite(x.lower) ? null : 'cote : écarts supérieur et inférieur numériques attendus';
  if (x.kind === 'classe') return str(x.cls) ? null : 'cote : classe ISO attendue';
  if (x.kind === 'ajustement') return str(x.hole) && str(x.shaft) ? null : 'cote : alésage et arbre attendus';
  return 'cote : tolérance parmi symetrique, ecarts, classe, ajustement attendue';
}
const SPECS: Record<string, Spec> = {
  line: { nums: ['x1', 'y1', 'x2', 'y2'] },
  rect: { nums: ['x', 'y'], pos: ['w', 'h'] },
  circle: { nums: ['cx', 'cy'], pos: ['r'] },
  arc: { nums: ['cx', 'cy', 'start', 'end'], pos: ['r'] },
  ellipse: { nums: ['cx', 'cy', 'rotation'], pos: ['rx', 'ry'], opt: { start: 'num', end: 'num' }, extra: o => ((o.start === undefined) !== (o.end === undefined) ? 'ellipse : début et fin d’arc ensemble' : null) },
  spline: { opt: { closed: 'bool' },
    nums: ['degree'], points: 2,
    // Nœuds et poids facultatifs : listes de nombres finis ; la spline doit être évaluable (degré, nœuds croissants, poids positifs).
    extra: o => {
      if (o.knots !== undefined && !(Array.isArray(o.knots) && o.knots.every(finite))) return 'spline : nœuds (liste de nombres) attendus';
      if (o.weights !== undefined && !(Array.isArray(o.weights) && o.weights.every(finite))) return 'spline : poids (liste de nombres) attendus';
      return isValidSpline(o as unknown as SplineGeom) ? null : 'spline : degré, nœuds ou poids incohérents';
    },
  },
  polyline: { points: 2, opt: { vids: 'strs' } },
  dimension: { opt: { radialMode: ['rayon', 'diametre'] }, nums: ['offset'], strs: ['targetId'], enums: { style: ['horizontal', 'vertical', 'aligned', 'radial'] }, extra: o => (o.tolerance === undefined ? null : toleranceError(o.tolerance)) },
  pdim: { opt: { reference: 'num' },
    nums: ['offset'], points: 1, enums: { mode: ['chain', 'baseline', 'angular', 'level'], axis: ['horizontal', 'vertical', 'aligned'] },
    // Points requis selon le mode : 1 pour un niveau, 2 pour une chaîne ou une ligne de base, 3 pour un angle.
    extra: o => { const need = { level: 1, chain: 2, baseline: 2, angular: 3 }[o.mode as string] ?? 1; return (o.points as unknown[]).length >= 2 * need ? null : `pdim : ${need} points au moins pour le mode ${String(o.mode)}`; },
  },
  blockRef: { nums: ['x', 'y'], pos: ['scale'], strs: ['blockId'] },
  text: { nums: ['x', 'y', 'rotation'], pos: ['height'], strs: ['content'], enums: { align: ['left', 'center', 'right'] } },
  wall: { nums: ['x1', 'y1', 'x2', 'y2'], pos: ['thickness'], enums: { justification: ['axe', 'gauche', 'droite'] }, extra: o => (o.height !== undefined && !positive(o.height) ? 'mur : hauteur positive attendue' : distinct('mur')(o)) },
  opening: { nums: ['position'], pos: ['width'], strs: ['hostId'], enums: { type: ['porte', 'fenetre'] }, extra: o => (o.type === 'porte' && !(['debut', 'fin'].includes(o.hinge as string) && ['gauche', 'droite'].includes(o.side as string)) ? 'porte : charnière (debut, fin) et côté (gauche, droite) attendus' : o.height !== undefined && !positive(o.height) ? 'ouverture : hauteur positive attendue' : o.sill !== undefined && !(finite(o.sill) && (o.sill as number) >= 0) ? 'ouverture : allège positive ou nulle attendue' : null) },
  room: { nums: ['x', 'y'], opt: { zoneId: 'str' } },
  // Contour d'aire non nulle, comme dans l'atelier (sinon volume vide et profil IFC nul).
  slab: { opt: { roomId: 'str' }, pos: ['thickness'], points: 3, extra: o => (slabContour(o.points as number[]) ? null : 'dalle : contour d’aire nulle (au moins trois sommets non alignés)') },
  roof: { nums: ['x', 'y', 'pitch', 'overhang'], pos: ['w', 'h'], enums: { roofType: ['un-pan', 'deux-pans', 'quatre-pans'], axis: ['x', 'y'] }, extra: o => (o.highSide !== undefined && o.highSide !== 'min' && o.highSide !== 'max' ? 'toiture : côté haut min ou max attendu' : roofError(roofInput(o as unknown as RoofObj))) },
  column: { opt: { height: 'pos' },
    nums: ['x', 'y'], enums: { section: ['rect', 'circle'] },
    // Dimensions selon la section : b × h pour un poteau rectangulaire, d pour un poteau circulaire.
    extra: o => (o.section === 'rect' ? (positive(o.b) && positive(o.h) ? null : 'poteau rectangulaire : b et h positifs attendus') : positive(o.d) ? null : 'poteau circulaire : diamètre d positif attendu'),
  },
  beam: { nums: ['x1', 'y1', 'x2', 'y2'], pos: ['b', 'h'], extra: o => (Math.hypot((o.x2 as number) - (o.x1 as number), (o.y2 as number) - (o.y1 as number)) > 0 ? null : 'poutre : deux points distincts attendus') },
  solid: {
    extra: o => {
      if (!isRecipe(o.recipe)) return 'solide : recette attendue';
      // Contours constructibles par le noyau, comme dans l'atelier (aire non nulle, sans recoupement).
      const prof = recipeProfileError(o.recipe);
      if (prof) return `solide : ${prof}`;
      // Définition de pièce (facultative) : numéro, origine (x, y, z) et angle finis.
      const d = o.partDef as { no?: unknown; origin?: unknown; angle?: unknown } | undefined;
      if (d === undefined) return null;
      const ok = !!d && typeof d === 'object' && Number.isInteger(d.no) && (d.no as number) > 0 && Array.isArray(d.origin) && d.origin.length === 3 && d.origin.every(finite) && finite(d.angle);
      return ok ? null : 'solide : définition de pièce mal formée (numéro entier positif, origine x y z, angle)';
    },
  },
  occurrence: { nums: ['x', 'y', 'z', 'angle'], strs: ['sourceId'] },
  projection: { nums: ['x', 'y'], strs: ['sourceId'], enums: { view: ['dessus', 'face', 'cote'] } },
  elevation: { opt: { markId: 'str' }, nums: ['x', 'y'], enums: { view: ['nord', 'sud', 'est', 'ouest', 'coupe'] }, extra: o => (o.view === 'coupe' && !str(o.markId) ? 'façade : repère de coupe attendu' : null) },
  north: { nums: ['x', 'y', 'rotation'] },
  section: { opt: { flip: 'bool' }, nums: ['x1', 'y1', 'x2', 'y2'], strs: ['label'], extra: distinct('repère de coupe') },
  levelMark: { nums: ['x', 'y', 'elevation'] },
  roughness: { opt: { ra: 'pos' }, nums: ['x', 'y', 'rotation'], enums: { process: ['quelconque', 'enlevement', 'sans-enlevement'] } },
  views: { opt: { method: ['premier-diedre', 'troisieme-diedre'] }, nums: ['gap'], pos: ['depth'], strs: ['sourceId'], extra: o => (typeof o.top === 'boolean' && typeof o.side === 'boolean' && (o.top || o.side) ? null : 'vues : dessus et côté (booléens), l’un au moins demandé') },
  cut: { opt: { method: ['premier-diedre', 'troisieme-diedre'] }, nums: ['gap'], pos: ['depth'], strs: ['sourceId', 'markId'] },
  bom: { nums: ['x', 'y'], extra: o => (o.table === undefined || ['pieces', 'ouvertures', 'murs', 'assemblage'].includes(o.table as string) ? null : 'tableau : type parmi pieces, ouvertures, murs, assemblage attendu') },
  balloon: { nums: ['x', 'y'], strs: ['targetId'] },
  underlay: { opt: { locked: 'bool' }, nums: ['x', 'y', 'opacity'], pos: ['w', 'h'], strs: ['assetId'], extra: o => ((o.opacity as number) >= 0 && (o.opacity as number) <= 1 ? null : 'fond de plan : opacité entre 0 et 1 attendue') },
  note: { nums: ['x', 'y', 'time'], extra: o => (typeof o.text !== 'string' ? 'note : texte attendu' : o.photoIds !== undefined && !strs(o.photoIds) ? 'note : photos (liste d’identifiants) attendues' : null) },
};

const HATCHES = ['none', 'diagonal', 'cross', 'solid'];

export function objectShapeError(o: Record<string, unknown>): string | null {
  const kind = o.kind as string;
  const spec = SPECS[kind];
  if (!spec) return `type d’objet inconnu « ${String(kind)} »`;
  // Champs communs : classification connue (couleurs métier), hachure permise, désignations textuelles.
  if (!Object.prototype.hasOwnProperty.call(CLASSIFICATION_META, o.classification as string)) return `${kind} : classification parmi ${Object.keys(CLASSIFICATION_META).join(', ')} attendue`;
  if (o.hatch !== undefined && !HATCHES.includes(o.hatch as string)) return `${kind} : hachure parmi ${HATCHES.join(', ')} attendue`;
  // Nom : texte (les exports l'écrivent tel quel, IFC compris).
  if (o.name !== undefined && typeof o.name !== 'string') return `${kind} : nom (texte) attendu`;
  for (const k of ['part', 'materialId', 'groupId']) if (o[k] !== undefined && !str(o[k])) return `${kind} : ${k} texte attendu`;
  // Trait propre à l'objet (couleur, type, épaisseur) et hachures : formes permises ; classe IFC connue.
  if (o.color !== undefined && !str(o.color)) return `${kind} : couleur (texte) attendue`;
  if (o.lineType !== undefined && !['continu', 'interrompu', 'mixte', 'mixte-double'].includes(o.lineType as string)) return `${kind} : type de trait parmi continu, interrompu, mixte, mixte-double attendu`;
  if (o.lineWeight !== undefined && !positive(o.lineWeight)) return `${kind} : épaisseur de trait positive attendue`;
  if (o.hatchParams !== undefined) {
    const h = o.hatchParams as Record<string, unknown> | null;
    const ok = !!h && typeof h === 'object' && finite(h.angle) && positive(h.spacing) && (h.unit === 'papier' || h.unit === 'modele') && (h.originX === undefined || finite(h.originX)) && (h.originY === undefined || finite(h.originY));
    if (!ok) return `${kind} : paramètres de hachure mal formés (angle, pas positif, unité papier ou modèle)`;
  }
  if (o.ifcClass !== undefined && !isIfcClass(o.ifcClass)) return `${kind} : classe IFC inconnue`;
  // Trous (contours intérieurs) : liste d'identifiants (leur présence est vérifiée avec les références).
  if (o.holes !== undefined && !strs(o.holes)) return `${kind} : trous (liste d’identifiants) attendus`;
  // Jeux de propriétés : la forme que la relecture d'un projet garde telle quelle (export IFC).
  if (o.psets !== undefined && !(Array.isArray(o.psets) && JSON.stringify(normalizePsets(o.psets) ?? []) === JSON.stringify(o.psets))) return `${kind} : jeux de propriétés mal formés (nom, propriétés nommées, valeurs texte, nombre ou booléen)`;
  for (const k of spec.nums ?? []) if (!finite(o[k])) return `${kind} : ${k} numérique fini attendu`;
  for (const k of spec.pos ?? []) if (!positive(o[k])) return `${kind} : ${k} positif attendu`;
  for (const k of spec.strs ?? []) if (!str(o[k])) return `${kind} : ${k} attendu`;
  for (const [k, values] of Object.entries(spec.enums ?? {})) if (!values.includes(o[k])) return `${kind} : ${k} parmi ${values.join(', ')} attendu`;
  for (const [k, t] of Object.entries(spec.opt ?? {})) if (o[k] !== undefined && !optOk(o[k], t)) return `${kind} : ${k} ${Array.isArray(t) ? `parmi ${t.join(', ')}` : OPT_LABEL[t as string]} attendu`;
  if (spec.points) {
    const p = o.points;
    if (!Array.isArray(p) || p.length < 2 * spec.points || p.length % 2 !== 0 || !p.every(finite)) return `${kind} : liste de points (x, y) finie attendue`;
  }
  return spec.extra?.(o) ?? null;
}

/** Type attendu de l'objet désigné, pour les références typées (ouverture → mur, occurrence → pièce…). */
const REF_KIND: Partial<Record<string, string>> = { opening: 'wall', occurrence: 'solid', projection: 'solid' };

type Ctx = { ids: Set<string>; objects: CadObject[]; layerIds?: Set<string>; lockedLayerIds?: Set<string>; levelIds?: Set<string>; blockIds?: Set<string>; zoneIds?: Set<string>; versions?: number; partMarks?: Map<number, string[]>; activeLevelId?: string };

/**
 * Références d'un objet : niveau, définition de bloc, objets désignés (parent, repère de coupe, cible
 * d'une liaison) présents et du bon type. Un objet orphelin serait enregistré sans être jamais dessiné.
 */
function referenceError(o: Record<string, unknown>, { objects, levelIds, blockIds, zoneIds, partMarks, activeLevelId }: Ctx): string | null {
  const kind = o.kind as string;
  if (o.levelId !== undefined && levelIds && !(str(o.levelId) && levelIds.has(o.levelId as string))) return `${kind} : niveau ${String(o.levelId)} absent`;
  if (kind === 'blockRef' && blockIds && !blockIds.has(o.blockId as string)) return `blockRef : bloc ${String(o.blockId)} absent`;
  if (kind === 'room' && o.zoneId !== undefined && zoneIds && !(str(o.zoneId) && zoneIds.has(o.zoneId as string))) return `room : zone ${String(o.zoneId)} absente`;
  const byId = new Map(objects.map(x => [x.id, x]));
  const c = o as unknown as CadObject;
  const refs = parentsOf(c);
  for (const r of refs) {
    const target = byId.get(r);
    if (!target) return `${kind} : objet désigné ${r} absent`;
    const want = r === (o as { markId?: unknown }).markId ? 'section' : REF_KIND[kind];
    if (want && target.kind !== want) return `${kind} : ${r} n’est pas un objet de type ${want}`;
  }
  const hole = (o.holes as string[] | undefined)?.find(h => !byId.has(h));
  if (hole) return `${kind} : trou ${hole} absent`;
  // Îlots : contours fermés contenus dans l'objet, comme dans l'inspecteur (ni lui-même ni un contour extérieur).
  if ((o.holes as string[] | undefined)?.length) {
    const inside = new Set(containedContours(c, objects));
    const bad = (o.holes as string[]).find(h => h === o.id || !inside.has(h));
    if (bad) return `${kind} : îlot ${bad} hors du contour (contour fermé contenu dans l’objet attendu)`;
  }
  // Repère de pièce unique sur toutes les variantes (la nomenclature n'a pas deux lignes de même repère).
  const no = (o.partDef as { no?: unknown } | undefined)?.no;
  if (kind === 'solid' && typeof no === 'number') {
    const holders = partMarks?.get(no) ?? objects.filter(x => x.kind === 'solid' && x.partDef?.no === no).map(x => x.id);
    const other = holders.find(h => h !== o.id);
    if (other) return `solide : repère de pièce ${no} déjà pris par ${other}`;
  }
  // Occurrence : sa source est une pièce (solide défini comme pièce), sinon elle n'aurait aucune géométrie.
  if (kind === 'occurrence') { const src = byId.get(o.sourceId as string); if (src?.kind === 'solid' && !src.partDef) return `occurrence : ${src.id} n’est pas une pièce (définir la pièce d’abord)`; }
  // Coupe : évaluable comme dans l'atelier (contour fermé, repère, profondeur).
  if (kind === 'cut') { const r = cutView(o as unknown as CutObj, byId.get(o.sourceId as string), byId.get(o.markId as string), objects, 1, 1); if (!r.ok) return `coupe : ${r.error}`; }
  // Vues liées : la source doit offrir une face fermée.
  if (kind === 'views') { const src = byId.get(o.sourceId as string); if (src && !faceOf(src, objects)) return `vues : ${src.id} n’offre pas de face fermée`; }
  // Ouverture : elle tient dans son mur, comme à la pose dans l'atelier, et sur le même niveau.
  if (kind === 'opening') {
    const w = byId.get(o.hostId as string);
    const e = w?.kind === 'wall' ? openingFits(o as unknown as OpeningObj, w) : null;
    if (e) return `ouverture : ${e}`;
    // Niveau de l'ouverture : le sien, sinon (création sans niveau) le niveau actif où elle sera posée.
    const level = (o.levelId as string | undefined) ?? (o.id === undefined ? activeLevelId : undefined);
    if (w && levelIdOf({ levelId: level }) !== levelIdOf(w)) return `ouverture : niveau ${levelIdOf({ levelId: level })} différent de celui du mur ${w.id} (${levelIdOf(w)})`;
  }
  // Cote : la cible accepte ce style (ligne, rectangle, polyligne, cercle ou arc).
  if (kind === 'dimension') {
    const t = byId.get(o.targetId as string);
    const styles = t ? supportedDimensionStyles(t) : [];
    if (t && !styles.length) return `cote : ${t.id} ne se cote pas`;
    if (t && !styles.includes(o.style as DimensionStyle)) return `cote : style ${String(o.style)} non pris en charge par ${t.id} (${styles.join(', ')})`;
  }
  const mate = (o as { mate?: unknown }).mate as { to?: unknown } | undefined;
  if (kind === 'occurrence' && mate !== undefined) {
    // Liaison complète (type, faces, cible) avant de la résoudre.
    if (!isMate(mate)) return 'occurrence : liaison mal formée (type, faces et cible attendus)';
    // Cible : une autre occurrence ou une pièce (solide défini comme pièce), comme dans l'atelier.
    const target = byId.get(mate.to as string);
    if (!(target?.kind === 'occurrence' || (target?.kind === 'solid' && !!target.partDef))) return `occurrence : liaison vers ${String(mate.to)} absente`;
    // Liaison réalisable (faces existantes et compatibles), comme dans l'atelier : sinon elle serait
    // enregistrée sans jamais placer l'occurrence.
    const self = { ...c, id: (o.id as string | undefined) ?? '__nouvelle__' } as CadObject;
    // Pas de liaison sur soi-même ni de cycle (A → B → A) : aucune ne pourrait être résolue.
    const after = [...objects.filter(x => x.id !== self.id), self];
    if (mateLoop(self.id, mate.to as string, after)) return `occurrence : liaison en boucle (${self.id} dépend de lui-même)`;
    const placed = placeMate(self as OccurrenceObj, mate as Mate, after);
    if ('error' in placed) return `occurrence : liaison impossible (${placed.error})`;
  }
  return null;
}

/** Toutes les fiches existent (vérifié par les tests) : chaque type connu est validé. */
export const OBJECT_SPEC_KINDS = Object.keys(SPECS);

/**
 * Validateurs propres à certaines commandes (les autres : arguments sérialisables). Seules les
 * commandes validées ici sont ouvertes aux scripts et à l'assistant (`scriptCommandError`) :
 * l'interface ne passe que des arguments bien formés, un script peut passer n'importe quoi.
 */
/** Suppression : un objet d'un calque verrouillé est intouchable, comme dans l'atelier. */
function lockedError(ids: string[], { objects, lockedLayerIds }: Ctx): string | null {
  if (!lockedLayerIds?.size) return null;
  // Les objets associatifs (ouverture, cote, occurrence, note…) partent avec leur parent : eux aussi.
  const asked = new Set(ids);
  const all = withDependents(objects, ids);
  const o = objects.find(x => all.has(x.id) && lockedLayerIds.has(x.layerId));
  return o ? `suppression : ${o.id}${asked.has(o.id) ? '' : ' (emporté avec son parent)'} sur le calque ${o.layerId} verrouillé` : null;
}

const VALIDATORS: Record<string, (args: unknown[], ctx: Ctx) => string | null> = {
  addObject: ([o], ctx) => {
    const { layerIds } = ctx;
    const n = o as { kind?: unknown; layerId?: unknown } | null;
    if (!n || typeof n !== 'object' || !str(n.kind)) return 'objet à créer : type attendu';
    if (!Object.prototype.hasOwnProperty.call(KIND_LABEL, n.kind as string)) return `type d’objet inconnu « ${String(n.kind)} »`;
    if (layerIds && !(str(n.layerId) && layerIds.has(n.layerId as string))) return `objet à créer : calque ${String(n.layerId)} absent`;
    if (ctx.lockedLayerIds?.has(n.layerId as string)) return `objet à créer : calque ${String(n.layerId)} verrouillé`;
    // L'identifiant est attribué par le magasin : un identifiant fourni n'entre pas dans la validation
    // (il ne doit pas faire passer l'objet pour celui qu'il désigne, ex. détenteur d'un repère de pièce).
    const { id: _id, ...fresh } = n as Record<string, unknown>;
    void _id;
    // Solide STEP : seul l'import (qui le fait relire par le noyau) en crée ; un script ne peut pas en fournir.
    if (hasStep(fresh.recipe)) return 'solide : recette STEP réservée à l’import (Fichier › Importer STEP)';
    return objectShapeError(fresh) ?? referenceError(fresh, ctx);
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
    if ('recipe' in p && hasStep(p.recipe) && JSON.stringify(p.recipe) !== JSON.stringify(current.recipe)) return 'modification : recette STEP réservée à l’import (Fichier › Importer STEP)';
    // Objet d'un calque verrouillé : intouchable, comme dans l'atelier.
    if (ctx.lockedLayerIds?.has(current.layerId as string)) return `modification : calque ${String(current.layerId)} verrouillé`;
    // Fond de plan verrouillé : seul son déverrouillage est permis.
    if (current.kind === 'underlay' && current.locked === true && Object.keys(p).some(k => k !== 'locked')) return `modification : fond de plan ${String(id)} verrouillé`;
    const next = { ...current, ...p };
    if (layerIds && !(str(next.layerId) && layerIds.has(next.layerId as string))) return `modification : calque ${String(next.layerId)} absent`;
    if (ctx.lockedLayerIds?.has(next.layerId as string)) return `modification : calque ${String(next.layerId)} verrouillé`;
    // Mur hôte modifié (raccourci…) : ses ouvertures doivent y tenir encore.
    if (current.kind === 'wall' && next.kind === 'wall') {
      for (const op of objects) {
        if (op.kind !== 'opening' || op.hostId !== id) continue;
        const e = openingFits(op, next as unknown as WallObj);
        if (e) return `modification : ${op.id} ne tiendrait plus dans ${String(id)} (${e})`;
      }
    }
    // Pièce ou occurrence modifiée : les liaisons qui s'y appuient doivent rester réalisables (faces nommées).
    if (current.kind === 'solid' || current.kind === 'occurrence') {
      const after = objects.map(o => (o.id === id ? (next as unknown as CadObject) : o));
      for (const o of objects) {
        if (o.kind !== 'occurrence' || !o.mate || o.mate.type === 'fixe' || o.id === id) continue;
        if ('error' in placeMate(o, o.mate, objects)) continue;
        const r = placeMate(o, o.mate, after);
        if ('error' in r) return `modification : la liaison de ${o.id} deviendrait impossible (${r.error})`;
      }
    }
    // Pièce dont dépendent des occurrences (source ou cible de liaison) : elle reste une pièce.
    if (current.kind === 'solid' && current.partDef && !next.partDef) {
      const user = objects.find(o => o.kind === 'occurrence' && (o.sourceId === id || o.mate?.to === id));
      if (user) return `modification : ${String(id)} reste une pièce, ${user.id} en dépend`;
    }
    // Un objet déjà incomplet (projet ancien) reste modifiable ; un objet complet ne peut pas le devenir moins.
    if (objectShapeError(current)) return null;
    return objectShapeError(next) ?? (referenceError(current, ctx) ? null : referenceError(next, ctx));
  },
  removeObject: ([id], ctx) => (str(id) && ctx.ids.has(id as string) ? lockedError([id as string], ctx) : `objet ${String(id)} absent`),
  removeObjects: ([list], ctx) => {
    if (!strs(list)) return 'liste d’identifiants attendue';
    const ids = list as string[];
    const missing = ids.find(i => !ctx.ids.has(i));
    if (missing) return `objet ${missing} absent`;
    return lockedError(ids, ctx);
  },
  transform: ([list, op], { ids }) => (!strs(list) ? 'liste d’identifiants attendue' : (list as string[]).find(i => !ids.has(i)) ? `objet ${(list as string[]).find(i => !ids.has(i))} absent` : transformError(op)),
  duplicateObjects: ([list, dx, dy], ctx) => {
    if (!strs(list) || (list as string[]).some(i => !ctx.ids.has(i))) return 'objets à dupliquer absents';
    if ((dx !== undefined && !finite(dx)) || (dy !== undefined && !finite(dy))) return 'décalage fini attendu';
    // Objet d'un calque verrouillé : la copie ne serait pas faite (comme dans l'atelier).
    const locked = ctx.objects.find(o => (list as string[]).includes(o.id) && ctx.lockedLayerIds?.has(o.layerId));
    return locked ? `duplication : ${locked.id} sur le calque ${locked.layerId} verrouillé` : null;
  },
  addLayer: ([name]) => (str(name) ? null : 'nom de calque attendu'),
  addLevel: ([name, elevation]) => (str(name) && finite(elevation) ? null : 'nom et altitude attendus'),
  goTo: ([index], { versions }) => (!(Number.isInteger(index) && (index as number) >= 0) ? 'rang de version attendu' : versions !== undefined && (index as number) >= versions ? `version ${String(index)} absente (${versions} version${versions > 1 ? 's' : ''})` : null),
  // Calque et niveau désignés : existants (le changement serait sinon ignoré sans le dire).
  setActiveLayerId: ([id], { layerIds, lockedLayerIds }) => (!str(id) ? 'identifiant de calque attendu' : layerIds && !layerIds.has(id as string) ? `calque ${String(id)} absent` : lockedLayerIds?.has(id as string) ? `calque ${String(id)} verrouillé` : null),
  setActiveLevelId: ([id], { levelIds }) => (!str(id) ? 'identifiant de niveau attendu' : levelIds && !levelIds.has(id as string) ? `niveau ${String(id)} absent` : null),
  nameVersion: ([name]) => (str(name) ? null : 'nom de version attendu'),
  undo: args => (args.length === 0 ? null : 'annuler : sans argument'),
  redo: args => (args.length === 0 ? null : 'rétablir : sans argument'),
};

/**
 * Arguments facultatifs des commandes ouvertes aux scripts, au-delà de ceux que leur validateur
 * contrôle : nombre d'arguments admis et rang des arguments facultatifs de type texte (nom, libellé).
 */
const SCRIPT_ARGS: Record<string, { max: number; texts?: number[] }> = {
  addObject: { max: 3, texts: [1, 2] },
  updateObject: { max: 3, texts: [2] },
  removeObject: { max: 1 }, removeObjects: { max: 1 },
  transform: { max: 3, texts: [2] },
  duplicateObjects: { max: 3 },
  addLayer: { max: 1 }, addLevel: { max: 2 }, setActiveLayerId: { max: 1 }, setActiveLevelId: { max: 1 },
  nameVersion: { max: 1 }, goTo: { max: 1 }, undo: { max: 0 }, redo: { max: 0 },
};

/**
 * Refus d'une commande non ouverte aux scripts (sans validation complète de ses arguments), ou
 * appelée avec des arguments en trop ou mal typés.
 */
export function scriptCommandError(type: string, args: unknown[] = []): string | null {
  if (!Object.prototype.hasOwnProperty.call(VALIDATORS, type) || !SCRIPT_ARGS[type]) return `commande non ouverte aux scripts « ${type} »`;
  const { max, texts = [] } = SCRIPT_ARGS[type];
  if (args.length > max) return `${type} : ${max} argument${max > 1 ? 's' : ''} au plus`;
  const bad = texts.find(i => args[i] !== undefined && !str(args[i]));
  return bad === undefined ? null : `${type} : argument ${bad + 1} texte attendu`;
}

/** Commandes ouvertes aux scripts et à l'assistant : celles dont les arguments sont entièrement validés. */
export const SCRIPT_COMMANDS = Object.keys(VALIDATORS).filter(t => Object.prototype.hasOwnProperty.call(SCRIPT_ARGS, t));

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
/**
 * Références de chaque objet d'un état (niveau, bloc, zone, parent du bon type, pièce source,
 * liaison réalisable, ouverture dans son mur…) : identifiant → erreur. Sert à revalider un état
 * produit autrement que par une commande (fusion de variantes).
 */
export function referenceErrors(objects: CadObject[], project: { levels?: { id: string }[]; blocks?: { id: string }[]; zones?: { id: string }[] } = {}): Map<string, string> {
  const ids = (l: { id: string }[] | undefined) => (l ? new Set(l.map(x => x.id)) : undefined);
  const ctx: Ctx = { ids: new Set(objects.map(o => o.id)), objects, levelIds: ids(project.levels), blockIds: ids(project.blocks), zoneIds: ids(project.zones) };
  const out = new Map<string, string>();
  for (const o of objects) { const e = referenceError(o as unknown as Record<string, unknown>, ctx); if (e) out.set(o.id, e); }
  return out;
}

type StateLike = { objects?: CadObject[]; levels?: { id: string }[]; blocks?: { id: string }[]; zones?: { id: string }[] };
const refsOf = (v: StateLike) => referenceErrors(v.objects ?? [], { levels: levelsOf(v.levels as never), blocks: v.blocks ?? [], zones: v.zones ?? [] });

/** Fusion : refus si un objet fusionné a une référence en erreur qu'il n'avait dans aucune des deux variantes. */
export function mergedReferenceError(merged: StateLike, ours: StateLike, theirs: StateLike): string | null {
  const before = new Set([...refsOf(ours).keys(), ...refsOf(theirs).keys()]);
  const broken = [...refsOf(merged)].find(([id]) => !before.has(id));
  return broken ? `Fusion refusée : ${broken[1]}.` : null;
}

/** Une recette contient-elle un solide STEP importé (données non vérifiables sans le noyau) ? */
function hasStep(r: unknown, depth = 0): boolean {
  if (!r || typeof r !== 'object' || depth > 200) return false;
  const x = r as Record<string, unknown>;
  if (x.op === 'step') return true;
  return ['a', 'b', 'of'].some(k => hasStep(x[k], depth + 1)) || (Array.isArray(x.parts) && x.parts.some(p => hasStep(p, depth + 1)));
}

export function validateCommand(type: string, args: unknown[], objects: CadObject[], layers?: (Pick<Layer, 'id'> & { locked?: boolean })[], project?: { levels?: { id: string }[]; blocks?: { id: string }[]; zones?: { id: string }[]; versions?: number; partMarks?: Map<number, string[]>; activeLevelId?: string }): string | null {
  try { encodeArgs(args); } catch (e) { return e instanceof Error ? e.message : String(e); }
  const v = VALIDATORS[type];
  const ids = (l: { id: string }[] | undefined) => (l ? new Set(l.map(x => x.id)) : undefined);
  return v ? v(args, { ids: new Set(objects.map(o => o.id)), objects, layerIds: ids(layers), lockedLayerIds: layers ? new Set(layers.filter(l => l.locked).map(l => l.id)) : undefined, levelIds: ids(project?.levels), blockIds: ids(project?.blocks), zoneIds: ids(project?.zones), versions: project?.versions, partMarks: project?.partMarks, activeLevelId: project?.activeLevelId }) : null;
}

/** Empreinte comparable d'une version : contenu du projet, sans horodatage ni libellé. */
export function versionDigest(v: MicroVersion): string {
  const { seq: _s, label: _l, time: _t, named: _n, index: _i, ...content } = v;
  void _s; void _l; void _t; void _n; void _i;
  return JSON.stringify(content);
}
