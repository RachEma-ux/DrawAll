// Main levée (lot 10.6) : le tracé continu est simplifié par l'algorithme de Douglas–Peucker
// (aucun point retiré ne s'écarte de plus de `tol` de la polyligne gardée). Fonctions pures.
import type { Pt } from '@/lib/arc';

function segDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Douglas–Peucker itératif (pas de récursion profonde sur les longs tracés). Garde les extrémités. */
export function simplifyPath(points: Pt[], tol: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1, worstD = tol;
    for (let k = i + 1; k < j; k++) {
      const d = segDistance(points[k], points[i], points[j]);
      if (d > worstD) { worstD = d; worst = k; }
    }
    if (worst >= 0) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Écart maximal entre les points d'origine et la polyligne simplifiée (contrôle). */
export function maxDeviation(points: Pt[], simplified: Pt[]): number {
  let worst = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 0; i + 1 < simplified.length; i++) best = Math.min(best, segDistance(p, simplified[i], simplified[i + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}
