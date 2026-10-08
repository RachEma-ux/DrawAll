// Main levée (lot 10.6) : simplification de Douglas–Peucker dans la tolérance.
import { describe, expect, it } from 'vitest';
import { maxDeviation, simplifyPath } from './freehand';

describe('main levée (lot 10.6)', () => {
  it('une droite tremblée devient un segment ; un coin franc est gardé', () => {
    const line = Array.from({ length: 100 }, (_, i) => ({ x: i * 10, y: (i % 2 ? 0.3 : -0.3) }));
    expect(simplifyPath(line, 1)).toEqual([line[0], line[99]]);
    const corner = [...Array.from({ length: 50 }, (_, i) => ({ x: i * 10, y: 0 })), ...Array.from({ length: 50 }, (_, i) => ({ x: 490, y: (i + 1) * 10 }))];
    const s = simplifyPath(corner, 1);
    expect(s).toEqual([{ x: 0, y: 0 }, { x: 490, y: 0 }, { x: 490, y: 500 }]);
  });

  it('cercle échantillonné : écart toujours ≤ tolérance, beaucoup moins de points', () => {
    const pts = Array.from({ length: 2001 }, (_, i) => { const t = (i / 2000) * 2 * Math.PI; return { x: 1000 * Math.cos(t), y: 1000 * Math.sin(t) }; });
    for (const tol of [0.5, 2, 10]) {
      const s = simplifyPath(pts, tol);
      expect(maxDeviation(pts, s)).toBeLessThanOrEqual(tol);
      expect(s.length).toBeLessThan(pts.length / 5);
    }
  });

  it('tracés dégénérés : un ou deux points rendus tels quels ; long tracé sans débordement de pile', () => {
    expect(simplifyPath([{ x: 1, y: 1 }], 1)).toEqual([{ x: 1, y: 1 }]);
    // 20 000 points : bien plus qu'un long geste réel (points pris à 0,5 px d'écart au moins).
    const long = Array.from({ length: 20000 }, (_, i) => ({ x: i, y: Math.sin(i / 50) * 100 }));
    expect(() => simplifyPath(long, 0.01)).not.toThrow();
  });
});
