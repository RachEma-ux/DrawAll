import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { DEFAULT_LEVEL, copyLevelObjects, formatElevation, levelBelow, levelsOf, onLevel, viewportLevelId } from './levels';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const objects: CadObject[] = [
  { ...base, id: 'OBJ-0001', name: 'OBJ-0001', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' },
  { ...base, id: 'OBJ-0002', name: 'Porte', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 1500, width: 900, hinge: 'debut', side: 'droite' },
  { ...base, id: 'OBJ-0003', name: 'Cote', kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: 400 },
  { ...base, id: 'OBJ-0009', name: 'Étage', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, levelId: 'NIV-0002' },
];

describe('niveaux', () => {
  it('niveau par défaut, tri par altitude, niveau inférieur', () => {
    expect(levelsOf(undefined)).toEqual([DEFAULT_LEVEL]);
    const lv = levelsOf([{ id: 'NIV-0002', name: 'Étage', elevation: 2800 }, DEFAULT_LEVEL, { id: 'NIV-0003', name: 'Sous-sol', elevation: -2500 }]);
    expect(lv.map(l => l.id)).toEqual(['NIV-0003', 'NIV-0001', 'NIV-0002']);
    expect(levelBelow(lv, 'NIV-0002')?.id).toBe('NIV-0001');
    expect(levelBelow(lv, 'NIV-0003')).toBeNull();
  });

  it('objets d’un niveau (sans niveau = rez-de-chaussée)', () => {
    expect(onLevel(objects, 'NIV-0001').map(o => o.id)).toEqual(['OBJ-0001', 'OBJ-0002', 'OBJ-0003']);
    expect(onLevel(objects, 'NIV-0002').map(o => o.id)).toEqual(['OBJ-0009']);
  });

  it('copie d’un niveau : identifiants neufs, liens refaits, niveau cible', () => {
    const { objects: copies, counter } = copyLevelObjects(objects, 'NIV-0001', 'NIV-0002', 20, 5);
    expect(counter).toBe(23);
    expect(copies.map(o => o.id)).toEqual(['OBJ-0021', 'OBJ-0022', 'OBJ-0023']);
    expect(copies.every(o => o.levelId === 'NIV-0002' && o.createdSeq === 5)).toBe(true);
    expect(copies[1]).toMatchObject({ kind: 'opening', hostId: 'OBJ-0021', name: 'Porte' });
    expect(copies[2]).toMatchObject({ kind: 'dimension', targetId: 'OBJ-0021' });
    expect(copies[0].name).toBe('OBJ-0021');
  });

  it('altitudes affichées en mètres signés', () => {
    expect(formatElevation(2800)).toBe('+2,80 m');
    expect(formatElevation(-2500)).toBe('−2,50 m');
    expect(formatElevation(0)).toBe('±0,00 m');
  });
});

describe('niveau montré par une fenêtre', () => {
  const levels = [{ id: 'NIV-0002', name: 'Étage 1', elevation: 2800 }, { id: 'NIV-0003', name: 'Sous-sol', elevation: -2600 }];
  it('le niveau désigné s’il existe, sinon le plus bas', () => {
    expect(viewportLevelId({ levelId: 'NIV-0002' }, levels)).toBe('NIV-0002');
    expect(viewportLevelId({}, levels)).toBe('NIV-0003');
    expect(viewportLevelId({ levelId: 'NIV-0009' }, levels)).toBe('NIV-0003');
    expect(viewportLevelId({}, [])).toBe(DEFAULT_LEVEL.id);
  });
});

describe('copie de niveau : coupe rattachée à la face et au repère copiés', () => {
  it('sourceId et markId pointent vers les copies du niveau cible', () => {
    const b = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
    const src: CadObject[] = [
      { ...b, id: 'OBJ-0001', name: 'Face', kind: 'rect', x: 0, y: 0, w: 100, h: 60 },
      { ...b, id: 'OBJ-0004', name: 'A', kind: 'section', x1: -10, y1: 30, x2: 110, y2: 30, label: 'A' },
      { ...b, id: 'OBJ-0005', name: 'Coupe', kind: 'cut', sourceId: 'OBJ-0001', markId: 'OBJ-0004', depth: 10, gap: 20 },
    ];
    const { objects: copies } = copyLevelObjects(src, DEFAULT_LEVEL.id, 'NIV-0002', 20, 1);
    const ids = new Map(src.map((o, i) => [o.id, copies[i].id]));
    expect(copies.find(o => o.kind === 'cut')).toMatchObject({ sourceId: ids.get('OBJ-0001'), markId: ids.get('OBJ-0004'), levelId: 'NIV-0002' });
  });
});
