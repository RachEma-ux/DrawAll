import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { containedContours, hatchSegments, islandsOf, loopOf } from './hatch';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', createdSeq: 0, name: 'o', hatch: 'diagonal' as const };
const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const len = (s: [number, number, number, number][]) => s.reduce((a, [x1, y1, x2, y2]) => a + Math.hypot(x2 - x1, y2 - y1), 0);

describe('hachures paramétrées', () => {
  it('angle 0°, pas 10 : dix traits de 100 mm', () => {
    const s = hatchSegments([square], 0, 10);
    expect(s).toHaveLength(10);
    expect(s.every(([, y1, , y2]) => y1 === y2)).toBe(true);
    expect(len(s)).toBeCloseTo(1000, 9);
    // Pas respecté entre deux traits voisins.
    const ys = s.map(([, y]) => y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(10, 12);
  });

  it('angle 45° : traits inclinés, écart perpendiculaire égal au pas', () => {
    const s = hatchSegments([square], 45, 5);
    const [x1, y1, x2, y2] = s[0];
    // Direction antihoraire à l'écran : x croît quand y décroît (Y vers le bas).
    expect(Math.sign(x2 - x1)).toBe(-Math.sign(y2 - y1));
    // Aire hachurée ≈ longueur totale × pas.
    expect(len(s) * 5).toBeGreaterThan(10000 * 0.95);
    expect(len(s) * 5).toBeLessThan(10000 * 1.05);
  });

  it('l’origine décale le motif', () => {
    const a = hatchSegments([square], 0, 10).map(([, y]) => y).sort((u, v) => u - v);
    const b = hatchSegments([square], 0, 10, { x: 0, y: 4 }).map(([, y]) => y).sort((u, v) => u - v);
    expect(b[0] - a[0]).toBeCloseTo(4, 12);
  });

  it('îlot : la partie intérieure n’est pas hachurée (règle pair-impair)', () => {
    const hole = [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 70, y: 70 }, { x: 30, y: 70 }];
    const s = hatchSegments([square, hole], 0, 10);
    expect(len(s)).toBeCloseTo(1000 - 4 * 40, 9);
    expect(s.every(([x1, y1, x2]) => !(y1 > 30 && y1 < 70 && x1 < 50 && x2 > 50))).toBe(true);
  });

  it('pas nul ou contour vide : aucun trait', () => {
    expect(hatchSegments([square], 45, 0)).toEqual([]);
    expect(hatchSegments([], 45, 3)).toEqual([]);
  });

  it('contours des objets et îlots désignés', () => {
    const outer: CadObject = { ...base, id: 'A', kind: 'rect', x: 0, y: 0, w: 100, h: 100, holes: ['B', 'C', 'Z'] };
    const inner: CadObject = { ...base, id: 'B', kind: 'circle', cx: 50, cy: 50, r: 10 };
    const open: CadObject = { ...base, id: 'C', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 };
    expect(islandsOf(outer, [outer, inner, open])).toHaveLength(1);
    expect(containedContours(outer, [outer, inner, open])).toEqual(['B']);
    const circle = loopOf(inner)!;
    // Polygone à 0,01 mm du cercle : le milieu d'une corde reste à moins de 0,01 mm.
    const [p, q] = circle;
    expect(10 - Math.hypot((p.x + q.x) / 2 - 50, (p.y + q.y) / 2 - 50)).toBeLessThanOrEqual(0.01);
  });
});
