// Poteaux et poutres (lot 13.4) : sections saisies par l'utilisateur, rectangulaires ou circulaires
// (aucun catalogue de profilés). En plan : poteau coupé (section pleine), poutre au-dessus du plan
// de coupe (deux traits interrompus aux nus). Fonctions pures ; millimètres.
import type { BeamObj, ColumnObj, PrimitiveObject } from '@/types/cad';

type Pt = { x: number; y: number };

export function columnError(c: Pick<ColumnObj, 'section' | 'b' | 'h' | 'd'>): string | null {
  if (c.section === 'circle') return c.d !== undefined && c.d > 0 && Number.isFinite(c.d) ? null : 'Poteau : diamètre positif attendu.';
  return c.b !== undefined && c.h !== undefined && c.b > 0 && c.h > 0 && Number.isFinite(c.b) && Number.isFinite(c.h) ? null : 'Poteau : largeur et profondeur positives attendues.';
}

export function beamError(b: Pick<BeamObj, 'x1' | 'y1' | 'x2' | 'y2' | 'b' | 'h'>): string | null {
  if (!(Math.hypot(b.x2 - b.x1, b.y2 - b.y1) > 0)) return 'Poutre : deux points distincts attendus.';
  return b.b > 0 && b.h > 0 && Number.isFinite(b.b) && Number.isFinite(b.h) ? null : 'Poutre : largeur et hauteur de section positives attendues.';
}

/** Aire de la section (mm²). */
export const columnSectionArea = (c: ColumnObj) => (c.section === 'circle' ? (Math.PI * c.d! * c.d!) / 4 : c.b! * c.h!);
export const beamLength = (b: BeamObj) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
/** Volume (m³) : section × longueur de la poutre, ou × hauteur saisie du poteau (null si non saisie). */
export const beamVolumeM3 = (b: BeamObj) => (b.b * b.h * beamLength(b)) / 1e9;
export const columnVolumeM3 = (c: ColumnObj) => (c.height !== undefined && c.height > 0 ? (columnSectionArea(c) * c.height) / 1e9 : null);

/** Coins de la section rectangulaire d'un poteau (centrée sur son point). */
export function columnCorners(c: ColumnObj): Pt[] {
  const b = c.b! / 2, h = c.h! / 2;
  return [{ x: c.x - b, y: c.y - h }, { x: c.x + b, y: c.y - h }, { x: c.x + b, y: c.y + h }, { x: c.x - b, y: c.y + h }];
}

/** Nus de la poutre : deux segments parallèles à l'axe, à ± b/2. */
export function beamEdges(o: BeamObj): [Pt, Pt][] {
  const l = beamLength(o), nx = (-(o.y2 - o.y1) / l) * (o.b / 2), ny = ((o.x2 - o.x1) / l) * (o.b / 2);
  return [[{ x: o.x1 + nx, y: o.y1 + ny }, { x: o.x2 + nx, y: o.y2 + ny }], [{ x: o.x1 - nx, y: o.y1 - ny }, { x: o.x2 - nx, y: o.y2 - ny }]];
}

/** Représentation 2D en primitives (dessin, désignation, DXF, PDF). */
export function structurePrimitives(o: ColumnObj | BeamObj): PrimitiveObject[] {
  const base = { ...o, kind: undefined } as unknown as Omit<PrimitiveObject, 'kind'>;
  if (o.kind === 'column') {
    // Poteau coupé par le plan de coupe : section pleine.
    if (o.section === 'circle') return [{ ...base, id: `${o.id}#0`, kind: 'circle', cx: o.x, cy: o.y, r: o.d! / 2, hatch: 'solid' } as PrimitiveObject];
    return [{ ...base, id: `${o.id}#0`, kind: 'polyline', points: [...columnCorners(o), columnCorners(o)[0]].flatMap(p => [p.x, p.y]), hatch: 'solid' } as PrimitiveObject];
  }
  // Poutre au-dessus du plan de coupe : nus en traits interrompus (sauf type de trait propre), extrémités comprises.
  const [a, b] = beamEdges(o);
  const line = (p: Pt, q: Pt, i: number) => ({ ...base, id: `${o.id}#${i}`, kind: 'line', x1: p.x, y1: p.y, x2: q.x, y2: q.y, hatch: 'none', lineType: o.lineType ?? 'interrompu' } as PrimitiveObject);
  return [line(a[0], a[1], 0), line(b[0], b[1], 1), line(a[0], b[0], 2), line(a[1], b[1], 3)];
}
