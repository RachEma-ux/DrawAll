// Courbes DXF approchées par des polylignes (lot 6.1) : SPLINE (B-spline rationnelle, algorithme de
// de Boor), ELLIPSE et arcs d'arêtes de HATCH. Échantillonnage adaptatif : chaque segment est
// subdivisé tant que l'écart entre la courbe (au milieu du segment) et sa corde dépasse la tolérance.
// Repère DXF (Y vers le haut), unités du fichier ; fonctions pures.

export interface Pt { x: number; y: number }
export interface Sampled { points: Pt[]; error: number }

const MAX_DEPTH = 14;

function chordDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
  if (l < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l;
}

/** Échantillonne f sur [t0, t1] : `minSegments` segments au moins, puis subdivision jusqu'à la tolérance. */
export function sampleCurve(f: (t: number) => Pt, t0: number, t1: number, tol: number, minSegments = 8): Sampled {
  const points: Pt[] = [f(t0)];
  let error = 0;
  const refine = (ta: number, pa: Pt, tb: number, pb: Pt, depth: number) => {
    const tm = (ta + tb) / 2, pm = f(tm);
    const e = chordDistance(pm, pa, pb);
    if (e > tol && depth < MAX_DEPTH) {
      refine(ta, pa, tm, pm, depth + 1);
      refine(tm, pm, tb, pb, depth + 1);
      return;
    }
    error = Math.max(error, e);
    points.push(pb);
  };
  let ta = t0, pa = points[0];
  for (let i = 1; i <= minSegments; i++) {
    const tb = t0 + ((t1 - t0) * i) / minSegments, pb = f(tb);
    refine(ta, pa, tb, pb, 0);
    ta = tb; pa = pb;
  }
  return { points, error };
}

/** Point d'une B-spline (rationnelle si `weights`) au paramètre t, algorithme de de Boor. */
export function nurbsPoint(degree: number, knots: number[], ctrl: Pt[], weights: number[] | null, t: number): Pt {
  const n = ctrl.length - 1;
  // Intervalle de nœuds contenant t (le dernier intervalle non vide pour t = fin).
  let k = n;
  for (let i = degree; i <= n; i++) if (t < knots[i + 1]) { k = i; break; }
  const w = (i: number) => (weights ? weights[i] ?? 1 : 1);
  const d = Array.from({ length: degree + 1 }, (_, j) => {
    const i = j + k - degree, wi = w(i);
    return { x: ctrl[i].x * wi, y: ctrl[i].y * wi, w: wi };
  });
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = j + k - degree;
      const den = knots[i + degree - r + 1] - knots[i];
      const a = den === 0 ? 0 : (t - knots[i]) / den;
      d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w };
    }
  }
  const p = d[degree];
  return { x: p.x / p.w, y: p.y / p.w };
}

/** Polyligne d'une SPLINE : points de contrôle et nœuds, sinon points d'ajustement reliés. */
export function splinePoints(degree: number, knots: number[], ctrl: Pt[], weights: number[] | null, fit: Pt[], tol: number): Sampled | null {
  if (ctrl.length >= degree + 1 && knots.length === ctrl.length + degree + 1 && degree >= 1) {
    const t0 = knots[degree], t1 = knots[ctrl.length];
    if (!(t1 > t0)) return null;
    // Au moins quatre segments par portée de nœuds.
    const spans = new Set(knots.slice(degree, ctrl.length + 1)).size - 1;
    return sampleCurve(t => nurbsPoint(degree, knots, ctrl, weights, Math.min(t, t1)), t0, t1, tol, Math.max(8, spans * 4));
  }
  if (fit.length >= 2) return { points: fit, error: NaN };
  return null;
}

/**
 * Polyligne d'une ellipse : centre, extrémité du grand axe (relative), rapport petit / grand axe,
 * paramètres de début et de fin (radians, sens trigonométrique).
 */
export function ellipsePoints(c: Pt, major: Pt, ratio: number, p0: number, p1: number, tol: number): Sampled {
  let end = p1;
  while (end <= p0) end += 2 * Math.PI;
  const minor = { x: -major.y * ratio, y: major.x * ratio };
  const f = (t: number) => ({ x: c.x + major.x * Math.cos(t) + minor.x * Math.sin(t), y: c.y + major.y * Math.cos(t) + minor.y * Math.sin(t) });
  return sampleCurve(f, p0, end, tol, Math.max(8, Math.ceil(((end - p0) / (2 * Math.PI)) * 32)));
}

/** Polyligne d'un arc (degrés) ; `ccw` faux : angles mesurés dans le sens horaire (arêtes de HATCH). */
export function arcPoints(c: Pt, r: number, a0: number, a1: number, ccw: boolean, tol: number): Sampled {
  const s = ccw ? a0 : -a0, e0 = ccw ? a1 : -a1;
  const start = (s * Math.PI) / 180;
  let end = (e0 * Math.PI) / 180;
  if (ccw) { while (end <= start) end += 2 * Math.PI; } else { while (end >= start) end -= 2 * Math.PI; }
  const f = (t: number) => ({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) });
  return sampleCurve(f, start, end, tol, Math.max(4, Math.ceil((Math.abs(end - start) / (2 * Math.PI)) * 32)));
}
