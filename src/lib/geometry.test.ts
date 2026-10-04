import { describe, expect, it } from 'vitest';
import type { CadObject, Layer } from '@/types/cad';
import { constrainOrtho, findSnap, moveObject } from './geometry';

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
