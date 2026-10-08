import { describe, expect, it } from 'vitest';
import { arcPoints, ellipsePoints, nurbsPoint, sampleCurve, splinePoints } from './dxf-curves';

describe('courbes DXF approchées (lot 6.1)', () => {
  it('B-spline : extrémités serrées, quart de cercle rationnel exact', () => {
    // Quart de cercle de rayon 10 en B-spline rationnelle de degré 2.
    const ctrl = [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const knots = [0, 0, 0, 1, 1, 1], w = [1, Math.SQRT1_2, 1];
    expect(nurbsPoint(2, knots, ctrl, w, 0)).toEqual({ x: 10, y: 0 });
    const end = nurbsPoint(2, knots, ctrl, w, 1);
    expect(end.x).toBeCloseTo(0, 12); expect(end.y).toBeCloseTo(10, 12);
    const s = splinePoints(2, knots, ctrl, w, [], 0.01)!;
    for (const p of s.points) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 9);
    expect(s.error).toBeLessThanOrEqual(0.01);
  });

  it('B-spline non rationnelle : écart de corde borné par la tolérance', () => {
    const ctrl = [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: -20 }, { x: 30, y: 0 }];
    const s = splinePoints(3, [0, 0, 0, 0, 1, 1, 1, 1], ctrl, null, [], 0.05)!;
    expect(s.points[0]).toEqual({ x: 0, y: 0 });
    expect(s.points[s.points.length - 1].x).toBeCloseTo(30, 9);
    expect(s.error).toBeLessThanOrEqual(0.05);
    // Points d'ajustement seuls : polyligne qui les relie.
    expect(splinePoints(3, [], [], null, [{ x: 0, y: 0 }, { x: 5, y: 5 }], 0.05)!.points).toHaveLength(2);
  });

  it('ellipse : points sur l’ellipse, demi-ellipse', () => {
    const s = ellipsePoints({ x: 0, y: 0 }, { x: 20, y: 0 }, 0.5, 0, Math.PI, 0.05);
    for (const p of s.points) expect((p.x / 20) ** 2 + (p.y / 10) ** 2).toBeCloseTo(1, 9);
    expect(s.points[s.points.length - 1].x).toBeCloseTo(-20, 9);
    expect(s.error).toBeLessThanOrEqual(0.05);
  });

  it('arc d’arête de hachure, sens trigonométrique ou horaire', () => {
    const ccw = arcPoints({ x: 0, y: 0 }, 10, 0, 90, true, 0.01);
    expect(ccw.points[ccw.points.length - 1].y).toBeCloseTo(10, 9);
    const cw = arcPoints({ x: 0, y: 0 }, 10, 0, 90, false, 0.01);
    expect(cw.points[cw.points.length - 1].y).toBeCloseTo(-10, 9);
    expect(sampleCurve(t => ({ x: t, y: 0 }), 0, 1, 0.01, 2).points).toHaveLength(3);
  });
  it('portion en S passant par sa corde en son milieu : subdivisée jusqu’à la tolérance', () => {
    const f = (t: number) => ({ x: t, y: Math.sin(2 * Math.PI * t) });
    const s = sampleCurve(f, 0, 1, 0.01, 1);
    expect(s.points.length).toBeGreaterThan(10);
    const seg = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
    };
    for (let i = 0; i <= 200; i++) {
      const p = f(i / 200);
      let d = Infinity;
      for (let k = 0; k + 1 < s.points.length; k++) d = Math.min(d, seg(p, s.points[k], s.points[k + 1]));
      expect(d).toBeLessThan(0.015);
    }
  });
});
