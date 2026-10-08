// Géométrie des splines (lot 10.2) : B-spline (rationnelle si poids) par points de contrôle.
// Coordonnées modèle (Y vers le bas) ; la courbe est indépendante du repère : les transformations
// affines (déplacer, tourner, symétrie, échelle) s'appliquent exactement aux points de contrôle.
import type { SplineObj } from '@/types/cad';
import type { Pt } from '@/lib/arc';
import { nurbsPoint, sampleCurve } from '@/lib/dxf-curves';

export type SplineGeom = Pick<SplineObj, 'points' | 'degree' | 'knots' | 'weights'>;

export const controlPoints = (s: Pick<SplineObj, 'points'>): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < s.points.length; i += 2) out.push({ x: s.points[i], y: s.points[i + 1] });
  return out;
};

/** Vecteur de nœuds borné uniforme : la courbe part du premier point et finit au dernier. */
export function clampedKnots(count: number, degree: number): number[] {
  const inner = count - degree - 1;
  return [...Array(degree + 1).fill(0), ...Array.from({ length: inner }, (_, i) => (i + 1) / (inner + 1)), ...Array(degree + 1).fill(1)];
}

export const knotsOf = (s: SplineGeom): number[] => s.knots ?? clampedKnots(s.points.length / 2, s.degree);

/** Spline évaluable : degré ≥ 1, assez de points, nœuds en nombre exact et croissants, domaine non vide. */
export function isValidSpline(s: SplineGeom): boolean {
  const n = s.points.length / 2, k = knotsOf(s);
  if (!Number.isInteger(s.degree) || s.degree < 1 || n < s.degree + 1 || k.length !== n + s.degree + 1) return false;
  for (let i = 1; i < k.length; i++) if (!(k[i] >= k[i - 1])) return false;
  if (s.weights && (s.weights.length !== n || s.weights.some(w => !(w > 0)))) return false;
  return k[n] > k[s.degree];
}

export function splineDomain(s: SplineGeom): [number, number] {
  const k = knotsOf(s), n = s.points.length / 2;
  return [k[s.degree], k[n]];
}

export function splinePointAt(s: SplineGeom, u: number): Pt {
  const [u0, u1] = splineDomain(s);
  return nurbsPoint(s.degree, knotsOf(s), controlPoints(s), s.weights ?? null, Math.min(Math.max(u, u0), u1));
}

export function splineEndpoints(s: SplineGeom): [Pt, Pt] {
  const [u0, u1] = splineDomain(s);
  return [splinePointAt(s, u0), splinePointAt(s, u1)];
}

/** Polyligne approchée (écart à la courbe ≤ `tol` mm), au moins quatre segments par portée de nœuds. */
export function splineSamples(s: SplineGeom, tol = 0.01): Pt[] {
  if (!isValidSpline(s)) return controlPoints(s);
  const [u0, u1] = splineDomain(s);
  const spans = new Set(knotsOf(s).slice(s.degree, s.points.length / 2 + 1)).size - 1;
  return sampleCurve(u => splinePointAt(s, u), u0, u1, tol, Math.max(8, spans * 4)).points;
}

export function splineLength(s: SplineGeom): number {
  const pts = splineSamples(s, 1e-5);
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

export function splineBounds(s: SplineGeom) {
  const pts = splineSamples(s, 1e-4);
  return {
    minX: Math.min(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)),
    maxX: Math.max(...pts.map(p => p.x)), maxY: Math.max(...pts.map(p => p.y)),
  };
}

export function distanceToSpline(s: SplineGeom, p: Pt): number {
  const pts = splineSamples(s);
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** Applique une transformation de points aux points de contrôle (exact pour une transformation affine). */
export function mapSplinePoints(s: Pick<SplineObj, 'points'>, f: (p: Pt) => Pt): number[] {
  return controlPoints(s).flatMap(p => { const q = f(p); return [q.x, q.y]; });
}

export function splinePath(s: SplineGeom, tol = 0.01): string {
  const pts = splineSamples(s, tol);
  return `M ${pts.map(p => `${p.x} ${p.y}`).join(' L ')}`;
}

/** Retire les points consécutifs confondus (à 10⁻⁶ mm près). */
export function withoutRepeatedPoints(points: number[], eps = 1e-6): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const n = out.length;
    if (n >= 2 && Math.hypot(points[i] - out[n - 2], points[i + 1] - out[n - 1]) <= eps) continue;
    out.push(points[i], points[i + 1]);
  }
  return out;
}
