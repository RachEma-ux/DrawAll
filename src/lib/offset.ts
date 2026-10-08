// Décalage à distance saisie (lot 10.4) : copie parallèle d'un objet, du côté désigné.
// Fonctions pures ; repère modèle (Y vers le bas).
import type { CadObject, EllipseObj, SplineObj } from '@/types/cad';
import { isClosedPolyline } from '@/types/cad';
import type { Pt } from '@/lib/arc';
import { ellipsePointAt, ellipseRange, isFullEllipse } from '@/lib/ellipse';
import { splineDomain, splinePointAt } from '@/lib/spline';
import { sampleCurve } from '@/lib/dxf-curves';

export type OffsetResult = { ok: true; partial: Partial<CadObject>; approximated?: boolean } | { ok: false; reason: string };

const EPS = 1e-9;
/** Arrondi à 10⁻⁹ mm : supprime le bruit des calculs flottants sans toucher la précision utile. */
const r9 = (v: number) => { const r = Math.round(v * 1e9) / 1e9; return Object.is(r, -0) ? 0 : r; };
const cross = (a: Pt, b: Pt, p: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/** Intersection des droites (a1, a2) et (b1, b2) ; null si parallèles. */
function lineIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < EPS) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/** Segment décalé de `d` vers sa gauche (repère écran : normale (−dy, dx) / L). */
function shifted(a: Pt, b: Pt, d: number): [Pt, Pt] {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const n = { x: (-(b.y - a.y) / l) * d, y: ((b.x - a.x) / l) * d };
  return [{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }];
}

function pointInPolygon(pts: Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) inside = !inside;
  }
  return inside;
}

const signedArea = (pts: Pt[]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

/**
 * Polyligne décalée, sommets raccordés en onglet (intersection des segments décalés voisins).
 * `d` > 0 : côté gauche du sens de parcours (à l'écran). Les recoupements éventuels ne sont pas nettoyés.
 */
function offsetPolyline(points: Pt[], closed: boolean, d: number): Pt[] | null {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > EPS);
  if (closed && pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) <= EPS) pts.pop();
  const n = pts.length;
  if (n < 2) return null;
  const segs: [Pt, Pt][] = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) segs.push(shifted(pts[i], pts[(i + 1) % n], d));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? segs[(i - 1 + count) % count] : segs[i - 1];
    const next = closed ? segs[i % count] : segs[i];
    if (!prev) { out.push(next[0]); continue; }
    if (!next) { out.push(prev[1]); continue; }
    // Segments colinéaires : le point décalé commun suffit.
    out.push(lineIntersection(prev[0], prev[1], next[0], next[1]) ?? next[0]);
  }
  if (closed) out.push({ ...out[0] });
  return out;
}

/** Courbe décalée approchée (≤ `tol` mm) : point de la courbe + d × normale, par subdivision adaptative. */
function offsetSampled(f: (t: number) => Pt, t0: number, t1: number, d: number, tol: number): Pt[] {
  const h = (t1 - t0) * 1e-6;
  const g = (t: number) => {
    const a = f(Math.max(t0, t - h)), b = f(Math.min(t1, t + h)), p = f(t);
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: p.x + (-(b.y - a.y) / l) * d, y: p.y + ((b.x - a.x) / l) * d };
  };
  return sampleCurve(g, t0, t1, tol, 32).points;
}

/**
 * Copie décalée de `distance` (> 0) du côté du point `side`.
 * Ligne, polyligne, rectangle : exacte (onglets aux sommets). Cercle, arc : exacte (rayon ± d).
 * Ellipse, spline : la courbe décalée n'est ni une ellipse ni une spline ; elle est approchée par
 * une polyligne à 0,01 mm (`approximated`).
 */
export function offsetObject(o: CadObject, distance: number, side: Pt, tol = 0.01): OffsetResult {
  if (!(distance > 0) || !Number.isFinite(distance)) return { ok: false, reason: 'Distance de décalage invalide (nombre positif attendu).' };
  switch (o.kind) {
    case 'line': {
      const a = { x: o.x1, y: o.y1 }, b = { x: o.x2, y: o.y2 };
      if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) return { ok: false, reason: 'Ligne de longueur nulle.' };
      const [p, q] = shifted(a, b, cross(a, b, side) >= 0 ? distance : -distance);
      return { ok: true, partial: { kind: 'line', x1: r9(p.x), y1: r9(p.y), x2: r9(q.x), y2: r9(q.y) } };
    }
    case 'rect': {
      const inside = side.x > o.x && side.x < o.x + o.w && side.y > o.y && side.y < o.y + o.h;
      const d = inside ? -distance : distance;
      if (o.w + 2 * d <= EPS || o.h + 2 * d <= EPS) return { ok: false, reason: 'Décalage intérieur plus grand que le demi-côté du rectangle.' };
      return { ok: true, partial: { kind: 'rect', x: o.x - d, y: o.y - d, w: o.w + 2 * d, h: o.h + 2 * d } };
    }
    case 'circle':
    case 'arc': {
      const outward = Math.hypot(side.x - o.cx, side.y - o.cy) > o.r;
      const r = o.r + (outward ? distance : -distance);
      if (r <= EPS) return { ok: false, reason: 'Décalage intérieur plus grand que le rayon.' };
      return { ok: true, partial: o.kind === 'circle' ? { kind: 'circle', cx: o.cx, cy: o.cy, r } : { kind: 'arc', cx: o.cx, cy: o.cy, r, start: o.start, end: o.end } };
    }
    case 'polyline': {
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) pts.push({ x: o.points[i], y: o.points[i + 1] });
      const closed = isClosedPolyline(o);
      let d: number;
      if (closed) {
        // Fermée : extérieur ou intérieur selon le point désigné ; la gauche dépend du sens de parcours.
        const ring = pts.slice(0, -1);
        // d > 0 décale vers l’intérieur quand l’aire signée (formule du lacet) est positive.
        const leftIsInside = signedArea(ring) > 0;
        d = pointInPolygon(ring, side) === leftIsInside ? distance : -distance;
      } else {
        // Ouverte : côté du segment le plus proche du point désigné.
        let best = 0, bestD = Infinity;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
          const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((side.x - a.x) * dx + (side.y - a.y) * dy) / l2));
          const dd = Math.hypot(side.x - a.x - t * dx, side.y - a.y - t * dy);
          if (dd < bestD) { bestD = dd; best = i; }
        }
        d = cross(pts[best], pts[best + 1], side) >= 0 ? distance : -distance;
      }
      const out = offsetPolyline(pts, closed, d);
      if (!out) return { ok: false, reason: 'Polyligne trop courte.' };
      return { ok: true, partial: { kind: 'polyline', points: out.flatMap(p => [r9(p.x), r9(p.y)]) } };
    }
    case 'ellipse':
    case 'spline': {
      const f = o.kind === 'ellipse' ? (t: number) => ellipsePointAt(o as EllipseObj, t) : (u: number) => splinePointAt(o as SplineObj, u);
      const [t0, t1] = o.kind === 'ellipse'
        ? (() => { const r = ellipseRange(o); return [r.start, r.start + r.sweep]; })()
        : splineDomain(o);
      // Côté : comparé à la tangente au point de la courbe le plus proche du point désigné.
      let bestT = t0, bestD = Infinity;
      for (let i = 0; i <= 720; i++) {
        const t = t0 + ((t1 - t0) * i) / 720, p = f(t), dd = Math.hypot(p.x - side.x, p.y - side.y);
        if (dd < bestD) { bestD = dd; bestT = t; }
      }
      const a = f(Math.max(t0, bestT - (t1 - t0) * 1e-4)), b = f(Math.min(t1, bestT + (t1 - t0) * 1e-4));
      const d = cross(a, b, side) >= 0 ? distance : -distance;
      const pts = offsetSampled(f, t0, t1, d, tol);
      const closed = o.kind === 'ellipse' && isFullEllipse(o);
      if (closed) pts[pts.length - 1] = { ...pts[0] };
      return { ok: true, approximated: true, partial: { kind: 'polyline', points: pts.flatMap(p => [p.x, p.y]) } };
    }
    default:
      return { ok: false, reason: 'Cet objet ne se décale pas (lignes, polylignes, rectangles, cercles, arcs, ellipses et splines seulement).' };
  }
}
