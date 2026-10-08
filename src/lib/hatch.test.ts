import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { containedContours, hatchSegments, islandsOf, loopOf } from './hatch';
import { mirrorObject, rotateObject, scaleObject } from './geometry';
import { cloneAll, translation, withDependencies } from './array';

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

describe('les hachures suivent l’objet (lot 3.2)', () => {
  const b = { classification: 'non-classifie' as const, layerId: 'LAY-0001', createdSeq: 0, name: 'o' };
  const rect: CadObject = { ...b, id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 50, hatch: 'diagonal' };

  it('paramètres par défaut : l’angle tourne et se réfléchit avec l’objet', () => {
    expect(rotateObject(rect, 0, 0, 90)!.hatchParams).toMatchObject({ angle: 315, spacing: 3, unit: 'papier' });
    expect(mirrorObject(rect, 'x', 50).hatchParams).toMatchObject({ angle: 135 });
    // Un objet à matériau garde le motif de son profil (aucun paramètre figé).
    expect(rotateObject({ ...rect, materialId: 'beton' } as CadObject, 0, 0, 90)!.hatchParams).toBeUndefined();
  });

  it('l’origine du motif suit l’homothétie, la symétrie et la rotation', () => {
    const o = { ...rect, hatchParams: { angle: 45, spacing: 5, unit: 'modele' as const, originX: 10, originY: 5 } } as CadObject;
    expect(scaleObject(o, 0, 0, 2)!.hatchParams).toMatchObject({ spacing: 10, originX: 20, originY: 10 });
    expect(mirrorObject(o, 'x', 50).hatchParams).toMatchObject({ originX: 90, originY: 5 });
    // Rotation de 90° (sens horaire à l'écran) autour du coin : (10, 5) → (−5, 10) ; nouvelle emprise x ∈ [−50, 0].
    expect(rotateObject(o, 0, 0, 90)!.hatchParams).toMatchObject({ originX: 45, originY: 10 });
  });
});

describe('îlots copiés avec leur contour (lot 3.2)', () => {
  it('copier le contour copie ses îlots, rattachés à la copie', () => {
    const b = { classification: 'non-classifie' as const, layerId: 'LAY-0001', createdSeq: 0, name: 'o', hatch: 'none' as const };
    const objs: CadObject[] = [
      { ...b, id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 50, hatch: 'diagonal', holes: ['OBJ-0002'] },
      { ...b, id: 'OBJ-0002', kind: 'circle', cx: 50, cy: 25, r: 10 },
    ];
    const sources = withDependencies(objs, ['OBJ-0001']);
    expect(sources.map(o => o.id)).toEqual(['OBJ-0001', 'OBJ-0002']);
    const { objects: copies } = cloneAll(sources, [translation(200, 0)], 10, 1);
    expect(copies[0].holes).toEqual([copies[1].id]);
  });
});
