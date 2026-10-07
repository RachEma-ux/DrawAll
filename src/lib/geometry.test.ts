import { describe, expect, it } from 'vitest';
import type { CadObject, DimensionObj, DimensionStyle, Layer } from '@/types/cad';
import { dimensionMeasure, dimensionOf, dimensionValue, fmt, supportedDimensionStyles } from '@/types/cad';
import { constrainOrtho, dimensionGeometry, findSnap, moveObject } from './geometry';

const layers: Layer[] = [
  { id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false },
];

const base = {
  classification: 'non-classifie' as const,
  layerId: 'LAY-0001',
  hatch: 'none' as const,
  createdSeq: 0,
};

describe('accrochage objet', () => {
  it('trouve une extrémité de ligne', () => {
    const objects: CadObject[] = [{ ...base, id: 'OBJ-0001', name: 'Ligne', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }];
    const snap = findSnap(objects, layers, [], 3, 2, 8, 10);
    expect(snap.type).toBe('endpoint');
    expect(snap.x).toBe(0);
    expect(snap.y).toBe(0);
  });

  it('trouve une intersection entre deux segments', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'A', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 100 },
      { ...base, id: 'OBJ-0002', name: 'B', kind: 'line', x1: 0, y1: 100, x2: 100, y2: 0 },
    ];
    const snap = findSnap(objects, layers, [], 52, 48, 8, 10);
    expect(snap.type).toBe('intersection');
    expect(snap.x).toBe(50);
    expect(snap.y).toBe(50);
  });

  it('contraind le point en mode ortho', () => {
    expect(constrainOrtho({ x: 10, y: 10 }, { x: 80, y: 20 })).toEqual({ x: 80, y: 10 });
    expect(constrainOrtho({ x: 10, y: 10 }, { x: 20, y: 80 })).toEqual({ x: 10, y: 80 });
  });

  it('déplace une polyligne sans changer sa forme', () => {
    const object: CadObject = { ...base, id: 'OBJ-0003', name: 'Profil', kind: 'polyline', points: [0, 0, 10, 0, 10, 10] };
    expect(moveObject(object, 5, -2)).toEqual({ points: [5, -2, 15, -2, 15, 8] });
  });
});

import { mirrorObject, offsetObject, rotateObject, scaleObject, selectionCenter } from './geometry';

describe('transformations', () => {
  it('pivote une ligne de 90° autour de son origine', () => {
    const line: CadObject = { ...base, id: 'OBJ-0001', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 };
    const patch = rotateObject(line, 0, 0, 90);
    expect(patch).toMatchObject({ x1: 0, y1: 0, x2: 0, y2: 100 });
  });

  it('refuse la rotation non multiple de 90° pour un rectangle', () => {
    const rect: CadObject = { ...base, id: 'OBJ-0002', name: 'R', kind: 'rect', x: 10, y: 10, w: 40, h: 20 };
    expect(rotateObject(rect, 0, 0, 45)).toBeNull();
    expect(rotateObject(rect, 10, 10, 90)).toMatchObject({ x: -10, y: 10, w: 20, h: 40 });
  });

  it('reflete un rectangle par un axe vertical', () => {
    const rect: CadObject = { ...base, id: 'OBJ-0003', name: 'R', kind: 'rect', x: 60, y: 10, w: 40, h: 20 };
    expect(mirrorObject(rect, 'x', 100)).toMatchObject({ x: 100 });
  });

  it('applique une echelle x2 depuis l origine', () => {
    const circle: CadObject = { ...base, id: 'OBJ-0004', name: 'C', kind: 'circle', cx: 50, cy: 50, r: 10 };
    expect(scaleObject(circle, 0, 0, 2)).toMatchObject({ cx: 100, cy: 100, r: 20 });
    expect(scaleObject(circle, 0, 0, 0)).toBeNull();
  });

  it('decale une ligne sur sa normale gauche', () => {
    const line: CadObject = { ...base, id: 'OBJ-0005', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 };
    expect(offsetObject(line, 10)).toMatchObject({ x1: 0, y1: 10, x2: 100, y2: 10 });
  });

  it('dilate un rectangle de 10 mm de chaque cote', () => {
    const rect: CadObject = { ...base, id: 'OBJ-0006', name: 'R', kind: 'rect', x: 10, y: 10, w: 40, h: 20 };
    expect(offsetObject(rect, 10)).toMatchObject({ x: 0, y: 0, w: 60, h: 40 });
    expect(offsetObject(rect, -20)).toBeNull();
  });

  it('calcule le centre commun d une selection', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0007', name: 'A', kind: 'rect', x: 0, y: 0, w: 100, h: 100 },
      { ...base, id: 'OBJ-0008', name: 'B', kind: 'circle', cx: 200, cy: 200, r: 50 },
    ];
    expect(selectionCenter(['OBJ-0007', 'OBJ-0008'], objects, [])).toEqual({ x: 125, y: 125 });
  });
});

describe('cotes', () => {
  const line: CadObject = { ...base, id: 'OBJ-0001', name: 'Ligne', kind: 'line', x1: 0, y1: 0, x2: 3000, y2: 4000 };
  const dim = (style: DimensionStyle, targetId = 'OBJ-0001', offset = 40): DimensionObj => ({
    ...base, id: 'OBJ-0009', name: 'Cote', kind: 'dimension', targetId, style, offset,
  });

  it.each([
    ['horizontal', 3000],
    ['vertical', 4000],
    ['aligned', 5000],
  ] as const)('une cote %s sur une ligne mesure %i mm', (style, expected) => {
    expect(dimensionMeasure(dim(style), line)?.value).toBe(expected);
  });

  it('dessine la cote horizontale parallèle à X sur la portée ΔX', () => {
    const g = dimensionGeometry(dim('horizontal'), line)!;
    expect(g.y1).toBe(g.y2);
    expect(Math.abs(g.x2 - g.x1)).toBe(3000);
    expect(g.y1).toBe(4040);
  });

  it('dessine la cote verticale parallèle à Y sur la portée ΔY', () => {
    const g = dimensionGeometry(dim('vertical'), line)!;
    expect(g.x1).toBe(g.x2);
    expect(Math.abs(g.y2 - g.y1)).toBe(4000);
  });

  it('place la cote d\'un rectangle du côté du décalage', () => {
    const rect: CadObject = { ...base, id: 'OBJ-0002', name: 'Platine', kind: 'rect', x: 0, y: 0, w: 200, h: 120 };
    expect(dimensionGeometry(dim('horizontal', 'OBJ-0002', 20), rect)!.y1).toBe(140);
    expect(dimensionGeometry(dim('horizontal', 'OBJ-0002', -20), rect)!.y1).toBe(-20);
    expect(dimensionMeasure(dim('vertical', 'OBJ-0002'), rect)?.value).toBe(120);
  });

  it('applique le style par défaut quand le style demandé ne convient pas à la cible', () => {
    const circle: CadObject = { ...base, id: 'OBJ-0003', name: 'Perçage', kind: 'circle', cx: 0, cy: 0, r: 6.25 };
    expect(supportedDimensionStyles(circle)).toEqual(['radial']);
    expect(dimensionGeometry(dim('horizontal', 'OBJ-0003'), circle)).not.toBeNull();
    expect(dimensionValue(dim('horizontal', 'OBJ-0003'), [circle])).toBe('Ø 12,5 mm');
  });

  it('mesure l\'emprise d\'une polyligne', () => {
    const poly: CadObject = { ...base, id: 'OBJ-0004', name: 'Profil', kind: 'polyline', points: [0, 0, 100, 0, 100, 50, 20, 80] };
    expect(dimensionMeasure(dim('horizontal', 'OBJ-0004'), poly)?.value).toBe(100);
    expect(dimensionMeasure(dim('vertical', 'OBJ-0004'), poly)?.value).toBe(80);
  });
});

describe('précision affichée', () => {
  it('affiche jusqu\'à deux décimales sans arrondir au millimètre', () => {
    expect(fmt(12.345)).toBe('12,35');
    expect(fmt(12.49)).toBe('12,49');
    expect(fmt(0.8)).toBe('0,8');
    expect(fmt(5000)).toMatch(/^5[\s\u202f]000$/);
    expect(fmt(-0)).toBe('0');
  });

  it('ne modifie pas la géométrie stockée', () => {
    const line: CadObject = { ...base, id: 'OBJ-0001', name: 'Ligne', kind: 'line', x1: 0, y1: 0, x2: 12.345, y2: 0 };
    expect(dimensionOf(line)).toBe('L 12,35 mm');
    expect(line.kind === 'line' && line.x2).toBe(12.345);
  });
});

describe('transformations du texte', () => {
  const text: CadObject = { ...base, id: 'OBJ-0010', name: 'Séjour', kind: 'text', x: 100, y: 100, content: 'Séjour', height: 20, rotation: 0, align: 'left' };

  it('déplace le point d’insertion', () => {
    expect(moveObject(text, 10, -5)).toEqual({ x: 110, y: 95 });
  });

  it('tourne le point et l’orientation (+90° = sens horaire à l’écran)', () => {
    expect(rotateObject(text, 0, 0, 90)).toEqual({ x: -100, y: 100, rotation: -90 });
  });

  it('met la hauteur à l’échelle', () => {
    expect(scaleObject(text, 0, 0, 2)).toEqual({ x: 200, y: 200, height: 40 });
  });

  it('garde un texte lisible en miroir (seul le point est symétrisé)', () => {
    expect(mirrorObject(text, 'x', 0)).toEqual({ x: -100 });
  });

  it('s’accroche à son point d’insertion', () => {
    const snap = findSnap([text], layers, [], 102, 101, 8, 10);
    expect(snap).toMatchObject({ type: 'insertion', x: 100, y: 100 });
  });
});

describe('arcs dans l’atelier', () => {
  const arc: CadObject = { ...base, id: 'OBJ-0020', name: 'Arc', kind: 'arc', cx: 0, cy: 0, r: 100, start: 0, end: 90 };

  it('s’accroche aux extrémités, au milieu et au centre', () => {
    expect(findSnap([arc], layers, [], 99, 1, 5, 10)).toMatchObject({ type: 'endpoint', x: 100, y: 0 });
    expect(findSnap([arc], layers, [], 70, -71, 5, 10)).toMatchObject({ type: 'midpoint' });
    expect(findSnap([arc], layers, [], 1, 1, 5, 10)).toMatchObject({ type: 'center', x: 0, y: 0 });
  });

  it('ne compte que les intersections situées sur l’arc', () => {
    const through: CadObject = { ...base, id: 'OBJ-0021', name: 'L', kind: 'line', x1: -200, y1: -50, x2: 200, y2: -50 };
    // Le cercle porteur coupe la ligne en x = ±86,6 ; seul x = +86,6 (angle 30°) est sur l'arc 0–90°.
    expect(findSnap([arc, through], layers, [], 86.6, -50, 3, 10)).toMatchObject({ type: 'intersection' });
    expect(findSnap([arc, through], layers, [], -86.6, -50, 3, 10).type).not.toBe('intersection');
  });

  it('se transforme : rotation, miroir, échelle, décalage', () => {
    expect(rotateObject(arc, 0, 0, 90)).toMatchObject({ start: 270, end: 0 });
    expect(mirrorObject(arc, 'x', 0)).toMatchObject({ cx: 0, start: 90, end: 180 });
    expect(mirrorObject(arc, 'y', 0)).toMatchObject({ cy: 0, start: 270, end: 0 });
    expect(scaleObject(arc, 0, 0, 2)).toMatchObject({ r: 200 });
    expect(offsetObject(arc, -100)).toBeNull();
  });

  it('se cote en rayon', () => {
    const dim = { ...base, id: 'OBJ-0022', name: 'Cote', kind: 'dimension' as const, targetId: 'OBJ-0020', style: 'radial' as const, offset: 0 };
    expect(dimensionValue(dim, [arc])).toBe('R 100 mm');
  });
});
