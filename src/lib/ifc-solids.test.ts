import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, Level } from '@/types/cad';
import type { SolidRecipe } from './kernel/recipe';
import { exportIfc } from './ifc';
import { prismVolume, solidPrisms } from './solids';

describe('solides en prismes verticaux (lot 19.1)', () => {
  const box: SolidRecipe = { op: 'box', x: 1000, y: 500, z: 200, at: [10, 20, 30] };

  it('pavé, cylindre vertical, extrusion : prismes exacts', () => {
    expect(solidPrisms(box)).toEqual([{ ring: [[10, 20], [1010, 20], [1010, 520], [10, 520]], z0: 30, h: 200 }]);
    expect(solidPrisms({ op: 'cylinder', r: 12, h: 400, at: [0, 0, 300], dir: [0, 0, -1] })).toEqual([{ circle: { cx: 0, cy: 0, r: 12 }, z0: -100, h: 400 }]);
    expect(solidPrisms({ op: 'cylinder', r: 12, h: 400, dir: [1, 0, 0] })).toBeNull();
    expect(solidPrisms({ op: 'extrude', profile: [[0, 0], [100, 0], [0, 100]], height: 50, z: 5 })).toEqual([{ ring: [[0, 0], [100, 0], [0, 100]], z0: 5, h: 50 }]);
    expect(prismVolume(solidPrisms(box)![0])).toBe(1000 * 500 * 200);
  });

  it('déplacement, rotation verticale, symétrie, homothétie : volumes conservés (×k³)', () => {
    const turned = solidPrisms({ op: 'rotate', of: { op: 'translate', of: box, by: [0, 0, 100] }, angle: 90, about: [0, 0] })!;
    const ring = (turned[0] as { ring: [number, number][] }).ring.map(([x, y]) => [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9]);
    expect(ring).toEqual([[-20, 10], [-20, 1010], [-520, 1010], [-520, 10]]);
    expect(turned[0].z0).toBe(130);
    expect(prismVolume(solidPrisms({ op: 'mirror', of: box, axis: 'x', value: 0 })![0])).toBe(1e8);
    const scaled = solidPrisms({ op: 'scale', of: box, factor: 2, about: [0, 0, 0] })!;
    expect(prismVolume(scaled[0])).toBe(8e8);
    expect(scaled[0].z0).toBe(60);
  });

  it('union de parties disjointes : prismes additionnés ; recouvrement, perçage, congé : non prismatique', () => {
    const far: SolidRecipe = { op: 'box', x: 100, y: 100, z: 100, at: [5000, 0, 0] };
    expect(solidPrisms({ op: 'union', a: box, b: far })).toHaveLength(2);
    expect(solidPrisms({ op: 'union', a: box, b: { op: 'box', x: 100, y: 100, z: 100, at: [500, 100, 100] } })).toBeNull();
    expect(solidPrisms({ op: 'cut', a: box, b: far })).toBeNull();
    expect(solidPrisms({ op: 'fillet', of: box, r: 5 })).toBeNull();
    expect(solidPrisms({ op: 'compound', parts: [box, far] })).toHaveLength(2);
  });
});

// Atelier de référence (lot 19.1) : nef de 12 × 8 m (murs de 6 m), mezzanine à 3 m sur quatre poteaux,
// support de machine (platine) et quatre ancrages, armoire (pièce) et son occurrence tournée.
const base = { layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const levels: Level[] = [{ id: 'NIV-0001', name: 'Atelier', elevation: 0 }, { id: 'NIV-0002', name: 'Mezzanine', elevation: 3000 }, { id: 'NIV-0003', name: 'Toiture', elevation: 6000 }];
const wall = (id: string, x1: number, y1: number, x2: number, y2: number) =>
  ({ ...base, classification: 'architecture', id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 250, justification: 'axe', height: 6000, levelId: 'NIV-0001' }) as CadObject;
const column = (id: string, x: number, y: number) => ({ ...base, classification: 'structure', id, name: id, kind: 'column', x, y, section: 'rect', b: 250, h: 250, levelId: 'NIV-0001' }) as CadObject;
const anchor = (id: string, x: number, y: number) =>
  ({ ...base, classification: 'mecanique', id, name: `Ancrage ${id}`, kind: 'solid', ifcClass: 'IfcMechanicalFastener', recipe: { op: 'cylinder', r: 12, h: 400, at: [x, y, -100] }, levelId: 'NIV-0001' }) as CadObject;
export const atelierProject = (): CadObject[] => [
  wall('OBJ-0001', 0, 0, 12000, 0), wall('OBJ-0002', 12000, 0, 12000, 8000), wall('OBJ-0003', 12000, 8000, 0, 8000), wall('OBJ-0004', 0, 8000, 0, 0),
  column('OBJ-0005', 8000, 4000), column('OBJ-0006', 11800, 4000), column('OBJ-0007', 8000, 7800), column('OBJ-0008', 11800, 7800),
  { ...base, classification: 'structure', id: 'OBJ-0009', name: 'Plancher de mezzanine', kind: 'slab', points: [8000, 4000, 11875, 4000, 11875, 7875, 8000, 7875], thickness: 200, levelId: 'NIV-0002' } as CadObject,
  { ...base, classification: 'mecanique', id: 'OBJ-0010', name: 'Support de machine', kind: 'solid', ifcClass: 'IfcPlate', recipe: { op: 'box', x: 1200, y: 800, z: 300, at: [2000, 2000, 0] }, levelId: 'NIV-0001' } as CadObject,
  anchor('OBJ-0011', 2100, 2100), anchor('OBJ-0012', 3100, 2100), anchor('OBJ-0013', 2100, 2700), anchor('OBJ-0014', 3100, 2700),
  {
    ...base, classification: 'mecanique', id: 'OBJ-0015', name: 'Armoire', kind: 'solid', recipe: { op: 'box', x: 800, y: 600, z: 2000, at: [500, 7000, 0] },
    partDef: { no: 1, origin: [500, 7000, 0], angle: 0 }, levelId: 'NIV-0001',
    psets: [{ name: 'Équipement', props: [{ name: 'Désignation', value: 'Armoire' }, { name: 'Implantation', value: 'équipement mécanique' }] }],
  } as CadObject,
  { ...base, classification: 'mecanique', id: 'OBJ-0016', name: 'Armoire 2', kind: 'occurrence', sourceId: 'OBJ-0015', x: 5000, y: 7000, z: 0, angle: 90, levelId: 'NIV-0001' } as CadObject,
];

describe('export IFC des solides prismatiques (lot 19.1)', () => {
  const { content, report } = exportIfc({ objects: atelierProject(), levels, projectName: 'Atelier', date: new Date('2026-10-08T12:00:00Z') });

  it('platine, ancrages, armoire et occurrence exportés ; classes choisies et attributs propres', () => {
    expect(report.exported).toMatchObject({ IfcWall: 4, IfcColumn: 4, IfcSlab: 1, IfcPlate: 1, IfcMechanicalFastener: 4, IfcBuildingElementProxy: 2 });
    expect(report.notExported).toEqual([]);
    // Fixation : diamètre et longueur nominaux non saisis ($) avant le type prédéfini.
    expect(content).toMatch(/IFCMECHANICALFASTENER\('[^']+',\$,'Ancrage OBJ-0011',\$,\$,#\d+,#\d+,'OBJ-0011',\$,\$,\.NOTDEFINED\.\)/);
    expect(content).toMatch(/IFCPLATE\('[^']+',\$,'Support de machine',\$,\$,#\d+,#\d+,'OBJ-0010',\.NOTDEFINED\.\)/);
    expect(content).toContain("IFCQUANTITYVOLUME('GrossVolume',$,$,0.288,$)");
    expect(content).toContain("IFCQUANTITYVOLUME('NetVolume',$,$,0.96,$)");
    // Ancrage : cylindre de base à −100 mm sous le sol de l'atelier.
    expect(content).toMatch(/IFCCIRCLEPROFILEDEF\(\.AREA\.,\$,#\d+,12\.\)/);
  });

  it('solide non prismatique : signalé, échange par STEP', () => {
    const drilled = { ...atelierProject()[9], id: 'OBJ-0099', recipe: { op: 'cut', a: { op: 'box', x: 100, y: 100, z: 10 }, b: { op: 'cylinder', r: 5, h: 20, at: [50, 50, -5] } } } as CadObject;
    expect(exportIfc({ objects: [drilled], levels, projectName: 'x', date: new Date(0) }).report.notExported).toEqual(['OBJ-0099 : solide non prismatique (échange par STEP, lot 17.2)']);
  });

  it('fichier de référence pour la relecture par IfcOpenShell (IFC_FIXTURES_DIR)', () => {
    const dir = process.env.IFC_FIXTURES_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'atelier.ifc'), content);
    writeFileSync(join(dir, 'atelier.ifc.expected.json'), JSON.stringify({
      schema: 'IFC4X3_ADD2',
      counts: report.exported,
      storeys: levels.map(l => ({ name: l.name, elevation: l.elevation })),
      psets: { 'OBJ-0015': { 'Équipement': { 'Désignation': 'Armoire', Implantation: 'équipement mécanique' } } },
      volumes: { 'OBJ-0010': 'GrossVolume', 'OBJ-0015': 'NetVolume', 'OBJ-0016': 'NetVolume', 'OBJ-0005': 'GrossVolume', 'OBJ-0009': 'GrossVolume' },
    }, null, 2));
  });
});
