import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { measureObject, measurePolygon, pathLength, polygonArea, selfIntersects } from './area';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o', id: 'O' };

describe('aire et périmètre', () => {
  it('polygone concave (L de 3 × 3 privé d’un carré 2 × 2)', () => {
    const L = [0, 0, 3000, 0, 3000, 1000, 1000, 1000, 1000, 3000, 0, 3000];
    expect(polygonArea(L)).toBe(5_000_000);
    expect(pathLength(L, true)).toBe(12000);
    expect(selfIntersects(L)).toBe(false);
    // Même résultat dans l'autre sens de parcours et avec le premier point répété.
    const reversed: number[] = [];
    for (let i = L.length - 2; i >= 0; i -= 2) reversed.push(L[i], L[i + 1]);
    expect(polygonArea(reversed)).toBe(5_000_000);
    expect(measurePolygon([...L, 0, 0])).toEqual({ closed: true, length: 12000, area: 5_000_000 });
  });

  it('contour croisé : aire non évaluée, périmètre donné', () => {
    const bowtie = [0, 0, 100, 100, 100, 0, 0, 100];
    expect(selfIntersects(bowtie)).toBe(true);
    const m = measurePolygon(bowtie);
    expect(m.area).toBeUndefined();
    expect(m.areaNote).toMatch(/croisé/);
    expect(m.length).toBeCloseTo(200 + 2 * Math.hypot(100, 100), 9);
  });

  it('cercle', () => {
    const m = measureObject({ ...base, kind: 'circle', cx: 0, cy: 0, r: 10 })!;
    expect(m.area).toBeCloseTo(Math.PI * 100, 12);
    expect(m.length).toBeCloseTo(20 * Math.PI, 12);
    expect(m.closed).toBe(true);
  });

  it('arc : longueur, segment et secteur', () => {
    const m = measureObject({ ...base, kind: 'arc', cx: 0, cy: 0, r: 10, start: 0, end: 90 })!;
    expect(m.closed).toBe(false);
    expect(m.area).toBeUndefined();
    expect(m.length).toBeCloseTo(5 * Math.PI, 12);
    expect(m.sectorArea).toBeCloseTo(25 * Math.PI, 12);
    expect(m.segmentArea).toBeCloseTo(25 * Math.PI - 50, 12);
  });

  it('rectangle, ligne et polylignes', () => {
    expect(measureObject({ ...base, kind: 'rect', x: 0, y: 0, w: 4000, h: 2500 })).toEqual({ closed: true, length: 13000, area: 10_000_000 });
    expect(measureObject({ ...base, kind: 'line', x1: 0, y1: 0, x2: 3, y2: 4 })).toEqual({ closed: false, length: 5 });
    expect(measureObject({ ...base, kind: 'polyline', points: [0, 0, 10, 0, 10, 10] })).toEqual({ closed: false, length: 20 });
    expect(measureObject({ ...base, kind: 'polyline', points: [0, 0, 10, 0, 10, 10, 0, 0] })).toMatchObject({ closed: true, area: 50 });
    expect(measureObject({ ...base, kind: 'text', x: 0, y: 0, content: 'A', height: 2.5, rotation: 0, align: 'left' } as CadObject)).toBeNull();
  });

  it('moins de trois points : pas d’aire', () => {
    expect(measurePolygon([0, 0, 10, 0]).area).toBeUndefined();
  });
});
