import { describe, expect, it } from 'vitest';
import type { PointDimensionObj } from '@/types/cad';
import { angleBetween, formatLevel, pdimGeometry, pdimValues, transformPdim } from './pdim';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'c', id: 'OBJ-0001', kind: 'pdim' as const };
const dim = (over: Partial<PointDimensionObj>): PointDimensionObj => ({ ...base, mode: 'chain', axis: 'horizontal', points: [], offset: 500, ...over });

describe('cotation en série', () => {
  const d = dim({ points: [0, 0, 1200, 100, 3000, 0, 4500, -50] });

  it('valeurs entre points successifs, projetées sur l’axe', () => {
    expect(pdimValues(d)).toEqual([1200, 1800, 1500]);
  });

  it('une ligne et deux flèches par intervalle, sur une même ligne de cote', () => {
    const g = pdimGeometry(d)!;
    expect(g.lines).toHaveLength(3);
    expect(g.arrows).toHaveLength(6);
    expect(g.ext).toHaveLength(4);
    // Ligne de cote à 500 mm au-delà du point le plus bas (y = 100) : y = 600.
    expect(g.lines.every(([, y1, , y2]) => y1 === 600 && y2 === 600)).toBe(true);
    expect(g.texts.map(t => t.value)).toEqual(['1\u202f200', '1\u202f800', '1\u202f500']);
    expect(g.texts[0].at).toEqual({ x: 600, y: 600 });
  });

  it('verticale et alignée', () => {
    expect(pdimValues(dim({ axis: 'vertical', points: [0, 0, 50, 300, 0, 1000] }))).toEqual([300, 700]);
    const aligned = dim({ axis: 'aligned', points: [0, 0, 300, 400, 600, 800] });
    expect(pdimValues(aligned)).toEqual([500, 500]);
    const g = pdimGeometry({ ...aligned, offset: 100 })!;
    // Ligne de cote parallèle aux points, à 100 mm.
    const [x1, y1, x2, y2] = g.lines[0];
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(500, 9);
    expect(Math.abs((x1 * 4 - y1 * 3) / 5)).toBeCloseTo(100, 9);
  });
});

describe('cotes cumulées', () => {
  it('distances depuis l’origine, une ligne, un repère d’origine', () => {
    const d = dim({ mode: 'baseline', points: [0, 0, 1200, 0, 3000, 0, 4500, 0], offset: -400 });
    expect(pdimValues(d)).toEqual([1200, 3000, 4500]);
    const g = pdimGeometry(d)!;
    expect(g.lines).toEqual([[0, -400, 4500, -400]]);
    expect(g.origins).toEqual([{ x: 0, y: -400 }]);
    expect(g.arrows).toHaveLength(3);
    expect(g.texts.map(t => t.value)).toEqual(['1\u202f200', '3\u202f000', '4\u202f500']);
    // Décalage négatif : la cote est au-dessus, le texte aussi.
    expect(g.texts[0].normal).toEqual({ x: -0, y: -1 });
  });
});

describe('cote angulaire', () => {
  it('angle au sommet entre deux branches (0 à 180°)', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(90, 12);
    expect(angleBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -10, y: 0.0001 })).toBeCloseTo(180, 2);
    expect(angleBetween({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: -10 })).toBeCloseTo(45, 12);
  });

  it('arc du plus petit côté, flèches aux extrémités, valeur en degrés', () => {
    const d = dim({ mode: 'angular', points: [0, 0, 100, 0, 0, -100], offset: 50 });
    const g = pdimGeometry(d)!;
    expect(g.arcs).toEqual([{ cx: 0, cy: 0, r: 50, start: 0, sweep: 90 }]);
    expect(g.arrows).toHaveLength(2);
    expect(g.arrows[0].tip.x).toBeCloseTo(50, 9);
    expect(g.arrows[1].tip.y).toBeCloseTo(-50, 9);
    expect(g.texts[0].value).toBe('90°');
    // Branches dans l'autre ordre : même arc.
    expect(pdimGeometry({ ...d, points: [0, 0, 0, -100, 100, 0] })!.arcs[0]).toMatchObject({ start: 0, sweep: 90 });
  });
});

describe('cote de niveau', () => {
  it('niveau en mètres par rapport au ±0,00 (Y vers le bas)', () => {
    expect(pdimValues(dim({ mode: 'level', points: [0, -2500], reference: 0 }))).toEqual([2.5]);
    expect(pdimValues(dim({ mode: 'level', points: [0, 300], reference: 0 }))).toEqual([-0.3]);
    expect(formatLevel(2.5)).toBe('+2,50');
    expect(formatLevel(-0.3)).toBe('−0,30');
    expect(formatLevel(0.004)).toBe('±0,00');
    const g = pdimGeometry(dim({ mode: 'level', points: [100, -2500], reference: 0, offset: 800 }))!;
    expect(g.levelMarks).toEqual([{ x: 100, y: -2500 }]);
    // Homothétie : le point, le ±0,00 et la longueur du repère suivent le facteur.
    expect(transformPdim(dim({ mode: 'level', points: [100, -2500], reference: 0, offset: 800 }), q => ({ x: q.x * 2, y: q.y * 2 }), { factor: 2 }))
      .toEqual({ points: [200, -5000], reference: 0, offset: 1600 });
    expect(g.texts[0].value).toBe('+2,50');
  });
});

describe('cas limites', () => {
  it('pas assez de points : pas de géométrie', () => {
    expect(pdimGeometry(dim({ points: [0, 0] }))).toBeNull();
    expect(pdimGeometry(dim({ mode: 'angular', points: [0, 0, 1, 1] }))).toBeNull();
    expect(pdimGeometry(dim({ mode: 'level', points: [] }))).toBeNull();
    expect(pdimGeometry(dim({ axis: 'aligned', points: [5, 5, 5, 5] }))).toBeNull();
  });
});
