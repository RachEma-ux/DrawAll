import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, Level } from '@/types/cad';
import { exportIfc, ifcGuid, stepReal, stepString, unionArea } from './ifc';
import { modelToMap } from './georef';
import type { Georef } from '@/types/cad';

const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Record<string, unknown> = {}) =>
  ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe', levelId: 'NIV-0001', ...extra }) as CadObject;
const levels: Level[] = [{ id: 'NIV-0001', name: 'Rez-de-chaussée', elevation: 0 }, { id: 'NIV-0002', name: 'Étage', elevation: 3000 }];

/** Projet de référence : 4 murs, une porte (hauteur saisie), une fenêtre (sans hauteur), dalle, pièce, toiture, poteaux, poutre. */
export const referenceProject = (): CadObject[] => [
  wall('OBJ-0001', 0, 0, 5000, 0, { psets: [{ name: 'Pset_WallCommon', props: [{ name: 'IsExternal', value: true }, { name: 'ThermalTransmittance', value: 0.24, unit: 'W/(m²·K)' }] }] }),
  wall('OBJ-0002', 5000, 0, 5000, 4000), wall('OBJ-0003', 5000, 4000, 0, 4000), wall('OBJ-0004', 0, 4000, 0, 0, { height: 2500 }),
  { ...base, id: 'OBJ-0005', name: 'Porte d’entrée', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 1500, width: 900, hinge: 'debut', side: 'gauche', height: 2100, levelId: 'NIV-0001' } as CadObject,
  { ...base, id: 'OBJ-0006', name: 'Fenêtre', kind: 'opening', hostId: 'OBJ-0002', type: 'fenetre', position: 2000, width: 1200, hinge: 'debut', side: 'gauche', levelId: 'NIV-0001' } as CadObject,
  { ...base, id: 'OBJ-0007', name: 'Dalle', kind: 'slab', points: [0, 0, 5000, 0, 5000, 4000, 0, 4000], thickness: 200, levelId: 'NIV-0001' } as CadObject,
  { ...base, id: 'OBJ-0008', name: 'Séjour', kind: 'room', x: 2500, y: 2000, levelId: 'NIV-0001' } as CadObject,
  { ...base, id: 'OBJ-0009', name: 'Toiture', kind: 'roof', x: -100, y: -100, w: 5200, h: 4200, roofType: 'deux-pans', pitch: 30, overhang: 300, axis: 'x', levelId: 'NIV-0001' } as CadObject,
  { ...base, classification: 'structure', id: 'OBJ-0010', name: 'Poteau', kind: 'column', x: 2500, y: 2000, section: 'rect', b: 300, h: 300, levelId: 'NIV-0001' } as CadObject,
  { ...base, classification: 'structure', id: 'OBJ-0011', name: 'Poteau rond', kind: 'column', x: 1000, y: 1000, section: 'circle', d: 250, height: 2800, levelId: 'NIV-0001' } as CadObject,
  { ...base, classification: 'structure', id: 'OBJ-0012', name: 'Poutre', kind: 'beam', x1: 0, y1: 2000, x2: 5000, y2: 2000, b: 200, h: 400, levelId: 'NIV-0001' } as CadObject,
  { ...base, classification: 'non-classifie', id: 'OBJ-0013', name: 'Note', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1, levelId: 'NIV-0001' } as CadObject,
];

describe('export IFC 4.3 (lot 17.1)', () => {
  const { content, report } = exportIfc({ objects: referenceProject(), levels, projectName: 'Maison de référence', date: new Date('2026-10-08T12:00:00Z') });

  it('écriture STEP : chaînes encodées, réels, identifiants globaux déterministes', () => {
    expect(stepString("Porte d'entrée")).toBe("'Porte d''entr\\X2\\00E9\\X0\\e'");
    expect(stepString('a\\b')).toBe("'a\\\\b'");
    expect(stepString('m²·K')).toBe("'m\\X2\\00B200B7\\X0\\K'");
    expect([stepReal(1000), stepReal(0.5), stepReal(-2), stepReal(1.5e-7), stepReal(0)]).toEqual(['1000.', '0.5', '-2.', '1.5E-7', '0.']);
    const g = ifcGuid('a');
    expect(g).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(ifcGuid('a')).toBe(g);
    expect(ifcGuid('b')).not.toBe(g);
  });

  it('structure : schéma IFC4X3_ADD2, étages, éléments, baies, espaces, ce qui n’est pas exporté', () => {
    expect(content.startsWith('ISO-10303-21;\nHEADER;')).toBe(true);
    expect(content).toContain("FILE_SCHEMA(('IFC4X3_ADD2'));");
    expect(content.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true);
    expect(report.exported).toEqual({ IfcBuildingStorey: 2, IfcWall: 4, IfcSlab: 1, IfcRoof: 1, IfcColumn: 2, IfcBeam: 1, IfcOpeningElement: 1, IfcDoor: 1, IfcWindow: 1, IfcSpace: 1 });
    expect(report.notExported).toEqual(['OBJ-0006 : fenêtre sans hauteur de baie saisie, exportée sans volume et sans évider le mur']);
    // Numérotation continue, chaque ligne une entité.
    const ids = [...content.matchAll(/^#(\d+)=/gm)].map(m => Number(m[1]));
    expect(ids).toEqual(ids.map((_, i) => i + 1));
    // Toute référence #n désigne une entité existante.
    const refs = [...content.matchAll(/#(\d+)/g)].map(m => Number(m[1]));
    expect(Math.max(...refs)).toBe(ids.length);
    // Repère : Y du plan inversé (Y IFC = −y du plan) : coin du mur du bas du plan, côté sud, en (5 000 ; −4 100).
    expect(content).toContain('IFCCARTESIANPOINT((5000.,-4100.))');
    expect(content).toContain("IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$)");
    expect(content).toContain("IFCBUILDINGSTOREY(");
    expect(content).toContain("'\\X2\\00C9\\X0\\tage',$,$");
  });

  it('fichier de référence écrit pour la relecture par IfcOpenShell (IFC_FIXTURES_DIR)', () => {
    const dir = process.env.IFC_FIXTURES_DIR;
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'maison.ifc'), content);
    // Attendus : comptes par classe, étages, propriétés, et quantités à retrouver par la géométrie lue.
    writeFileSync(join(dir, 'maison.ifc.expected.json'), JSON.stringify({
      schema: 'IFC4X3_ADD2',
      counts: report.exported,
      storeys: levels.map(l => ({ name: l.name, elevation: l.elevation })),
      psets: { 'OBJ-0001': { Pset_WallCommon: { IsExternal: true, ThermalTransmittance: 0.24 } } },
      // Volume lu par IfcOpenShell (baies déduites) = quantité exportée (m³), à 10⁻⁶ près.
      volumes: { 'OBJ-0001': 'NetVolume', 'OBJ-0002': 'NetVolume', 'OBJ-0004': 'NetVolume', 'OBJ-0007': 'GrossVolume', 'OBJ-0010': 'GrossVolume', 'OBJ-0011': 'GrossVolume', 'OBJ-0012': 'GrossVolume' },
      areas: { 'Séjour': 'NetFloorArea' },
    }, null, 2));
  });

  it('géoréférencement transmis : système projeté, conversion, nord ; fichier de référence géoréférencé', () => {
    const georef: Georef = { crs: 'EPSG:2056', e: 2600000, n: 1200000, h: 432.5, north: 30 };
    const geo = exportIfc({ objects: referenceProject(), levels, projectName: 'Maison géoréférencée', date: new Date('2026-10-08T12:00:00Z'), georef }).content;
    expect(geo).toMatch(/IFCPROJECTEDCRS\('EPSG:2056',\$,\$,\$,\$,\$,#\d+\)/);
    expect(geo).toMatch(/IFCMAPCONVERSION\(#\d+,#\d+,2600000\.,1200000\.,432\.5,0\.866025404,0\.5,0\.001\)/);
    expect(content).not.toContain('IFCMAPCONVERSION');
    const dir = process.env.IFC_FIXTURES_DIR;
    if (!dir) return;
    // Points du modèle (repère du plan, mm) et leurs coordonnées attendues sur la carte (m).
    const pts = [{ x: 0, y: 0, z: 0 }, { x: 5000, y: 0, z: 0 }, { x: 5000, y: 4000, z: 3000 }];
    writeFileSync(join(dir, 'maison-georef.ifc'), geo);
    writeFileSync(join(dir, 'maison-georef.ifc.expected.json'), JSON.stringify({
      schema: 'IFC4X3_ADD2', counts: { IfcBuildingStorey: 2, IfcWall: 4 }, storeys: levels.map(l => ({ name: l.name, elevation: l.elevation })),
      georef: { crs: 'EPSG:2056', points: pts.map(p => { const m = modelToMap(p, georef); return { local: [p.x, -p.y, p.z], enh: [m.E, m.N, m.H] }; }) },
    }, null, 2));
  });
});

describe('baies dans le mur : volume net et géométrie (relecture #68)', () => {
  const op = (id: string, position: number, extra: Record<string, unknown>) => ({ ...base, id, name: id, kind: 'opening', hostId: 'M', type: 'fenetre', position, width: 900, levelId: 'NIV-0001', ...extra }) as CadObject;
  const net = (content: string) => Number(content.match(/IFCQUANTITYVOLUME\('NetVolume',\$,\$,([^,]+),/)![1]);
  const run = (objects: CadObject[]) => exportIfc({ objects: [wall('M', 0, 0, 5000, 0, { height: 2500 }), ...objects], levels, projectName: 'P', date: new Date('2026-10-09T00:00:00Z') });

  it('union des rectangles', () => {
    expect(unionArea([{ a0: 0, a1: 10, z0: 0, z1: 10 }, { a0: 5, a1: 15, z0: 5, z1: 15 }])).toBe(175);
    expect(unionArea([{ a0: 0, a1: 10, z0: 0, z1: 10 }, { a0: 0, a1: 10, z0: 0, z1: 10 }])).toBe(100);
    expect(unionArea([])).toBe(0);
  });

  it('deux baies qui se recouvrent n’évident le mur qu’une fois', () => {
    // [550, 1450] ∪ [850, 1750] = 1 200 mm × 2 100 mm × 200 mm = 0,504 m³ ; brut 2,5 m³.
    const { content } = run([op('A', 1000, { sill: 0, height: 2100 }), op('B', 1300, { sill: 0, height: 2100 })]);
    expect(net(content)).toBeCloseTo(2.5 - 0.504, 9);
  });

  it('baie qui dépasse le haut du mur : écrêtée (géométrie et volume), signalée ; baie au-dessus : n’évide rien', () => {
    const { content, report } = run([op('A', 1000, { sill: 2000, height: 1200 }), op('B', 3000, { sill: 2600, height: 500 })]);
    expect(net(content)).toBeCloseTo(2.5 - (900 * 500 * 200) / 1e9, 9);
    expect(report.adjusted).toEqual(['A : baie écrêtée à la hauteur du mur M (500 mm évidés au lieu de 1200 mm)']);
    expect(report.notExported).toContain('B : baie hors de la hauteur du mur M (allège 2600 mm, mur 2500 mm), exportée sans évider le mur');
    expect(report.exported.IfcOpeningElement).toBe(1);
    expect(content).not.toContain("'Baie B'");
  });
});

describe('réels STEP à exposant (relecture #68)', () => {
  it('point dans la mantisse, jamais après l’exposant', () => {
    expect(stepReal(1e21)).toBe('1.E+21');
    expect(stepReal(-2e22)).toBe('-2.E+22');
    expect(stepReal(1.5e-7)).toBe('1.5E-7');
    expect(stepReal(1000)).toBe('1000.');
    expect(stepReal(0.5)).toBe('0.5');
  });
});

