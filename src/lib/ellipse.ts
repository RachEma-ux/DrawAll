// Géométrie des ellipses (lot 10.1). Coordonnées modèle : Y vers le bas (écran). La rotation et
// les paramètres sont en degrés dans le repère DXF (Y vers le haut), sens trigonométrique, comme
// les arcs : le point de paramètre t vaut C + rx·cos t·u + ry·sin t·v, u à `rotation`, v à +90°.
import type { EllipseObj } from '@/types/cad';
import { norm360, type Pt } from '@/lib/arc';
import { sampleCurve } from '@/lib/dxf-curves';

export type EllipseGeom = Pick<EllipseObj, 'cx' | 'cy' | 'rx' | 'ry' | 'rotation' | 'start' | 'end'>;

const RAD = Math.PI / 180;

export const isFullEllipse = (e: EllipseGeom) => e.start === undefined || e.end === undefined;

/** Paramètre de départ et ouverture (degrés, ouverture dans ]0 ; 360]). */
export function ellipseRange(e: EllipseGeom): { start: number; sweep: number } {
  if (isFullEllipse(e)) return { start: 0, sweep: 360 };
  const s = norm360(e.end! - e.start!);
  return { start: e.start!, sweep: s <= 1e-9 ? 360 : s };
}

/** Point de paramètre t (degrés). */
export function ellipsePointAt(e: EllipseGeom, tDeg: number): Pt {
  const t = tDeg * RAD, th = e.rotation * RAD;
  const a = e.rx * Math.cos(t), b = e.ry * Math.sin(t);
  // Repère DXF : X = a·cos θ − b·sin θ ; Y = a·sin θ + b·cos θ ; le modèle a Y vers le bas.
  return { x: e.cx + a * Math.cos(th) - b * Math.sin(th), y: e.cy - (a * Math.sin(th) + b * Math.cos(th)) };
}

export function ellipseEndpoints(e: EllipseGeom): [Pt, Pt] {
  const { start, sweep } = ellipseRange(e);
  return [ellipsePointAt(e, start), ellipsePointAt(e, start + sweep)];
}

export function ellipseMidpoint(e: EllipseGeom): Pt {
  const { start, sweep } = ellipseRange(e);
  return ellipsePointAt(e, start + sweep / 2);
}

/** Le paramètre (degrés) est-il compris dans l'arc d'ellipse ? */
export function paramInEllipse(e: EllipseGeom, tDeg: number): boolean {
  if (isFullEllipse(e)) return true;
  const { start, sweep } = ellipseRange(e);
  return norm360(tDeg - start) <= sweep + 1e-9;
}

/** Points aux extrémités des axes (quadrants) compris dans l'arc. */
export function ellipseQuadrants(e: EllipseGeom): Pt[] {
  return [0, 90, 180, 270].filter(t => paramInEllipse(e, t)).map(t => ellipsePointAt(e, t));
}

/** Boîte englobante exacte : extrémités et paramètres où x ou y est extrémal. */
export function ellipseBounds(e: EllipseGeom) {
  const th = e.rotation * RAD;
  // x(t) ∝ rx cos t cos θ − ry sin t sin θ : extrémal pour tan t = −ry sin θ / (rx cos θ).
  const tx = Math.atan2(-e.ry * Math.sin(th), e.rx * Math.cos(th)) / RAD;
  const ty = Math.atan2(e.ry * Math.cos(th), e.rx * Math.sin(th)) / RAD;
  const candidates = [tx, tx + 180, ty, ty + 180].filter(t => paramInEllipse(e, t)).map(t => ellipsePointAt(e, t));
  const pts = isFullEllipse(e) ? candidates : [...ellipseEndpoints(e), ...candidates];
  return {
    minX: Math.min(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)),
    maxX: Math.max(...pts.map(p => p.x)), maxY: Math.max(...pts.map(p => p.y)),
  };
}

/** Longueur (quadrature de Gauss–Legendre à 5 points sur 64 intervalles : erreur < 10⁻⁹ relative). */
export function ellipseLength(e: EllipseGeom): number {
  const { start, sweep } = ellipseRange(e);
  const g = [[-0.906179845938664, 0.236926885056189], [-0.538469310105683, 0.478628670499366], [0, 0.568888888888889], [0.538469310105683, 0.478628670499366], [0.906179845938664, 0.236926885056189]];
  const speed = (t: number) => Math.hypot(e.rx * Math.sin(t), e.ry * Math.cos(t));
  const n = 64, a = start * RAD, h = (sweep * RAD) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const m = a + h * (i + 0.5);
    for (const [x, w] of g) sum += w * speed(m + (h / 2) * x);
  }
  return (sum * h) / 2;
}

/** Aire de l'ellipse entière ; un arc d'ellipse n'est pas fermé. */
export const ellipseArea = (e: EllipseGeom): number | undefined => (isFullEllipse(e) ? Math.PI * e.rx * e.ry : undefined);

/** Polyligne approchée (écart à la courbe ≤ `tol` mm) : rendu de secours, accrochage, hachure. */
export function ellipseSamples(e: EllipseGeom, tol = 0.01): Pt[] {
  const { start, sweep } = ellipseRange(e);
  return sampleCurve(t => ellipsePointAt(e, t), start, start + sweep, tol, Math.max(16, Math.ceil((sweep / 360) * 64))).points;
}

/** Paramètre (degrés) du point de l'ellipse le plus proche de p (recherche grossière puis affinée). */
export function closestEllipseParam(e: EllipseGeom, p: Pt): number {
  const { start, sweep } = ellipseRange(e);
  const d2 = (t: number) => { const q = ellipsePointAt(e, t); return (q.x - p.x) ** 2 + (q.y - p.y) ** 2; };
  let best = start, bestD = Infinity;
  const n = 360;
  for (let i = 0; i <= n; i++) { const t = start + (sweep * i) / n; const d = d2(t); if (d < bestD) { bestD = d; best = t; } }
  // Section dorée autour du meilleur échantillon.
  let lo = Math.max(start, best - sweep / n), hi = Math.min(start + sweep, best + sweep / n);
  const r = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 60; i++) {
    const a = hi - r * (hi - lo), b = lo + r * (hi - lo);
    if (d2(a) < d2(b)) hi = b; else lo = a;
  }
  return (lo + hi) / 2;
}

export function distanceToEllipse(e: EllipseGeom, p: Pt): number {
  const q = ellipsePointAt(e, closestEllipseParam(e, p));
  return Math.hypot(q.x - p.x, q.y - p.y);
}

/** Chemin SVG (repère modèle) : arcs elliptiques natifs, en deux moitiés pour une ellipse entière. */
export function ellipsePath(e: EllipseGeom): string {
  const { start, sweep } = ellipseRange(e);
  const rot = -e.rotation; // rotation à l'écran : Y vers le bas
  const p = (t: number) => { const q = ellipsePointAt(e, t); return `${q.x} ${q.y}`; };
  if (sweep >= 360 - 1e-9) {
    return `M ${p(start)} A ${e.rx} ${e.ry} ${rot} 0 0 ${p(start + 180)} A ${e.rx} ${e.ry} ${rot} 0 0 ${p(start)} Z`;
  }
  // Sens trigonométrique du repère DXF = sens antihoraire à l'écran = drapeau de balayage 0 en SVG.
  return `M ${p(start)} A ${e.rx} ${e.ry} ${rot} ${sweep > 180 ? 1 : 0} 0 ${p(start + sweep)}`;
}

/**
 * Ellipse par trois points : centre, extrémité du premier axe (demi-axe et direction), puis un point
 * dont la distance au premier axe donne le second demi-axe. null si un demi-axe est nul.
 */
export function ellipseFrom3Points(c: Pt, a: Pt, b: Pt): Pick<EllipseObj, 'cx' | 'cy' | 'rx' | 'ry' | 'rotation'> | null {
  const rx = Math.hypot(a.x - c.x, a.y - c.y);
  if (rx < 1e-9) return null;
  const ux = (a.x - c.x) / rx, uy = (a.y - c.y) / rx;
  const ry = Math.abs((b.x - c.x) * uy - (b.y - c.y) * ux);
  if (ry < 1e-9) return null;
  // Direction dans le repère DXF (Y vers le haut).
  return { cx: c.x, cy: c.y, rx, ry, rotation: norm360((Math.atan2(-(a.y - c.y), a.x - c.x) * 180) / Math.PI) };
}

/**
 * Courbes de Bézier cubiques d'un arc d'ellipse (portions ≤ 45° de paramètre) : image affine exacte
 * de l'approximation classique du cercle. Renvoie les points de chaque portion : [P0, P1, P2, P3].
 */
export function ellipseBeziers(e: EllipseGeom): [Pt, Pt, Pt, Pt][] {
  const { start, sweep } = ellipseRange(e);
  // Portions de 45° au plus : écart à la courbe ≤ 2·10⁻⁵ × demi-axe.
  const n = Math.max(1, Math.ceil(sweep / 45 - 1e-9));
  const d = (sweep / n) * RAD, k = (4 / 3) * Math.tan(d / 4), th = e.rotation * RAD;
  // Dérivée par rapport au paramètre (radians), repère modèle (Y vers le bas).
  const der = (tDeg: number): Pt => {
    const t = tDeg * RAD, a = -e.rx * Math.sin(t), b = e.ry * Math.cos(t);
    return { x: a * Math.cos(th) - b * Math.sin(th), y: -(a * Math.sin(th) + b * Math.cos(th)) };
  };
  const out: [Pt, Pt, Pt, Pt][] = [];
  for (let i = 0; i < n; i++) {
    const t0 = start + (sweep * i) / n, t1 = start + (sweep * (i + 1)) / n;
    const p0 = ellipsePointAt(e, t0), p3 = ellipsePointAt(e, t1), d0 = der(t0), d1 = der(t1);
    out.push([p0, { x: p0.x + k * d0.x, y: p0.y + k * d0.y }, { x: p3.x - k * d1.x, y: p3.y - k * d1.y }, p3]);
  }
  return out;
}

/**
 * Image d'une ellipse par une transformation affine du repère modèle p ↦ T + M·(p − B) : c'est
 * encore une ellipse. Ses axes principaux se déduisent des demi-diamètres conjugués transformés ;
 * une symétrie (déterminant négatif) inverse le sens de parcours des paramètres.
 */
export function affineEllipse(e: EllipseGeom, M: { a: number; b: number; c: number; d: number }, T: Pt, B: Pt): EllipseGeom | null {
  const th = e.rotation * RAD;
  const lin = (v: Pt): Pt => ({ x: M.a * v.x + M.b * v.y, y: M.c * v.x + M.d * v.y });
  // Demi-axes dans le repère modèle (Y vers le bas) : u à θ, v à θ + 90° du repère DXF.
  const a1 = lin({ x: e.rx * Math.cos(th), y: -e.rx * Math.sin(th) });
  const b1 = lin({ x: -e.ry * Math.sin(th), y: -e.ry * Math.cos(th) });
  const dot = a1.x * b1.x + a1.y * b1.y, na = a1.x * a1.x + a1.y * a1.y, nb = b1.x * b1.x + b1.y * b1.y;
  const t0 = 0.5 * Math.atan2(2 * dot, na - nb);
  const a2 = { x: a1.x * Math.cos(t0) + b1.x * Math.sin(t0), y: a1.y * Math.cos(t0) + b1.y * Math.sin(t0) };
  let b2 = { x: -a1.x * Math.sin(t0) + b1.x * Math.cos(t0), y: -a1.y * Math.sin(t0) + b1.y * Math.cos(t0) };
  const rx = Math.hypot(a2.x, a2.y), ry = Math.hypot(b2.x, b2.y);
  if (rx < 1e-12 || ry < 1e-12) return null;
  const rotation = Math.atan2(-a2.y, a2.x);
  // Second axe attendu (repère DXF à +90° du premier), exprimé dans le repère modèle.
  const expected = { x: -Math.sin(rotation), y: -Math.cos(rotation) };
  const flip = b2.x * expected.x + b2.y * expected.y < 0;
  if (flip) b2 = { x: -b2.x, y: -b2.y };
  const c = { x: T.x + M.a * (e.cx - B.x) + M.b * (e.cy - B.y), y: T.y + M.c * (e.cx - B.x) + M.d * (e.cy - B.y) };
  const shift = t0 / RAD;
  const out: EllipseGeom = { cx: c.x, cy: c.y, rx, ry, rotation: norm360(rotation / RAD) };
  if (isFullEllipse(e)) return out;
  // Paramètre : t' = t − t0, ou −(t − t0) si le sens s'inverse.
  return flip
    ? { ...out, start: norm360(-(e.end! - shift)), end: norm360(-(e.start! - shift)) }
    : { ...out, start: norm360(e.start! - shift), end: norm360(e.end! - shift) };
}
