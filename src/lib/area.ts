// Mesures d'aire et de périmètre (mm, mm²). Fonctions pures.
// Une aire n'est donnée que pour un contour fermé et simple : un contour qui se recoupe n'a pas
// d'aire évidente ; elle est alors « non évaluée » avec la raison.
import type { CadObject } from '@/types/cad';
import { isClosedPolyline } from '@/types/cad';
import { arcSweep } from '@/lib/arc';
import { ellipseArea, ellipseLength, isFullEllipse } from '@/lib/ellipse';
import { splineLength } from '@/lib/spline';

export interface Measure {
  closed: boolean;
  /** Longueur d'un objet ouvert, périmètre d'un contour fermé (mm). */
  length: number;
  /** Aire (mm²) d'un contour fermé et simple. */
  area?: number;
  /** Raison pour laquelle l'aire n'est pas évaluée. */
  areaNote?: string;
  /** Arc : aire du segment circulaire (entre l'arc et sa corde) et du secteur (mm²). */
  segmentArea?: number;
  sectorArea?: number;
}

/** Sommets [x0, y0, x1, y1, …] sans répétition du premier point en fin de liste. */
function openRing(points: number[]): number[] {
  const n = points.length;
  if (n >= 6 && Math.hypot(points[0] - points[n - 2], points[1] - points[n - 1]) < 0.01) return points.slice(0, n - 2);
  return points;
}

/** Aire d'un polygone (formule du lacet), en valeur absolue. */
export function polygonArea(points: number[]): number {
  const p = openRing(points);
  let s = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    s += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return Math.abs(s) / 2;
}

/** Longueur d'une suite de sommets, fermée ou non. */
export function pathLength(points: number[], closed: boolean): number {
  const p = closed ? openRing(points) : points;
  let s = 0;
  for (let i = 2; i < p.length; i += 2) s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  if (closed && p.length >= 4) s += Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]);
  return s;
}

/** Le contour fermé se recoupe-t-il (deux côtés non voisins qui se touchent) ? */
export function selfIntersects(points: number[]): boolean {
  const p = openRing(points);
  const n = p.length / 2;
  const seg = (i: number) => [p[2 * i], p[2 * i + 1], p[(2 * i + 2) % p.length], p[(2 * i + 3) % p.length]];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // côtés voisins
      if (segmentsTouch(seg(i), seg(j))) return true;
    }
  }
  return false;
}

function segmentsTouch([ax, ay, bx, by]: number[], [cx, cy, dx, dy]: number[]): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => {
    const v = (qx - px) * (ry - py) - (qy - py) * (rx - px);
    return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
  };
  const on = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    Math.min(px, qx) - 1e-9 <= rx && rx <= Math.max(px, qx) + 1e-9 && Math.min(py, qy) - 1e-9 <= ry && ry <= Math.max(py, qy) + 1e-9;
  const o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy);
  const o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && on(ax, ay, bx, by, cx, cy)) || (o2 === 0 && on(ax, ay, bx, by, dx, dy))
    || (o3 === 0 && on(cx, cy, dx, dy, ax, ay)) || (o4 === 0 && on(cx, cy, dx, dy, bx, by));
}

/** Contour fermé donné par ses sommets : aire (si simple) et périmètre. */
export function measurePolygon(points: number[]): Measure {
  const ring = openRing(points);
  const length = pathLength(ring, true);
  if (ring.length < 6) return { closed: true, length, areaNote: 'Au moins trois points sont nécessaires.' };
  if (selfIntersects(ring)) return { closed: true, length, areaNote: 'Contour croisé : aire non évaluée.' };
  return { closed: true, length, area: polygonArea(ring) };
}

/** Mesures d'un objet ; null pour les objets sans géométrie mesurable (texte, cote, bloc). */
export function measureObject(o: CadObject): Measure | null {
  switch (o.kind) {
    case 'line': return { closed: false, length: Math.hypot(o.x2 - o.x1, o.y2 - o.y1) };
    // Mur : longueur du tracé et aire de son emprise (sans les jonctions).
    case 'wall': { const l = Math.hypot(o.x2 - o.x1, o.y2 - o.y1); return { closed: false, length: l, area: l * o.thickness }; }
    case 'rect': return { closed: true, length: 2 * (Math.abs(o.w) + Math.abs(o.h)), area: Math.abs(o.w * o.h) };
    case 'circle': return { closed: true, length: 2 * Math.PI * o.r, area: Math.PI * o.r * o.r };
    case 'spline': return { closed: false, length: splineLength(o) };
    case 'ellipse': return isFullEllipse(o) ? { closed: true, length: ellipseLength(o), area: ellipseArea(o) } : { closed: false, length: ellipseLength(o) };
    case 'arc': {
      const t = (arcSweep(o) * Math.PI) / 180;
      return {
        closed: false,
        length: o.r * t,
        segmentArea: (o.r * o.r * (t - Math.sin(t))) / 2,
        sectorArea: (o.r * o.r * t) / 2,
      };
    }
    case 'polyline': {
      const points = o.points;
      return isClosedPolyline(o) ? measurePolygon(points) : { closed: false, length: pathLength(points, false) };
    }
    default: return null;
  }
}
