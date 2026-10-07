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
export function withProfile<T extends CadObject>(objects: T[], profile: DrawingProfile, context: ViewContext = 'coupe'): T[] {
  const shown = objects.map(o => {
    if (!o.materialId) return o;
    const hatch = effectiveHatch(o, profile, context);
    return hatch === o.hatch ? o : { ...o, hatch };
  });
  return context === 'coupe' ? alternateNeighbours(shown) : shown;
}

/**
 * Pièces voisines coupées (Conventions §4.2) : deux objets à matériau, hachés du même motif et qui
 * se touchent, reçoivent des hachures de sens différent (45° puis 135°), puis de pas différent si
 * les deux sens sont déjà pris. Un angle choisi à la main (hatchParams) n'est jamais modifié.
 */
export function alternateNeighbours<T extends CadObject>(objects: T[]): T[] {
  const cut = objects.filter(o => o.materialId && (o.hatch === 'diagonal' || o.hatch === 'cross') && !o.hatchParams && loopOf(o));
  if (cut.length < 2) return objects;
  // Contours grossiers pour le voisinage (cercle à 96 côtés) : tolérance relative au rayon.
  const loops = new Map(cut.map(o => [o.id, loopOf(o, 96)!]));
  const tol = (o: CadObject) => (o.kind === 'circle' ? Math.max(TOUCH_TOLERANCE, o.r * (1 - Math.cos(Math.PI / 96))) : TOUCH_TOLERANCE);
  const chosen = new Map<string, { angle: number; spacing: number }>();
  const variants = [{ angle: 45, spacing: 3 }, { angle: 135, spacing: 3 }, { angle: 45, spacing: 4.5 }, { angle: 135, spacing: 4.5 }];
  for (const o of cut) {
    const taken = cut
      .filter(n => n.id !== o.id && chosen.has(n.id) && n.hatch === o.hatch && loopsTouch(loops.get(o.id)!, loops.get(n.id)!, tol(o) + tol(n)))
      .map(n => chosen.get(n.id)!);
    const v = variants.find(c => !taken.some(t => t.angle === c.angle && t.spacing === c.spacing)) ?? variants[0];
    chosen.set(o.id, v);
  }
  return objects.map(o => {
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
