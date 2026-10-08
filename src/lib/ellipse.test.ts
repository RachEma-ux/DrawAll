// Ellipse native (lot 10.1) : point paramétrique, boîte, longueur, aire, construction, Bézier.
import { describe, expect, it } from 'vitest';
import type { EllipseObj } from '@/types/cad';
import { affineEllipse, closestEllipseParam, ellipseBeziers, ellipseMidpoint, ellipseBounds, ellipseFrom3Points, ellipseLength, ellipsePointAt, ellipseSamples, ellipseArea } from './ellipse';
import { findSnap, mirrorObject, rotateObject, scaleObject } from './geometry';

const base = { id: 'OBJ-0001', name: 'E', classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const e = (p: Partial<EllipseObj> = {}): EllipseObj => ({ ...base, kind: 'ellipse', cx: 100, cy: 50, rx: 20, ry: 10, rotation: 0, ...p });

/** Le point vérifie-t-il l'équation de l'ellipse (repère DXF, axes tournés) ? */
function onEllipse(o: EllipseObj, p: { x: number; y: number }): number {
  const th = (o.rotation * Math.PI) / 180, X = p.x - o.cx, Y = -(p.y - o.cy);
  const u = X * Math.cos(th) + Y * Math.sin(th), v = -X * Math.sin(th) + Y * Math.cos(th);
  return (u / o.rx) ** 2 + (v / o.ry) ** 2;
}

describe('ellipse native (lot 10.1)', () => {
  it('point paramétrique : repère DXF, Y du modèle vers le bas, rotation des axes', () => {
    expect(ellipsePointAt(e(), 0)).toEqual({ x: 120, y: 50 });
    const top = ellipsePointAt(e(), 90);
    expect(top.x).toBeCloseTo(100, 12);
    expect(top.y).toBeCloseTo(40, 12); // +Y DXF = vers le haut de l'écran
    const r = ellipsePointAt(e({ rotation: 90 }), 0);
    expect(r.x).toBeCloseTo(100, 12);
    expect(r.y).toBeCloseTo(30, 12);
  });

  it('boîte englobante exacte, ellipse tournée et arc d’ellipse', () => {
    const o = e({ rotation: 30 });
    const b = ellipseBounds(o);
    const pts = ellipseSamples(o, 1e-4);
    expect(b.maxX).toBeCloseTo(Math.max(...pts.map(p => p.x)), 3);
    expect(b.minY).toBeCloseTo(Math.min(...pts.map(p => p.y)), 3);
    // Demi-largeur analytique : √(rx² cos² θ + ry² sin² θ).
    expect(b.maxX - 100).toBeCloseTo(Math.sqrt(400 * Math.cos(Math.PI / 6) ** 2 + 100 * Math.sin(Math.PI / 6) ** 2), 9);
    const half = ellipseBounds(e({ start: 0, end: 180 }));
    expect(half).toEqual({ minX: 80, minY: 40, maxX: 120, maxY: 50 });
  });

  it('longueur et aire : cercle exact, ellipse 40 × 20 (périmètre de référence)', () => {
    expect(ellipseLength(e({ rx: 10, ry: 10 }))).toBeCloseTo(2 * Math.PI * 10, 9);
    // Périmètre de l'ellipse a = 20, b = 10 : 4a·E(m = 0,75) = 80 × 1,211 056 027 568 459 = 96,884 482 205 5.
    expect(ellipseLength(e())).toBeCloseTo(96.8844822055, 8);
    expect(ellipseLength(e({ start: 0, end: 90 }))).toBeCloseTo(96.8844822055 / 4, 8);
    expect(ellipseArea(e())).toBeCloseTo(Math.PI * 200, 9);
    expect(ellipseArea(e({ start: 0, end: 90 }))).toBeUndefined();
  });

  it('par trois points : centre, extrémité du premier axe, distance au premier axe', () => {
    const g = ellipseFrom3Points({ x: 0, y: 0 }, { x: 30, y: -30 }, { x: 0, y: -10 })!;
    expect(g.rx).toBeCloseTo(30 * Math.SQRT2, 9);
    expect(g.rotation).toBeCloseTo(45, 9);
    expect(g.ry).toBeCloseTo(10 / Math.SQRT2, 9);
    expect(ellipseFrom3Points({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBeNull();
    expect(ellipseFrom3Points({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 5 })).toBeNull();
  });

  it('Bézier du PDF : à moins de 10⁻³ mm de l’ellipse sur toute la courbe', () => {
    const o = e({ rotation: 25, start: 10, end: 300 });
    for (const [p0, p1, p2, p3] of ellipseBeziers(o)) {
      for (const t of [0.25, 0.5, 0.75]) {
        const m = (a: number, b: number, c: number, d: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
        const q = { x: m(p0.x, p1.x, p2.x, p3.x), y: m(p0.y, p1.y, p2.y, p3.y) };
        const near = ellipsePointAt(o, closestEllipseParam(o, q));
        expect(Math.hypot(q.x - near.x, q.y - near.y)).toBeLessThan(1e-3);
      }
    }
  });

  it('rotation, symétrie et échelle : les points de la courbe restent sur la courbe transformée', () => {
    const o = e({ rotation: 20, start: 30, end: 200 });
    const check = (patched: EllipseObj, map: (p: { x: number; y: number }) => { x: number; y: number }) => {
      for (const t of [30, 80, 150, 200]) expect(onEllipse(patched, map(ellipsePointAt(o, t)))).toBeCloseTo(1, 9);
      // Extrémités conservées (à l'échange près début / fin pour une symétrie).
      const ends = [ellipsePointAt(patched, patched.start!), ellipsePointAt(patched, patched.end!)];
      const mapped = [map(ellipsePointAt(o, 30)), map(ellipsePointAt(o, 200))];
      for (const m of mapped) expect(Math.min(...ends.map(p => Math.hypot(p.x - m.x, p.y - m.y)))).toBeLessThan(1e-6);
    };
    check({ ...o, ...rotateObject(o, 0, 0, 90) } as EllipseObj, p => ({ x: -p.y, y: p.x }));
    check({ ...o, ...mirrorObject(o, 'x', 0) } as EllipseObj, p => ({ x: -p.x, y: p.y }));
    check({ ...o, ...mirrorObject(o, 'y', 0) } as EllipseObj, p => ({ x: p.x, y: -p.y }));
    check({ ...o, ...scaleObject(o, 0, 0, 2) } as EllipseObj, p => ({ x: 2 * p.x, y: 2 * p.y }));
  });

  it('accrochages : centre, quadrants ; extrémités et milieu pour un arc d’ellipse', () => {
    const snap = (o: EllipseObj, x: number, y: number) => findSnap([o], [], [], x, y, 2);
    expect(snap(e(), 100.5, 49.5)).toMatchObject({ type: 'center', x: 100, y: 50 });
    expect(snap(e(), 80.5, 50.5)).toMatchObject({ type: 'quadrant', x: 80, y: 50 });
    expect(snap(e({ rotation: 90 }), 100.5, 30.5)).toMatchObject({ type: 'quadrant', x: 100, y: 30 });
    // Arc d'ellipse de 0 à 90° : extrémités (120 ; 50) et (100 ; 40) ; le quadrant 180° n'en fait pas partie.
    expect(snap(e({ start: 0, end: 90 }), 100.4, 40.4)).toMatchObject({ x: 100, y: 40 });
    expect(snap(e({ start: 0, end: 90 }), 80.5, 50.5).type).not.toBe('quadrant');
  });
});

describe('ellipse transformée par une application affine (blocs DXF)', () => {
  it('rotation, échelle non uniforme, symétrie, cisaillement : chaque point suit, extrémités comprises', () => {
    const o = e({ rotation: 20, start: 30, end: 250 });
    const T = { x: 7, y: -3 }, B = { x: 100, y: 50 };
    for (const M of [
      { a: 0, b: -1, c: 1, d: 0 },            // quart de tour
      { a: 2, b: 0, c: 0, d: 0.5 },           // échelle non uniforme
      { a: -1, b: 0, c: 0, d: 1 },            // symétrie
      { a: 1.5, b: 0.7, c: -0.2, d: -0.9 },   // quelconque, déterminant négatif
    ]) {
      const g = affineEllipse(o, M, T, B)!;
      const map = (p: { x: number; y: number }) => ({ x: T.x + M.a * (p.x - B.x) + M.b * (p.y - B.y), y: T.y + M.c * (p.x - B.x) + M.d * (p.y - B.y) });
      const target = { ...o, ...g } as EllipseObj;
      for (const t of [30, 77, 140, 250]) {
        const p = map(ellipsePointAt(o, t));
        expect(onEllipse(target, p)).toBeCloseTo(1, 9);
      }
      // Les extrémités de l'arc transformé sont les images des extrémités (dans un ordre ou l'autre).
      const ends = [ellipsePointAt(target, target.start!), ellipsePointAt(target, target.end!)];
      for (const q of [map(ellipsePointAt(o, 30)), map(ellipsePointAt(o, 250))]) {
        expect(Math.min(...ends.map(p => Math.hypot(p.x - q.x, p.y - q.y)))).toBeLessThan(1e-9);
      }
      // Le milieu de l'arc transformé est l'image d'un point de l'arc d'origine (pas de son complément).
      const mid = ellipseMidpoint(target);
      const back = [...Array(721).keys()].map(i => map(ellipsePointAt(o, 30 + (220 * i) / 720)));
      expect(Math.min(...back.map(p => Math.hypot(p.x - mid.x, p.y - mid.y)))).toBeLessThan(0.5);
    }
  });
});
