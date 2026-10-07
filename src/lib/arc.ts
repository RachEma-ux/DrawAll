// Géométrie des arcs. Coordonnées modèle : Y vers le bas (écran). Angles en degrés dans le
// repère DXF (Y vers le haut), sens trigonométrique : un arc va de `start` à `end` en tournant
// dans le sens antihoraire à l'écran.
import type { ArcObj } from '@/types/cad';

export interface Pt { x: number; y: number }
export type ArcGeom = Pick<ArcObj, 'cx' | 'cy' | 'r' | 'start' | 'end'>;

const EPS = 1e-9;

export function norm360(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return Math.abs(a - 360) < 1e-9 ? 0 : Math.round(a * 1e9) / 1e9;
}

/** Ouverture de l'arc en degrés, dans ]0 ; 360]. */
export function arcSweep(a: ArcGeom): number {
  const s = norm360(a.end - a.start);
  return s <= 1e-9 ? 360 : s;
}

/** Point de l'arc à l'angle donné (degrés, repère DXF). */
export function arcPointAt(a: Pick<ArcGeom, 'cx' | 'cy' | 'r'>, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  return { x: a.cx + a.r * Math.cos(rad), y: a.cy - a.r * Math.sin(rad) };
}

/** Angle (degrés, repère DXF, dans [0 ; 360[) du point vu depuis le centre. */
export function angleOf(cx: number, cy: number, p: Pt): number {
  return norm360((Math.atan2(-(p.y - cy), p.x - cx) * 180) / Math.PI);
}

/** L'angle est-il compris dans l'arc (bornes incluses, à la tolérance près) ? */
export function angleInArc(a: ArcGeom, deg: number, tolDeg = 1e-7): boolean {
  const sweep = arcSweep(a);
  const rel = norm360(deg - a.start);
  return rel <= sweep + tolDeg || rel >= 360 - tolDeg;
}

export function arcEndpoints(a: ArcGeom): [Pt, Pt] {
  return [arcPointAt(a, a.start), arcPointAt(a, a.start + arcSweep(a))];
}

export function arcMidpoint(a: ArcGeom): Pt {
  return arcPointAt(a, a.start + arcSweep(a) / 2);
}

export function arcLength(a: ArcGeom): number {
  return (a.r * arcSweep(a) * Math.PI) / 180;
}

export function arcBounds(a: ArcGeom) {
  const pts = [...arcEndpoints(a)];
  for (const q of [0, 90, 180, 270]) if (angleInArc(a, q)) pts.push(arcPointAt(a, q));
  return {
    minX: Math.min(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)),
    maxX: Math.max(...pts.map(p => p.x)),
    maxY: Math.max(...pts.map(p => p.y)),
  };
}

/** Distance d'un point à l'arc. */
export function distanceToArc(a: ArcGeom, px: number, py: number): number {
  const d = Math.hypot(px - a.cx, py - a.cy);
  if (d > EPS && angleInArc(a, angleOf(a.cx, a.cy, { x: px, y: py }))) return Math.abs(d - a.r);
  const [e1, e2] = arcEndpoints(a);
  return Math.min(Math.hypot(px - e1.x, py - e1.y), Math.hypot(px - e2.x, py - e2.y));
}

/**
 * Arc passant par trois points (début, point intermédiaire, fin). Renvoie null si les points
 * sont alignés ou confondus.
 */
export function arcFrom3Points(p1: Pt, p2: Pt, p3: Pt): ArcGeom | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-9) return null;
  const s1 = p1.x * p1.x + p1.y * p1.y, s2 = p2.x * p2.x + p2.y * p2.y, s3 = p3.x * p3.x + p3.y * p3.y;
  const cx = (s1 * (p2.y - p3.y) + s2 * (p3.y - p1.y) + s3 * (p1.y - p2.y)) / d;
  const cy = (s1 * (p3.x - p2.x) + s2 * (p1.x - p3.x) + s3 * (p2.x - p1.x)) / d;
  const r = Math.hypot(p1.x - cx, p1.y - cy);
  if (!(r > EPS) || !Number.isFinite(r)) return null;
  const a1 = angleOf(cx, cy, p1), a2 = angleOf(cx, cy, p2), a3 = angleOf(cx, cy, p3);
  const ccw = { cx, cy, r, start: a1, end: a3 };
  // Le sens est celui qui fait passer l'arc par le point intermédiaire.
  return angleInArc(ccw, a2) ? ccw : { cx, cy, r, start: a3, end: a1 };
}

/** Arc défini par son centre, un point de départ (rayon + angle) et un point de fin (angle). */
export function arcFromCenter(c: Pt, from: Pt, to: Pt): ArcGeom | null {
  const r = Math.hypot(from.x - c.x, from.y - c.y);
  if (!(r > EPS) || Math.hypot(to.x - c.x, to.y - c.y) <= EPS) return null;
  return { cx: c.x, cy: c.y, r, start: angleOf(c.x, c.y, from), end: angleOf(c.x, c.y, to) };
}

/** Chemin SVG de l'arc (sens antihoraire à l'écran). */
export function arcSvgPath(a: ArcGeom): string {
  const sweep = arcSweep(a);
  const [p1, p2] = arcEndpoints(a);
  if (sweep >= 359.999) {
    const m = arcPointAt(a, a.start + 180);
    return `M ${p1.x} ${p1.y} A ${a.r} ${a.r} 0 1 0 ${m.x} ${m.y} A ${a.r} ${a.r} 0 1 0 ${p1.x} ${p1.y}`;
  }
  return `M ${p1.x} ${p1.y} A ${a.r} ${a.r} 0 ${sweep > 180 ? 1 : 0} 0 ${p2.x} ${p2.y}`;
}
