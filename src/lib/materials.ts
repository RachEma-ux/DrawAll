// Matériaux et profils de dessin (lot 3.1). Un matériau dit de quoi l'objet est fait ; un profil de
// dessin dit comment le représenter. Changer de profil change l'apparence, jamais le matériau.
// Les correspondances matériau → motif sont des usages (enseignement, entreprise), pas une norme :
// chaque profil porte sa version, sa source et son domaine (Conventions §4.3).
import type { BlockDef, CadObject, HatchStyle, PrimitiveObject } from '@/types/cad';
import { canHatch } from '@/types/cad';
import { loopOf, pointInLoop, type Loop } from '@/lib/hatch';

export interface Material {
  id: string;
  name: string;
  family: 'construction' | 'métal' | 'isolant' | 'autre';
}

/** Bibliothèque de base : noms seulement, aucune propriété physique ou réglementaire. */
export const MATERIALS: Material[] = [
  { id: 'beton', name: 'Béton', family: 'construction' },
  { id: 'beton-arme', name: 'Béton armé', family: 'construction' },
  { id: 'maconnerie', name: 'Maçonnerie', family: 'construction' },
  { id: 'bois', name: 'Bois', family: 'construction' },
  { id: 'terre', name: 'Terre, remblai', family: 'construction' },
  { id: 'acier', name: 'Acier', family: 'métal' },
  { id: 'aluminium', name: 'Aluminium', family: 'métal' },
  { id: 'isolant', name: 'Isolant', family: 'isolant' },
  { id: 'verre', name: 'Verre', family: 'autre' },
];

export const materialById = (id: string | undefined) => MATERIALS.find(m => m.id === id);

export interface DrawingProfile {
  id: string;
  name: string;
  version: string;
  /** Origine des correspondances (aucun profil n'est présenté comme une norme). */
  source: string;
  domain: string;
  /** Motif par matériau en coupe ; un matériau absent prend `fallback`. */
  patterns: Record<string, HatchStyle>;
  fallback: HatchStyle;
  /** Motif par matériau en vue (surface vue, non coupée) ; absent = aucun motif. */
  surface?: Record<string, HatchStyle>;
}

/** Contexte de représentation (Conventions §4.1) : objet coupé, ou surface vue. */
export type ViewContext = 'coupe' | 'vue';

export const PROFILES: DrawingProfile[] = [
  {
    id: 'neutre',
    name: 'Neutre',
    version: '1.0',
    source: 'DrawAll — profil par défaut, sans référence normative (décision du maître d’ouvrage en attente, §7).',
    domain: 'Tous domaines',
    patterns: {},
    fallback: 'diagonal',
  },
  {
    id: 'enseignement',
    name: 'Enseignement — usages courants',
    version: '1.0',
    source: 'Usages d’enseignement du dessin technique, non normatifs (ISO 4069:1977, retirée, ne fixait aucun motif par matériau).',
    domain: 'Bâtiment et mécanique, exercices',
    patterns: {
      beton: 'cross', 'beton-arme': 'cross', maconnerie: 'diagonal', bois: 'diagonal', terre: 'cross',
      acier: 'diagonal', aluminium: 'cross', isolant: 'none', verre: 'solid',
    },
    fallback: 'diagonal',
    surface: { verre: 'solid' },
  },
  {
    id: 'pleins',
    name: 'Plans de présentation — aplats',
    version: '1.0',
    source: 'Usage de présentation (rendus simplifiés), non normatif.',
    domain: 'Plans de présentation',
    patterns: {},
    fallback: 'solid',
  },
];

export const DEFAULT_PROFILE_ID = 'neutre';

export const profileById = (id: string | undefined) => PROFILES.find(p => p.id === id) ?? PROFILES.find(p => p.id === DEFAULT_PROFILE_ID)!;

/** Motif affiché d'un objet : celui que le profil associe à son matériau (selon le contexte), sinon son motif propre. */
export function effectiveHatch(o: Pick<CadObject, 'hatch' | 'materialId'>, profile: DrawingProfile, context: ViewContext = 'coupe'): HatchStyle {
  if (o.materialId && materialById(o.materialId)) {
    return context === 'coupe' ? profile.patterns[o.materialId] ?? profile.fallback : profile.surface?.[o.materialId] ?? 'none';
  }
  return o.hatch ?? 'none';
}

/**
 * Objets tels qu'il faut les dessiner ou les exporter avec ce profil : seul le motif affiché change ;
 * les objets d'origine (et leur matériau) ne sont pas modifiés.
 */
export function withProfile<T extends CadObject>(objects: T[], profile: DrawingProfile, context: ViewContext = 'coupe', blocks: BlockDef[] = []): T[] {
  const shown = objects.map(o => {
    if (!o.materialId) return o;
    const hatch = effectiveHatch(o, profile, context);
    return hatch === o.hatch ? o : { ...o, hatch };
  });
  return context === 'coupe' ? alternateNeighbours(shown, blocks) : shown;
}

/**
 * Pièces voisines coupées (Conventions §4.2) : deux pièces à matériau, hachées du même motif et qui
 * se touchent, reçoivent des hachures différentes :
 * - traits simples : sens différent (45° puis 135°), puis pas différent si les deux sens sont pris ;
 * - traits croisés : pas différent (une grille tournée de 90° est la même grille).
 * Une pièce dont les hachures sont réglées à la main garde ses paramètres et compte comme voisine
 * fixe. Les occurrences de blocs à matériau participent par les contours fermés de leur bloc.
 */
export function alternateNeighbours<T extends CadObject>(objects: T[], blocks: BlockDef[] = []): T[] {
  // Contours grossiers pour le voisinage (cercle à 96 côtés), dans le repère du modèle.
  const contours = (o: CadObject): Loop[] | null => {
    if (o.kind === 'blockRef') {
      const block = blocks.find(b => b.id === o.blockId);
      const loops = (block?.primitives ?? []).map(p => loopOf(p, 96)).filter((l): l is Loop => !!l).map(l => l.map(q => ({ x: o.x + q.x * o.scale, y: o.y + q.y * o.scale })));
      return loops.length ? loops : null;
    }
    const l = loopOf(o, 96);
    return l ? [l] : null;
  };
  // Écart du polygone de 96 côtés à un cercle : ajouté à la tolérance de contact.
  const chord = (r: number) => r * (1 - Math.cos(Math.PI / 96));
  const approx = (o: CadObject): number => {
    if (o.kind === 'circle') return chord(o.r);
    if (o.kind === 'blockRef') return Math.max(0, ...(blocks.find(b => b.id === o.blockId)?.primitives ?? []).map(p => (p.kind === 'circle' ? chord(p.r * o.scale) : 0)));
    return 0;
  };
  const pieces = objects
    .filter(o => o.materialId && (o.hatch === 'diagonal' || o.hatch === 'cross'))
    .map(o => ({ o, loops: contours(o), err: approx(o) }))
    .filter((p): p is { o: T; loops: Loop[]; err: number } => !!p.loops);
  if (pieces.length < 2) return objects;
  const touch = (a: (typeof pieces)[number], b: (typeof pieces)[number]) =>
    a.loops.some(la => b.loops.some(lb => loopsTouch(la, lb, TOUCH_TOLERANCE + a.err + b.err)));
  type Variant = { angle: number; spacing: number };
  // Deux variantes équivalentes : mêmes traits (angle à 180° près ; grille croisée à 90° près) et même pas.
  const key = (hatch: CadObject['hatch'], v: Variant) => (hatch === 'cross' ? `#${v.spacing}` : `${((v.angle % 180) + 180) % 180}:${v.spacing}`);
  const variants = (hatch: CadObject['hatch']): Variant[] => (hatch === 'cross'
    ? [3, 4.5, 6, 7.5].map(spacing => ({ angle: 45, spacing }))
    : [{ angle: 45, spacing: 3 }, { angle: 135, spacing: 3 }, { angle: 45, spacing: 4.5 }, { angle: 135, spacing: 4.5 }]);
  const chosen = new Map<string, Variant>();
  for (const p of pieces) if (p.o.hatchParams) chosen.set(p.o.id, { angle: p.o.hatchParams.angle, spacing: p.o.hatchParams.spacing });
  for (const p of pieces) {
    if (p.o.hatchParams) continue;
    const taken = pieces
      .filter(n => n !== p && chosen.has(n.o.id) && n.o.hatch === p.o.hatch && touch(p, n))
      .map(n => key(n.o.hatch, chosen.get(n.o.id)!));
    const options = variants(p.o.hatch);
    chosen.set(p.o.id, options.find(c => !taken.includes(key(p.o.hatch, c))) ?? options[0]);
  }
  return objects.map(o => {
    if (o.hatchParams) return o;
    const v = chosen.get(o.id);
    return v && (v.angle !== 45 || v.spacing !== 3) ? { ...o, hatchParams: { angle: v.angle, spacing: v.spacing, unit: 'papier' as const } } : o;
  });
}

const TOUCH_TOLERANCE = 0.01; // mm

/** Deux contours se touchent-ils (côté commun, croisement ou distance ≤ 0,01 mm) ? */
export function loopsTouch(a: Loop, b: Loop, tolerance = TOUCH_TOLERANCE): boolean {
  const box = (l: Loop) => l.reduce((r, p) => ({ minX: Math.min(r.minX, p.x), minY: Math.min(r.minY, p.y), maxX: Math.max(r.maxX, p.x), maxY: Math.max(r.maxY, p.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const ba = box(a), bb = box(b), t = tolerance;
  if (ba.maxX < bb.minX - t || bb.maxX < ba.minX - t || ba.maxY < bb.minY - t || bb.maxY < ba.minY - t) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j], s = b[(j + 1) % b.length];
      if (segmentDistance(p, q, r, s) <= t) return true;
    }
  }
  // Un contour entièrement dans l'autre se touche aussi (pièce encastrée).
  return pointInLoop(a[0], b) || pointInLoop(b[0], a);
}

function segmentDistance(p: Loop[number], q: Loop[number], r: Loop[number], s: Loop[number]): number {
  const cross = (o: Loop[number], a: Loop[number], b: Loop[number]) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cross(p, q, r), d2 = cross(p, q, s), d3 = cross(r, s, p), d4 = cross(r, s, q);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const pt = (x: Loop[number], a: Loop[number], b: Loop[number]) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x.x - a.x) * dx + (x.y - a.y) * dy) / l2)) : 0;
    return Math.hypot(x.x - (a.x + t * dx), x.y - (a.y + t * dy));
  };
  return Math.min(pt(p, r, s), pt(q, r, s), pt(r, p, q), pt(s, p, q));
}

/** Définitions de blocs telles qu'il faut les dessiner avec ce profil (motifs de leurs primitives). */
export function withProfileBlocks(blocks: BlockDef[], profile: DrawingProfile, context: ViewContext = 'coupe'): BlockDef[] {
  return blocks.map(b => (b.primitives.some(p => p.materialId) ? { ...b, primitives: withProfile(b.primitives, profile, context) } : b));
}

/**
 * Primitives d'une occurrence telles qu'elles se dessinent : un contour fermé sans matériau ni motif
 * propres prend la hachure de l'occurrence (motif que le profil donne au matériau de l'occurrence).
 */
export function occurrencePrimitives(block: BlockDef, ref: Pick<CadObject, 'hatch' | 'hatchParams'>): PrimitiveObject[] {
  if (!ref.hatch || ref.hatch === 'none') return block.primitives;
  return block.primitives.map(p => (!p.materialId && (p.hatch ?? 'none') === 'none' && canHatch(p)
    ? { ...p, hatch: ref.hatch, ...(ref.hatchParams ? { hatchParams: ref.hatchParams } : {}) } as PrimitiveObject
    : p));
}
