// Coupes (lot 5.3) : vue en coupe d'une pièce prismatique (face + épaisseur) par le plan qu'indique un
// repère de coupe tracé sur la face (ISO 128-3). Le plan est perpendiculaire à la face et passe par la
// trace ; la vue montre les surfaces coupées hachurées (matière), les perçages comme des vides, et
// porte la désignation « A–A ». Elle est placée comme la vue projetée dans le sens des flèches du
// repère, selon la méthode de projection. Fonctions pures, repère du modèle (Y vers le bas), mm.
import type { CadObject, CutObj, ProjectionMethod, SectionMarkObj } from '@/types/cad';
import { hatchSegments, loopOf, type Loop } from '@/lib/hatch';

export type Seg = [number, number, number, number];
export interface Rect { x: number; y: number; w: number; h: number }
export interface CutGeometry {
  frame: Rect;
  /** Surfaces coupées (matière), une par intervalle de matière le long de la trace. */
  material: Rect[];
  visible: Seg[];
  hatch: Seg[];
  label: { x: number; y: number; text: string; below: boolean };
}
export type CutResult = { ok: true; value: CutGeometry } | { ok: false; error: string };

const EPS = 1e-6;

/** Abscisses (le long de l'axe libre) des intersections d'une droite x = c ou y = c avec un contour. */
function crossings(loop: Loop, axis: 'x' | 'y', c: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const [pa, pb, qa, qb] = axis === 'y' ? [a.y, b.y, a.x, b.x] : [a.x, b.x, a.y, b.y];
    // Demi-ouvert : un sommet sur la droite n'est compté qu'une fois.
    if ((pa <= c && c < pb) || (pb <= c && c < pa)) out.push(qa + ((c - pa) / (pb - pa)) * (qb - qa));
  }
  return out;
}

/** Contour pour la coupe : polygone, ou cercle exact (intersections calculées, non approchées). */
export type Shape = Loop | { cx: number; cy: number; r: number };

function shapeCrossings(s: Shape, axis: 'x' | 'y', c: number): number[] {
  if (Array.isArray(s)) return crossings(s, axis, c);
  const off = axis === 'y' ? c - s.cy : c - s.cx;
  if (Math.abs(off) >= s.r) return [];
  const h = Math.sqrt(s.r * s.r - off * off), m = axis === 'y' ? s.cx : s.cy;
  return [m - h, m + h];
}

export const shapeOf = (o: CadObject): Shape | null => (o.kind === 'circle' ? { cx: o.cx, cy: o.cy, r: o.r } : loopOf(o));

/** Intervalles de matière le long de la droite (règle pair-impair : contour et perçages). */
export function materialIntervals(loops: Shape[], axis: 'x' | 'y', c: number): [number, number][] {
  const xs = loops.flatMap(l => shapeCrossings(l, axis, c)).sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > EPS) out.push([xs[i], xs[i + 1]]);
  return out;
}

/**
 * Vue en coupe. `hatchSpacing` : pas des hachures dans le modèle (pas papier converti à l'échelle,
 * ou pas constant à l'écran) ; `textHeight` : hauteur de la désignation dans le modèle.
 */
export function cutView(o: CutObj, source: CadObject | undefined, mark: CadObject | undefined, objects: CadObject[], hatchSpacing: number, textHeight: number, method: ProjectionMethod = o.method ?? 'premier-diedre'): CutResult {
  if (!source) return { ok: false, error: `Face ${o.sourceId} absente.` };
  if (!mark || mark.kind !== 'section') return { ok: false, error: `Repère de coupe ${o.markId} absent.` };
  const outer = loopOf(source);
  if (!outer) return { ok: false, error: `${source.id} n'est pas un contour fermé.` };
  if (!(o.depth > 0)) return { ok: false, error: 'Épaisseur nulle.' };
  const holes = (source.holes ?? []).map(id => objects.find(x => x.id === id)).map(h => (h ? shapeOf(h) : null)).filter((l): l is Shape => !!l);
  const horizontal = Math.abs(mark.y2 - mark.y1) < EPS, vertical = Math.abs(mark.x2 - mark.x1) < EPS;
  if (!horizontal && !vertical) return { ok: false, error: 'Trace de coupe oblique : seules les traces horizontales ou verticales sont prises en charge.' };
  // Sens de la vue : à gauche de la trace parcourue (Y vers le bas), à droite si « inverser ».
  const dx = mark.x2 - mark.x1, dy = mark.y2 - mark.y1, L = Math.hypot(dx, dy);
  const side = (mark as SectionMarkObj).flip ? -1 : 1;
  const look = { x: (dy / L) * side, y: (-dx / L) * side };
  const xs = outer.map(p => p.x), ys = outer.map(p => p.y);
  const box = source.kind === 'circle'
    ? { minX: source.cx - source.r, maxX: source.cx + source.r, minY: source.cy - source.r, maxY: source.cy + source.r }
    : { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const d = o.depth, g = Math.max(0, o.gap);
  // Placement de la vue projetée dans le sens de la vue (premier dièdre : du côté opposé à
  // l'observateur, donc dans le sens des flèches ; troisième dièdre : du côté de l'observateur).
  const forward = method === 'premier-diedre' ? 1 : -1;
  const loops: Shape[] = [shapeOf(source)!, ...holes];
  const material: Rect[] = [];
  let frame: Rect;
  let below: boolean;
  if (horizontal) {
    const c = mark.y1;
    const towardsDown = look.y * forward > 0;
    const v0 = towardsDown ? box.maxY + g : box.minY - g - d;
    for (const [a, b] of materialIntervals(loops, 'y', c)) material.push({ x: a, y: v0, w: b - a, h: d });
    frame = { x: box.minX, y: v0, w: box.maxX - box.minX, h: d };
    below = towardsDown;
  } else {
    const c = mark.x1;
    const towardsRight = look.x * forward > 0;
    const u0 = towardsRight ? box.maxX + g : box.minX - g - d;
    for (const [a, b] of materialIntervals(loops, 'x', c)) material.push({ x: u0, y: a, w: d, h: b - a });
    frame = { x: u0, y: box.minY, w: d, h: box.maxY - box.minY };
    below = true;
  }
  if (material.length === 0) return { ok: false, error: 'La trace ne traverse pas la matière de la face.' };
  const visible: Seg[] = [];
  const hatch: Seg[] = [];
  for (const r of material) {
    visible.push([r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x + r.w, r.y + r.h, r.x, r.y + r.h], [r.x, r.y + r.h, r.x, r.y]);
    const loop = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
    hatch.push(...hatchSegments([loop], 45, hatchSpacing));
  }
  const text = `${mark.label || 'A'}–${mark.label || 'A'}`;
  const label = { x: frame.x + frame.w / 2, y: below ? frame.y + frame.h + textHeight * 1.6 : frame.y - textHeight * 0.6, text, below };
  return { ok: true, value: { frame, material, visible, hatch, label } };
}

/** Distance d'un point aux traits de la coupe (désignation). */
export function distanceToCut(g: CutGeometry, x: number, y: number): number {
  let d = Infinity;
  for (const r of g.material) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return 0;
  }
  for (const [x1, y1, x2, y2] of g.visible) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
    d = Math.min(d, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return d;
}
