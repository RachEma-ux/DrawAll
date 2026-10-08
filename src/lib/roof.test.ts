import { describe, expect, it } from 'vitest';
import type { CadObject, RoofObj } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { exportDxf, exportToDxf } from './dxf';
import { mirrorObject, moveObject, objectBounds, rotateObject } from './geometry';
import { defaultIfcClass } from './properties';
import { roofError, roofGeometry, roofInput, roofPrimitives, type RoofInput } from './roof';
import { stretchObject, stretchPreview } from './stretch';

const tan = (d: number) => Math.tan((d * Math.PI) / 180);
const R = (p: Partial<RoofInput>): RoofInput => ({ x: 0, y: 0, w: 10000, h: 8000, type: 'deux-pans', pitch: 35, overhang: 0, axis: 'x', ...p });
const obj = (p: Partial<RoofObj> = {}): RoofObj => ({ id: 'OBJ-0001', name: 'T', kind: 'roof', classification: 'architecture', layerId: 'LAY-0001', hatch: 'none', createdSeq: 0, x: 0, y: 0, w: 10000, h: 8000, roofType: 'deux-pans', pitch: 35, overhang: 0, axis: 'x', ...p });

describe('toitures (lot 13.2)', () => {
  it('deux pans : faîtage au milieu, hauteur = demi-portée × tan(pente) ; débord compris', () => {
    const g = roofGeometry(R({}));
    expect(g.ridge).toEqual([{ x: 0, y: 4000 }, { x: 10000, y: 4000 }]);
    expect(g.ridgeHeight).toBeCloseTo(4000 * tan(35), 9);
    expect(g.ridgeLength).toBe(10000);
    expect(g.slopeAreaM2).toBeCloseTo(80 / Math.cos((35 * Math.PI) / 180), 9);
    expect(g.arrows).toHaveLength(2);
    // Débord de 500 : égout plus bas, hauteur au droit du contour inchangée.
    const d = roofGeometry(R({ overhang: 500 }));
    expect(d.ridgeHeight).toBeCloseTo(4500 * tan(35), 9);
    expect(d.ridgeAboveContour).toBeCloseTo(4000 * tan(35), 9);
    expect(d.outline[0]).toEqual({ x: -500, y: -500 });
    // Faîtage vertical.
    expect(roofGeometry(R({ axis: 'y' })).ridgeHeight).toBeCloseTo(5000 * tan(35), 9);
  });

  it('quatre pans à 45° sur 10 × 8 m : faîtage de 2 m, quatre arêtiers de √48 m', () => {
    const g = roofGeometry(R({ type: 'quatre-pans', pitch: 45 }));
    expect(g.ridge).toEqual([{ x: 4000, y: 4000 }, { x: 6000, y: 4000 }]);
    expect(g.ridgeLength).toBe(2000);
    expect(g.ridgeHeight).toBeCloseTo(4000, 9);
    expect(g.hips).toEqual([
      [{ x: 0, y: 0 }, { x: 4000, y: 4000 }], [{ x: 10000, y: 0 }, { x: 6000, y: 4000 }],
      [{ x: 10000, y: 8000 }, { x: 6000, y: 4000 }], [{ x: 0, y: 8000 }, { x: 4000, y: 4000 }],
    ]);
    for (const l of g.hipLengths) expect(l).toBeCloseTo(Math.sqrt(48e6), 6);
    expect(g.arrows).toHaveLength(4);
    // Plus profond que large : faîtage selon Y.
    expect(roofGeometry(R({ type: 'quatre-pans', w: 6000, h: 9000, pitch: 30 })).ridge).toEqual([{ x: 3000, y: 3000 }, { x: 3000, y: 6000 }]);
  });

  it('quatre pans sur carré : pyramide, arêtiers vers le centre', () => {
    const g = roofGeometry(R({ type: 'quatre-pans', w: 6000, h: 6000, pitch: 40 }));
    expect(g.ridge).toBeNull();
    expect(g.ridgeLength).toBe(0);
    expect(g.hips.every(([, b]) => b.x === 3000 && b.y === 3000)).toBe(true);
    expect(g.hipLengths[0]).toBeCloseTo(Math.sqrt(2 * 9e6 + (3000 * tan(40)) ** 2), 6);
  });

  it('un pan : rive haute du côté choisi, hauteur = portée × tan(pente), flèche vers le bas du pan', () => {
    const g = roofGeometry(R({ type: 'un-pan', w: 6000, h: 4000, pitch: 10, highSide: 'min' }));
    expect(g.ridge).toEqual([{ x: 0, y: 0 }, { x: 6000, y: 0 }]);
    expect(g.ridgeHeight).toBeCloseTo(4000 * tan(10), 9);
    expect(g.arrows[0][1].y).toBeGreaterThan(g.arrows[0][0].y);
    const m = roofGeometry(R({ type: 'un-pan', w: 6000, h: 4000, pitch: 10, highSide: 'max', axis: 'y' }));
    expect(m.ridge).toEqual([{ x: 6000, y: 0 }, { x: 6000, y: 4000 }]);
    expect(m.ridgeHeight).toBeCloseTo(6000 * tan(10), 9);
  });

  it('valeurs refusées', () => {
    expect(roofError(R({ pitch: 0 }))).toBe('Toiture : pente entre 0 et 90° (exclus) attendue.');
    expect(roofError(R({ pitch: 90 }))).not.toBeNull();
    expect(roofError(R({ overhang: -1 }))).toBe('Toiture : débord positif ou nul attendu.');
    expect(roofError(R({ w: 0 }))).not.toBeNull();
    expect(roofError(R({}))).toBeNull();
  });

  it('transformations : déplacer, quart de tour (axe et rive haute suivent), symétrie, étirer ; emprise débord compris', () => {
    const o = obj({ overhang: 300 });
    expect(objectBounds(o, [], [])).toEqual({ minX: -300, minY: -300, maxX: 10300, maxY: 8300 });
    expect(moveObject(o, 100, 200)).toEqual({ x: 100, y: 200 });
    const turned = { ...o, ...rotateObject(o, 0, 0, 90) } as RoofObj;
    expect(turned.axis).toBe('y');
    expect([turned.w, turned.h]).toEqual([8000, 10000]);
    expect(rotateObject(o, 0, 0, 30)).toBeNull();
    const mono = obj({ roofType: 'un-pan', highSide: 'min' });
    expect(({ ...mono, ...mirrorObject(mono, 'y', 0) } as RoofObj).highSide).toBe('max');
    expect(({ ...mono, ...mirrorObject(mono, 'x', 0) } as RoofObj).highSide).toBe('min');
    const monoTurned = { ...mono, ...rotateObject(mono, 5000, 4000, 180) } as RoofObj;
    expect(monoTurned.highSide).toBe('max');
    expect(stretchObject(o, { minX: 9900, minY: -100, maxX: 10100, maxY: 8100 }, 1000, 0)).toEqual({ x: 0, y: 0, w: 11000, h: 8000 });
  });

  it('représentation : rive, faîtage, arêtiers et flèches ; DXF ; classe IFC', () => {
    const o = obj({ roofType: 'quatre-pans', pitch: 45 });
    const prims = roofPrimitives(o, roofInput(o));
    // 1 rive + 1 faîtage + 4 arêtiers + 4 flèches × 3 traits.
    expect(prims).toHaveLength(1 + 1 + 4 + 12);
    expect(prims[0]).toMatchObject({ kind: 'polyline', points: [0, 0, 10000, 0, 10000, 8000, 0, 8000, 0, 0] });
    const dxf = exportToDxf([o as CadObject], createDefaultLayers(), []);
    expect(dxf.match(/\nLINE\n/g)?.length).toBe(17);
    expect(dxf).toContain('LWPOLYLINE');
    expect(defaultIfcClass(o)).toBe('IfcRoof');
    // Rapport d'échange : la toiture devient des traits, ses paramètres sont perdus.
    const { report } = exportDxf([o as CadObject], createDefaultLayers(), []);
    expect(report.transformed).toContain('Toitures : 1 → rive (LWPOLYLINE), faîtage, arêtiers et flèches (LINE) ; type, pente, débord et axe ne sont plus éditables comme toiture.');
  });

  it('aperçu d’étirement : les coins capturés de la toiture à leur place finale', () => {
    expect(stretchPreview([obj({})], { minX: 9900, minY: -100, maxX: 10100, maxY: 8100 }, 1000, 0)).toEqual([{ x: 11000, y: 0 }, { x: 11000, y: 8000 }]);
  });
});
