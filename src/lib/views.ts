// Vues liées (lot 5.2) : vue de dessus et vue de côté d'une pièce prismatique (extrusion de sa vue de
// face sur l'épaisseur), placées selon la méthode de projection (ISO 128-3 / ISO 5456-2) :
// - premier dièdre (ISO E) : vue de dessus sous la face, vue de gauche à droite de la face ;
// - troisième dièdre (ISO A) : vue de dessus au-dessus de la face, vue de droite à droite de la face.
// Arêtes vues en trait continu, arêtes cachées en trait interrompu, axes des perçages en trait mixte.
// Fonctions pures, repère du modèle (Y vers le bas), mm.
import type { CadObject, ProjectionMethod, ViewsObj } from '@/types/cad';
import { loopOf, type Loop } from '@/lib/hatch';

export type Seg = [number, number, number, number];
export interface ViewGeometry {
  kind: 'dessus' | 'gauche' | 'droite';
  /** Contour de la vue : x, y, largeur, hauteur. */
  frame: { x: number; y: number; w: number; h: number };
  visible: Seg[];
  hidden: Seg[];
  axes: Seg[];
}

const EPS = 1e-6;

/** Contours de la face : contour extérieur (polygone) et perçages ; un cercle n'a pas d'arêtes. */
function faceOf(source: CadObject, objects: CadObject[]) {
  const outer = loopOf(source);
  if (!outer) return null;
  const holes = (source.holes ?? []).map(id => objects.find(o => o.id === id)).filter((o): o is CadObject => !!o);
  // Emprise exacte (un cercle n'est pas réduit à son polygone d'approximation).
  const box = source.kind === 'circle'
    ? { minX: source.cx - source.r, maxX: source.cx + source.r, minY: source.cy - source.r, maxY: source.cy + source.r }
    : { minX: Math.min(...outer.map(p => p.x)), maxX: Math.max(...outer.map(p => p.x)), minY: Math.min(...outer.map(p => p.y)), maxY: Math.max(...outer.map(p => p.y)) };
  return {
    outer, box,
    outerSmooth: source.kind === 'circle',
    holes: holes
      .map(h => ({ loop: loopOf(h), circle: h.kind === 'circle' ? { cx: h.cx, cy: h.cy, r: h.r } : null }))
      .filter((h): h is { loop: Loop; circle: { cx: number; cy: number; r: number } | null } => !!h.loop),
  };
}

/** Intersections d'une droite x = c (ou y = c) avec un contour : coordonnées le long de l'autre axe. */
function cuts(loop: Loop, axis: 'x' | 'y', c: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const [pa, pb, qa, qb] = axis === 'x' ? [a.x, b.x, a.y, b.y] : [a.y, b.y, a.x, b.x];
    if ((pa <= c && c <= pb) || (pb <= c && c <= pa)) {
      if (Math.abs(pb - pa) < EPS) { out.push(qa, qb); continue; }
      out.push(qa + ((c - pa) / (pb - pa)) * (qb - qa));
    }
  }
  return out;
}

const unique = (vals: number[]) => [...new Set(vals.map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);

/** Vues de dessus et de côté ; null si la face n'est pas un contour fermé ou l'épaisseur nulle. */
export function linkedViews(o: ViewsObj, source: CadObject | undefined, objects: CadObject[], method: ProjectionMethod = o.method ?? 'premier-diedre'): ViewGeometry[] | null {
  if (!source || !(o.depth > 0)) return null;
  const face = faceOf(source, objects);
  if (!face) return null;
  const { minX, maxX, minY, maxY } = face.box;
  const d = o.depth, g = Math.max(0, o.gap);
  const overshoot = Math.max(2, d * 0.08);
  const views: ViewGeometry[] = [];

  if (o.top) {
    // Vue de dessus : x conservé, épaisseur sur la verticale de la vue.
    const v0 = method === 'premier-diedre' ? maxY + g : minY - g - d;
    const v: ViewGeometry = { kind: 'dessus', frame: { x: minX, y: v0, w: maxX - minX, h: d }, visible: [], hidden: [], axes: [] };
    v.visible.push([minX, v0, maxX, v0], [maxX, v0, maxX, v0 + d], [maxX, v0 + d, minX, v0 + d], [minX, v0 + d, minX, v0]);
    // Arêtes de la face parallèles à l'épaisseur : vues si le sommet est sur le bord supérieur de la face.
    if (!face.outerSmooth) {
      for (const x of unique(face.outer.map(p => p.x))) {
        if (x <= minX + EPS || x >= maxX - EPS) continue;
        const top = Math.min(...cuts(face.outer, 'x', x));
        const atTop = face.outer.some(p => Math.abs(p.x - x) < EPS && Math.abs(p.y - top) < EPS);
        (atTop ? v.visible : v.hidden).push([x, v0, x, v0 + d]);
      }
    }
    for (const h of face.holes) {
      const hx = h.circle ? [h.circle.cx - h.circle.r, h.circle.cx + h.circle.r] : unique(h.loop.map(p => p.x));
      for (const x of hx) v.hidden.push([x, v0, x, v0 + d]);
      if (h.circle) v.axes.push([h.circle.cx, v0 - overshoot, h.circle.cx, v0 + d + overshoot]);
    }
    views.push(v);
  }

  if (o.side) {
    // Vue de côté : y conservé, épaisseur sur l'horizontale de la vue, toujours à droite de la face.
    const fromLeft = method === 'premier-diedre';
    const u0 = maxX + g;
    const v: ViewGeometry = { kind: fromLeft ? 'gauche' : 'droite', frame: { x: u0, y: minY, w: d, h: maxY - minY }, visible: [], hidden: [], axes: [] };
    v.visible.push([u0, minY, u0 + d, minY], [u0 + d, minY, u0 + d, maxY], [u0 + d, maxY, u0, maxY], [u0, maxY, u0, minY]);
    if (!face.outerSmooth) {
      for (const y of unique(face.outer.map(p => p.y))) {
        if (y <= minY + EPS || y >= maxY - EPS) continue;
        const c = cuts(face.outer, 'y', y);
        const edge = fromLeft ? Math.min(...c) : Math.max(...c);
        const seen = face.outer.some(p => Math.abs(p.y - y) < EPS && Math.abs(p.x - edge) < EPS);
        (seen ? v.visible : v.hidden).push([u0, y, u0 + d, y]);
      }
    }
    for (const h of face.holes) {
      const hy = h.circle ? [h.circle.cy - h.circle.r, h.circle.cy + h.circle.r] : unique(h.loop.map(p => p.y));
      for (const y of hy) v.hidden.push([u0, y, u0 + d, y]);
      if (h.circle) v.axes.push([u0 - overshoot, h.circle.cy, u0 + d + overshoot, h.circle.cy]);
    }
    views.push(v);
  }
  return views;
}

/** Libellé d'une vue. */
export const VIEW_LABEL: Record<ViewGeometry['kind'], string> = { dessus: 'Vue de dessus', gauche: 'Vue de gauche', droite: 'Vue de droite' };

/** Distance d'un point aux traits des vues (désignation). */
export function distanceToViews(views: ViewGeometry[], x: number, y: number): number {
  let d = Infinity;
  for (const v of views) {
    for (const [x1, y1, x2, y2] of [...v.visible, ...v.hidden]) {
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
      d = Math.min(d, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
    }
  }
  return d;
}
