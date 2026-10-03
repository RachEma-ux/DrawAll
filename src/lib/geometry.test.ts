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
