// Décalage à distance saisie (lot 10.4) : distance exacte, côté désigné, onglets, approche des courbes.
import { describe, expect, it } from 'vitest';
import type { CadObject, EllipseObj } from '@/types/cad';
import { offsetObject } from './offset';
import { distanceToEllipse } from './ellipse';
import { distanceToSpline } from './spline';

const base = { id: 'O', name: 'o', classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const ok = (r: ReturnType<typeof offsetObject>) => { if (!r.ok) throw new Error(r.reason); return r.partial as Record<string, unknown>; };

/** Distance d'un point à une polyligne. */
function distToPolyline(pts: number[], x: number, y: number) {
  let best = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const [ax, ay, bx, by] = pts.slice(i, i + 4), dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

describe('décalage à distance saisie (lot 10.4)', () => {
  it('ligne : parallèle à la distance exacte, du côté désigné', () => {
    const l: CadObject = { ...base, kind: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 };
    expect(ok(offsetObject(l, 25, { x: 500, y: 300 }))).toEqual({ kind: 'line', x1: 0, y1: 25, x2: 1000, y2: 25 });
    expect(ok(offsetObject(l, 25, { x: 500, y: -300 }))).toEqual({ kind: 'line', x1: 0, y1: -25, x2: 1000, y2: -25 });
    const oblique: CadObject = { ...base, kind: 'line', x1: 0, y1: 0, x2: 300, y2: 400 };
    const p = ok(offsetObject(oblique, 10, { x: 300, y: 0 }));
    // Distance du nouveau segment à l'ancien : 10 mm à 10⁻⁶ près, du côté du point.
    const d = Math.abs(((p.x1 as number) * 400 - (p.y1 as number) * 300)) / 500;
    expect(d).toBeCloseTo(10, 6);
    expect(p.x1 as number).toBeGreaterThan(0);
  });

  it('rectangle et cercle : vers l’extérieur ou l’intérieur selon le point ; trop grand refusé', () => {
    const r: CadObject = { ...base, kind: 'rect', x: 0, y: 0, w: 100, h: 60 };
    expect(ok(offsetObject(r, 5, { x: 200, y: 30 }))).toEqual({ kind: 'rect', x: -5, y: -5, w: 110, h: 70 });
    expect(ok(offsetObject(r, 5, { x: 50, y: 30 }))).toEqual({ kind: 'rect', x: 5, y: 5, w: 90, h: 50 });
    expect(offsetObject(r, 30, { x: 50, y: 30 }).ok).toBe(false);
    const c: CadObject = { ...base, kind: 'circle', cx: 0, cy: 0, r: 50 };
    expect(ok(offsetObject(c, 5, { x: 100, y: 0 }))).toMatchObject({ r: 55 });
    expect(ok(offsetObject(c, 5, { x: 10, y: 0 }))).toMatchObject({ r: 45 });
    expect(offsetObject(c, 60, { x: 10, y: 0 }).ok).toBe(false);
    expect(offsetObject(c, -1, { x: 10, y: 0 }).ok).toBe(false);
  });

  it('polyligne ouverte : onglet exact au sommet, côté du segment le plus proche', () => {
    const p: CadObject = { ...base, kind: 'polyline', points: [0, 0, 100, 0, 100, 100] };
    // Point au-dessus du premier segment (Y < 0) : côté extérieur du coude.
    expect(ok(offsetObject(p, 10, { x: 50, y: -20 })).points).toEqual([0, -10, 110, -10, 110, 100]);
    expect(ok(offsetObject(p, 10, { x: 50, y: 20 })).points).toEqual([0, 10, 90, 10, 90, 100]);
  });

  it('polyligne fermée : intérieur ou extérieur, quel que soit le sens de parcours', () => {
    for (const pts of [[0, 0, 100, 0, 100, 60, 0, 60, 0, 0], [0, 0, 0, 60, 100, 60, 100, 0, 0, 0]]) {
      const p: CadObject = { ...base, kind: 'polyline', points: pts };
      const out = ok(offsetObject(p, 5, { x: 200, y: 30 })).points as number[];
      expect(Math.min(...out.filter((_, i) => i % 2 === 0))).toBeCloseTo(-5, 9);
      expect(Math.max(...out.filter((_, i) => i % 2 === 0))).toBeCloseTo(105, 9);
      const inner = ok(offsetObject(p, 5, { x: 50, y: 30 })).points as number[];
      expect(Math.min(...inner.filter((_, i) => i % 2 === 1))).toBeCloseTo(5, 9);
      expect(inner.slice(0, 2)).toEqual(inner.slice(-2)); // reste fermée
    }
  });

  it('ellipse et spline : polyligne à 0,01 mm de la courbe décalée (distance à la courbe d’origine = d)', () => {
    const e: EllipseObj = { ...base, kind: 'ellipse', cx: 0, cy: 0, rx: 100, ry: 50, rotation: 30 };
    const r = offsetObject(e, 10, { x: 300, y: 0 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.approximated).toBe(true);
    const pts = (r.partial as { points: number[] }).points;
    for (let i = 0; i + 1 < pts.length; i += 2) expect(distanceToEllipse(e, { x: pts[i], y: pts[i + 1] })).toBeCloseTo(10, 4);
    expect(pts.slice(0, 2)).toEqual(pts.slice(-2));
    const s: CadObject = { ...base, kind: 'spline', degree: 3, points: [0, 0, 100, -100, 200, 100, 300, 0] };
    const sp = ok(offsetObject(s, 5, { x: 150, y: -200 })).points as number[];
    for (let i = 0; i + 1 < sp.length; i += 2) expect(distanceToSpline(s, { x: sp[i], y: sp[i + 1] })).toBeLessThan(5 + 0.02);
    expect(distToPolyline(sp, 0, 0)).toBeGreaterThan(4.9);
  });

  it('spline fermée : copie fermée ; portée de nœuds étroite : sa pointe n’est pas sautée', () => {
    // Spline fermée de degré 1 (carré) sans répétition du premier point : la copie se referme.
    const closed: CadObject = { ...base, kind: 'spline', degree: 1, closed: true, points: [0, 0, 100, 0, 100, 100, 0, 100, 0, 0] };
    const c = ok(offsetObject(closed, 5, { x: 200, y: 50 })).points as number[];
    expect(c.slice(0, 2)).toEqual(c.slice(-2));
    const open: CadObject = { ...base, kind: 'spline', degree: 1, closed: true, points: [0, 0, 100, 0, 100, 100, 0, 100], knots: [0, 0, 1, 2, 3, 3] };
    const o = ok(offsetObject(open, 5, { x: 200, y: 50 })).points as number[];
    expect(o.slice(0, 2)).toEqual(o.slice(-2));
    // Pointe de 50 mm dans une portée de paramètre 0,001 sur 1 : présente dans la copie.
    const spike: CadObject = { ...base, kind: 'spline', degree: 1, points: [0, 0, 100, 0, 100.5, -50, 101, 0, 200, 0], knots: [0, 0, 0.4995, 0.5, 0.5005, 1, 1] };
    const sp = ok(offsetObject(spike, 1, { x: 50, y: 20 })).points as number[];
    expect(Math.min(...sp.filter((_, i) => i % 2 === 1))).toBeLessThan(-45);
  });

  it('objet non décalable : message', () => {
    const t: CadObject = { ...base, kind: 'text', x: 0, y: 0, content: 'A', height: 10, rotation: 0, align: 'left' };
    expect(offsetObject(t, 5, { x: 0, y: 0 })).toMatchObject({ ok: false });
  });
});
