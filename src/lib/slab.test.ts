import { describe, expect, it } from 'vitest';
import type { CadObject, SlabObj, WallObj } from '@/types/cad';
import { createDefaultLayers, dimensionOf } from '@/types/cad';
import { measureObject } from './area';
import { exportToDxf } from './dxf';
import { loopOf } from './hatch';
import { moveObject } from './geometry';
import { defaultIfcClass } from './properties';
import { roomPolygons } from './rooms';
import { pointInPolygon, polygonArea, slabAsPolyline, slabContour, slabQuantities } from './slab';
import { stretchObject } from './stretch';

const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const slab = (points: number[], thickness = 200): SlabObj => ({ ...base, id: 'OBJ-0010', name: 'Dalle', kind: 'slab', points, thickness });
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallObj => ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe' });

describe('dalles et planchers (lot 13.1)', () => {
  it('surface et volume de référence : 5 × 4 m, 200 mm → 20 m², 4 m³ ; contour en L', () => {
    expect(slabQuantities({ points: [0, 0, 5000, 0, 5000, 4000, 0, 4000], thickness: 200 })).toEqual({ areaM2: 20, volumeM3: 4 });
    // L : 6 × 2 m + 2 × 3 m = 18 m² ; sens de parcours indifférent.
    const L = [0, 0, 6000, 0, 6000, 2000, 2000, 2000, 2000, 5000, 0, 5000];
    expect(polygonArea(L) / 1e6).toBe(18);
    const reversed = Array.from({ length: L.length / 2 }, (_, i) => L.slice(L.length - 2 * (i + 1), L.length - 2 * i)).flat();
    expect(polygonArea(reversed) / 1e6).toBe(18);
    expect(slabQuantities({ points: L, thickness: 250 }).volumeM3).toBeCloseTo(4.5, 12);
  });

  it('contour : point de fermeture retiré, contour dégénéré refusé', () => {
    expect(slabContour([0, 0, 10, 0, 10, 10, 0, 0])).toEqual([0, 0, 10, 0, 10, 10]);
    expect(slabContour([0, 0, 10, 0, 20, 0])).toBeNull();
    expect(slabContour([0, 0, 10, 0])).toBeNull();
  });

  it('depuis une pièce : contour intérieur des murs (4,80 × 3,80 m pour des murs de 200 mm d’axe en axe 5 × 4 m)', () => {
    const objects: CadObject[] = [
      wall('W1', 0, 0, 5000, 0), wall('W2', 5000, 0, 5000, 4000), wall('W3', 5000, 4000, 0, 4000), wall('W4', 0, 4000, 0, 0),
      { ...base, id: 'R1', name: 'Séjour', kind: 'room', x: 2500, y: 2000 } as CadObject,
    ];
    const poly = roomPolygons(objects).get('R1')!;
    expect(pointInPolygon(poly, { x: 2500, y: 2000 })).toBe(true);
    expect(pointInPolygon(poly, { x: 6000, y: 2000 })).toBe(false);
    const q = slabQuantities({ points: poly.flatMap(p => [p.x, p.y]), thickness: 200 });
    expect(q.areaM2).toBeCloseTo(18.24, 9);
    expect(q.volumeM3).toBeCloseTo(3.648, 9);
  });

  it('dessin, mesures, hachure, déplacement, étirement, classe IFC, DXF', () => {
    const s = slab([0, 0, 3000, 0, 3000, 2000, 0, 2000], 250);
    expect(slabAsPolyline(s).points).toEqual([0, 0, 3000, 0, 3000, 2000, 0, 2000, 0, 0]);
    expect(measureObject(s)).toMatchObject({ closed: true, area: 6e6, length: 10000 });
    expect(loopOf(s)).toHaveLength(4);
    expect(moveObject(s, 100, -50)).toEqual({ points: [100, -50, 3100, -50, 3100, 1950, 100, 1950] });
    expect(stretchObject(s, { minX: 2900, minY: -100, maxX: 3100, maxY: 2100 }, 500, 0)).toEqual({ points: [0, 0, 3500, 0, 3500, 2000, 0, 2000] });
    expect(defaultIfcClass(s)).toBe('IfcSlab');
    expect(dimensionOf(s)).toBe('Dalle ép. 250 mm · 6 m²');
    const dxf = exportToDxf([s], createDefaultLayers(), []);
    expect(dxf).toContain('LWPOLYLINE');
  });
});
