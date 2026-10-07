import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { extendObject, trimObject } from './edit';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
const line = (id: string, x1: number, y1: number, x2: number, y2: number): CadObject => ({ ...base, id, kind: 'line', x1, y1, x2, y2 });

describe('ajuster', () => {
  const h = line('H', 0, 0, 100, 0);
  const v1 = line('V1', 30, -50, 30, 50);
  const v2 = line('V2', 70, -50, 70, 50);

  it('retire la partie d’une ligne entre deux arêtes et garde les deux bouts', () => {
    const r = trimObject(h, [h, v1, v2], { x: 50, y: 1 })!;
    expect(r.remove).toBe(false);
    expect(r.patch).toEqual({ x1: 0, y1: 0, x2: 30, y2: 0 });
    expect(r.added).toEqual([{ kind: 'line', x1: 70, y1: 0, x2: 100, y2: 0 }]);
  });

  it('retire un bout de ligne au-delà de la dernière arête', () => {
    const r = trimObject(h, [h, v1], { x: 10, y: 0 })!;
    expect(r.patch).toEqual({ x1: 30, y1: 0, x2: 100, y2: 0 });
    expect(r.added).toEqual([]);
  });

  it('ne fait rien sans arête de coupe', () => {
    expect(trimObject(h, [h, line('Loin', 0, 50, 100, 50)], { x: 50, y: 0 })).toBeNull();
  });

  it('transforme un cercle coupé en arc (la partie désignée disparaît)', () => {
    const c: CadObject = { ...base, id: 'C', kind: 'circle', cx: 0, cy: 0, r: 10 };
    const cut = line('X', -20, 0, 20, 0); // coupe en 0° et 180°
    const r = trimObject(c, [c, cut], { x: 0, y: -10 })!; // haut de l'écran = 90°
    expect(r.remove).toBe(true);
    expect(r.added).toEqual([{ kind: 'arc', cx: 0, cy: 0, r: 10, start: 180, end: 0 }]); // reste la moitié basse
  });

  it('coupe un arc', () => {
    const a: CadObject = { ...base, id: 'A', kind: 'arc', cx: 0, cy: 0, r: 10, start: 0, end: 180 };
    const cut = line('Y', 0, -20, 0, 20); // coupe en 90°
    const r = trimObject(a, [a, cut], { x: 7, y: -7 })!; // côté 45°
    expect(r.patch).toEqual({ start: 90, end: 180 });
  });

  it('coupe une polyligne ouverte en deux', () => {
    const p: CadObject = { ...base, id: 'P', kind: 'polyline', points: [0, 0, 100, 0, 100, 100] };
    const r = trimObject(p, [p, line('C1', 40, -10, 40, 10), line('C2', 60, -10, 60, 10)], { x: 50, y: 0 })!;
    expect(r.patch).toEqual({ points: [0, 0, 40, 0] });
    expect(r.added).toEqual([{ kind: 'polyline', points: [60, 0, 100, 0, 100, 100] }]);
  });

  it('traite comme fermée une polyligne dont les bouts sont à moins de 0,01 mm (règle commune)', () => {
    const p: CadObject = { ...base, id: 'P', kind: 'polyline', points: [0, 0, 100, 0, 100, 100, 0, 100, 0.005, 0] };
    const v = line('V', 50, -50, 50, 50);
    const h = line('H', -50, 30, 150, 30);
    const r = trimObject(p, [p, v, h], { x: 75, y: 0 })!;
    // Contour fermé : on retire la portion entre les deux arêtes et il reste une seule polyligne ouverte.
    expect(r.remove).toBe(false);
    expect(r.added).toEqual([]);
    const kept = (r.patch as { points: number[] }).points;
    expect(kept.slice(0, 2)).toEqual([100, 30]);
    expect(kept.slice(-2)).toEqual([50, 0]);
    expect(extendObject(p, [p, v], { x: 0, y: 99 })).toBeNull();
  });

  it('ouvre un rectangle en polyligne en retirant le côté désigné', () => {
    const rect: CadObject = { ...base, id: 'R', kind: 'rect', x: 0, y: 0, w: 100, h: 50 };
    const r = trimObject(rect, [rect, line('C1', 30, -10, 30, 10), line('C2', 70, -10, 70, 10)], { x: 50, y: 0 })!;
    expect(r.remove).toBe(true);
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ kind: 'polyline' });
    const pts = (r.added[0] as { points: number[] }).points;
    expect([pts[0], pts[1]]).toEqual([70, 0]);
    expect([pts[pts.length - 2], pts[pts.length - 1]]).toEqual([30, 0]);
  });
});

describe('prolonger', () => {
  const wall = line('W', 100, -50, 100, 50);

  it('prolonge l’extrémité désignée jusqu’à la première arête', () => {
    const l = line('L', 0, 0, 60, 0);
    expect(extendObject(l, [l, wall], { x: 55, y: 0 })).toEqual({ patch: { x2: 100, y2: 0 }, remove: false, added: [] });
  });

  it('prolonge l’origine dans l’autre sens', () => {
    const l = line('L', 60, 0, 90, 0);
    const left = line('G', 10, -50, 10, 50);
    expect(extendObject(l, [l, wall, left], { x: 61, y: 0 })!.patch).toEqual({ x1: 10, y1: 0 });
  });

  it('prolonge jusqu’à un cercle', () => {
    const l = line('L', 0, 0, 20, 0);
    const c: CadObject = { ...base, id: 'C', kind: 'circle', cx: 100, cy: 0, r: 30 };
    expect(extendObject(l, [l, c], { x: 20, y: 0 })!.patch).toEqual({ x2: 70, y2: 0 });
  });

  it('prolonge un arc jusqu’à une ligne', () => {
    const a: CadObject = { ...base, id: 'A', kind: 'arc', cx: 0, cy: 0, r: 10, start: 0, end: 45 };
    const stop = line('S', -20, -10, 20, -10); // tangente en 90°
    const r = extendObject(a, [a, line('X', 0, 0, 0, -20)], { x: 7, y: -7 })!; // rayon vertical : 90°
    expect(r.patch).toEqual({ end: 90 });
    expect(stop.kind).toBe('line');
  });

  it('prolonge la dernière extrémité d’une polyligne ouverte', () => {
    const p: CadObject = { ...base, id: 'P', kind: 'polyline', points: [0, 50, 0, 0, 60, 0] };
    expect(extendObject(p, [p, wall], { x: 60, y: 0 })!.patch).toEqual({ points: [0, 50, 0, 0, 100, 0] });
  });

  it('ne fait rien sans limite dans la direction', () => {
    const l = line('L', 0, 0, 60, 0);
    expect(extendObject(l, [l, line('Haut', 0, -50, 200, -50)], { x: 60, y: 0 })).toBeNull();
  });
});
