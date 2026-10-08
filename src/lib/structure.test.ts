import { describe, expect, it } from 'vitest';
import type { BeamObj, ColumnObj } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { exportToDxf } from './dxf';
import { mirrorObject, moveObject, objectBounds, rotateObject, scaleObject } from './geometry';
import { stretchPreview } from './stretch';
import { defaultIfcClass } from './properties';
import { beamEdges, beamError, beamLength, beamVolumeM3, columnError, columnSectionArea, columnVolumeM3, structurePrimitives } from './structure';

const base = { classification: 'structure' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'S' };
const col = (p: Partial<ColumnObj> = {}): ColumnObj => ({ ...base, id: 'OBJ-0001', kind: 'column', x: 1000, y: 2000, section: 'rect', b: 300, h: 400, ...p });
const beam = (p: Partial<BeamObj> = {}): BeamObj => ({ ...base, id: 'OBJ-0002', kind: 'beam', x1: 0, y1: 0, x2: 6000, y2: 0, b: 200, h: 500, ...p });

describe('poteaux et poutres (lot 13.4)', () => {
  it('sections saisies, contrôlées ; aucune valeur par défaut', () => {
    expect(columnError({ section: 'rect', b: 300, h: 400 })).toBeNull();
    expect(columnError({ section: 'rect', b: 300 })).toBe('Poteau : largeur et profondeur positives attendues.');
    expect(columnError({ section: 'circle', d: NaN })).toBe('Poteau : diamètre positif attendu.');
    expect(beamError({ x1: 0, y1: 0, x2: 0, y2: 0, b: 200, h: 500 })).toBe('Poutre : deux points distincts attendus.');
    expect(beamError({ x1: 0, y1: 0, x2: 1, y2: 0, b: 0, h: 500 })).toBe('Poutre : largeur et hauteur de section positives attendues.');
  });

  it('grandeurs : section, longueur, volumes ; volume du poteau non évalué sans hauteur', () => {
    expect(columnSectionArea(col())).toBe(120000);
    expect(columnSectionArea(col({ section: 'circle', d: 400 }))).toBeCloseTo(Math.PI * 40000, 9);
    expect(columnVolumeM3(col())).toBeNull();
    expect(columnVolumeM3(col({ height: 2700 }))).toBeCloseTo(0.324, 12);
    expect(beamLength(beam({ x2: 3000, y2: 4000 }))).toBe(5000);
    expect(beamVolumeM3(beam())).toBeCloseTo(0.6, 12);
  });

  it('plan : poteau en section pleine, poutre en traits interrompus aux nus', () => {
    const [c] = structurePrimitives(col());
    expect(c).toMatchObject({ kind: 'polyline', hatch: 'solid', points: [850, 1800, 1150, 1800, 1150, 2200, 850, 2200, 850, 1800] });
    expect(structurePrimitives(col({ section: 'circle', d: 400 }))[0]).toMatchObject({ kind: 'circle', cx: 1000, cy: 2000, r: 200, hatch: 'solid' });
    const lines = structurePrimitives(beam());
    expect(lines).toHaveLength(4);
    expect(lines.every(l => l.lineType === 'interrompu')).toBe(true);
    expect(beamEdges(beam())).toEqual([[{ x: 0, y: 100 }, { x: 6000, y: 100 }], [{ x: 0, y: -100 }, { x: 6000, y: -100 }]]);
  });

  it('DXF : section fermée, cercle, LINE en type interrompu ; classes IFC', () => {
    const dxf = exportToDxf([col(), col({ id: 'OBJ-0003', section: 'circle', d: 400 }), beam()], createDefaultLayers(), []);
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('\nCIRCLE\n');
    expect(dxf.match(/\nLINE\n/g)?.length).toBe(4);
    expect(dxf).toContain('ACAD_ISO02W100');
    expect(defaultIfcClass(col())).toBe('IfcColumn');
    expect(defaultIfcClass(beam())).toBe('IfcBeam');
  });

  it('transformations : déplacer, quart de tour (b et h échangés), rotation libre refusée pour une section rectangulaire, symétrie', () => {
    expect(moveObject(col(), 10, 20)).toEqual({ x: 1010, y: 2020 });
    expect(rotateObject(col(), 1000, 2000, 90)).toMatchObject({ b: 400, h: 300 });
    expect(rotateObject(col(), 1000, 2000, 30)).toBeNull();
    expect(rotateObject(col({ section: 'circle', d: 400 }), 0, 0, 30)).not.toBeNull();
    expect(mirrorObject(beam(), 'x', 0)).toMatchObject({ x1: 0, x2: -6000 });
    expect(objectBounds(beam(), [], [])).toEqual({ minX: 0, minY: -100, maxX: 6000, maxY: 100 });
  });

  it('poutre : homothétie en volume (section comprise) ; aperçu d’étirement de ses extrémités', () => {
    const b = beam({ x2: 4000 });
    const doubled = { ...b, ...scaleObject(b, 0, 0, 2) } as BeamObj;
    expect([doubled.b, doubled.h]).toEqual([400, 1000]);
    expect(beamVolumeM3(doubled)).toBeCloseTo(8 * beamVolumeM3(b), 12);
    expect(stretchPreview([b], { minX: 3900, minY: -100, maxX: 4100, maxY: 100 }, 1000, 0)).toEqual([{ x: 5000, y: 0 }]);
  });
});
