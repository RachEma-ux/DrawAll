// Spline native (lot 10.2) : De Boor, nœuds bornés, extrémités, transformations exactes, accrochages.
import { describe, expect, it } from 'vitest';
import type { SplineObj } from '@/types/cad';
import { clampedKnots, isValidSpline, splineBounds, splineEndpoints, splineLength, splinePointAt, splineSamples, distanceToSpline } from './spline';
import { findSnap, mirrorObject, rotateObject, scaleObject, moveObject } from './geometry';

const base = { id: 'OBJ-0001', name: 'S', classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const sp = (p: Partial<SplineObj> = {}): SplineObj => ({ ...base, kind: 'spline', points: [0, 0, 10, -20, 20, 20, 30, 0], degree: 3, ...p });

/** Courbe de Bézier cubique (une seule portée) : valeur exacte de référence. */
const bezier = (p: number[], t: number) => {
  const b = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3];
  return { x: b.reduce((a, w, i) => a + w * p[2 * i], 0), y: b.reduce((a, w, i) => a + w * p[2 * i + 1], 0) };
};

describe('spline native (lot 10.2)', () => {
  it('quatre points, degré 3, nœuds bornés : c’est la courbe de Bézier (10⁻¹²)', () => {
    expect(clampedKnots(4, 3)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    for (const t of [0, 0.2, 0.5, 0.9, 1]) {
      const p = splinePointAt(sp(), t), q = bezier(sp().points, t);
      expect(p.x).toBeCloseTo(q.x, 12);
      expect(p.y).toBeCloseTo(q.y, 12);
    }
    expect(splineEndpoints(sp())).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }]);
  });

  it('nœuds bornés uniformes pour plus de points ; extrémités au premier et au dernier point', () => {
    expect(clampedKnots(6, 3)).toEqual([0, 0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1, 1]);
    const s = sp({ points: [0, 0, 10, 10, 20, -10, 30, 10, 40, -10, 50, 0] });
    expect(isValidSpline(s)).toBe(true);
    expect(splineEndpoints(s)).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }]);
    // Degré 1 : la polyligne de contrôle elle-même.
    const lin = sp({ points: [0, 0, 30, 40], degree: 1 });
    expect(splineLength(lin)).toBeCloseTo(50, 9);
  });

  it('spline invalide refusée (nœuds en nombre faux, décroissants, poids nuls)', () => {
    expect(isValidSpline(sp({ knots: [0, 0, 0, 1, 1, 1] }))).toBe(false);
    expect(isValidSpline(sp({ knots: [0, 0, 0, 0, 1, 1, 0.5, 1] }))).toBe(false);
    expect(isValidSpline(sp({ weights: [1, 0, 1, 1] }))).toBe(false);
    expect(isValidSpline(sp({ points: [0, 0, 1, 1], degree: 3 }))).toBe(false);
  });

  it('rationnelle : quart de cercle exact par une NURBS de degré 2', () => {
    const q = sp({ points: [10, 0, 10, -10, 0, -10], degree: 2, weights: [1, Math.SQRT1_2, 1], knots: [0, 0, 0, 1, 1, 1] });
    for (const t of [0.1, 0.37, 0.5, 0.8]) {
      const p = splinePointAt(q, t);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 12);
    }
  });

  it('transformations exactes : la courbe transformée passe par les points transformés', () => {
    const s = sp();
    const check = (patch: Partial<SplineObj>, f: (p: { x: number; y: number }) => { x: number; y: number }) => {
      const t2 = { ...s, ...patch };
      for (const u of [0.1, 0.4, 0.75]) {
        const a = f(splinePointAt(s, u)), b = splinePointAt(t2, u);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
      }
    };
    check(moveObject(s, 5, -7) as Partial<SplineObj>, p => ({ x: p.x + 5, y: p.y - 7 }));
    check(rotateObject(s, 0, 0, 90) as Partial<SplineObj>, p => ({ x: -p.y, y: p.x }));
    check(mirrorObject(s, 'x', 0) as Partial<SplineObj>, p => ({ x: -p.x, y: p.y }));
    check(scaleObject(s, 0, 0, 3) as Partial<SplineObj>, p => ({ x: 3 * p.x, y: 3 * p.y }));
  });

  it('approche, emprise, distance et accrochage aux extrémités', () => {
    const s = sp();
    const pts = splineSamples(s, 0.001);
    for (let i = 0; i + 1 < pts.length; i++) {
      const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      // Écart de corde ≤ 0,001 mm, distance mesurée sur l’approche à 0,01 mm (désignation).
      expect(distanceToSpline(s, m)).toBeLessThan(0.011);
    }
    const b = splineBounds(s);
    expect(b.minX).toBeCloseTo(0, 9);
    expect(b.maxX).toBeCloseTo(30, 9);
    // Extrémums de la Bézier : y(t) = 60 t (1 − t)(2t − 1) → ± 5,773 50 à t = ½ ∓ √3/6.
    expect(b.maxY).toBeCloseTo(60 * (Math.sqrt(3) / 6) * (0.5 - Math.sqrt(3) / 6) * (0.5 + Math.sqrt(3) / 6) * 2, 3);
    expect(findSnap([s], [], [], 29.6, 0.4, 2)).toMatchObject({ type: 'endpoint', x: 30, y: 0 });
  });
});
