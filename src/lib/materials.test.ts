import { describe, expect, it } from 'vitest';
import type { BlockDef, CadObject } from '@/types/cad';
import { PROFILES, effectiveHatch, occurrencePrimitives, profileById, withProfile, withProfileBlocks } from './materials';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', createdSeq: 0, name: 'o' };
const wall: CadObject = { ...base, id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 20, hatch: 'none', materialId: 'beton' };
const plate: CadObject = { ...base, id: 'OBJ-0002', kind: 'rect', x: 0, y: 0, w: 10, h: 10, hatch: 'cross' };

describe('matériaux et profils de dessin', () => {
  it('changer de profil change l’apparence, jamais le matériau', () => {
    const neutre = profileById('neutre'), ens = profileById('enseignement'), aplat = profileById('pleins');
    expect(effectiveHatch(wall, neutre)).toBe('diagonal');
    expect(effectiveHatch(wall, ens)).toBe('cross');
    expect(effectiveHatch(wall, aplat)).toBe('solid');
    const shown = withProfile([wall, plate], ens);
    expect(shown[0]).toMatchObject({ materialId: 'beton', hatch: 'cross' });
    // L'objet d'origine n'est pas modifié.
    expect(wall.hatch).toBe('none');
    expect(wall.materialId).toBe('beton');
  });

  it('sans matériau, l’objet garde son motif propre', () => {
    expect(effectiveHatch(plate, profileById('pleins'))).toBe('cross');
    expect(withProfile([plate], profileById('enseignement'))[0]).toBe(plate);
  });

  it('chaque profil est versionné et sourcé ; aucun ne se dit normatif', () => {
    for (const p of PROFILES) {
      expect(p.version).toMatch(/^\d+\.\d+$/);
      expect(p.source.length).toBeGreaterThan(10);
      expect(p.source).not.toMatch(/conforme|selon la norme/i);
    }
    expect(profileById('inconnu').id).toBe('neutre');
  });
});

describe('blocs et profils (lot 3.1)', () => {
  const prim = { classification: 'non-classifie' as const, layerId: 'LAY-0001', createdSeq: 0, name: 'p' };
  const block: BlockDef = {
    id: 'BLQ-0001', name: 'Platine',
    primitives: [
      { ...prim, id: 'BLQ-0001-P1', kind: 'rect', x: 0, y: 0, w: 10, h: 10, hatch: 'none', materialId: 'beton' },
      { ...prim, id: 'BLQ-0001-P2', kind: 'rect', x: 20, y: 0, w: 10, h: 10, hatch: 'none' },
      { ...prim, id: 'BLQ-0001-P3', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, hatch: 'none' },
    ],
  };
  it('les primitives à matériau d’un bloc suivent le profil', () => {
    const ens = profileById('enseignement'), pleins = profileById('pleins');
    expect(withProfileBlocks([block], ens)[0].primitives[0].hatch).toBe('cross');
    expect(withProfileBlocks([block], pleins)[0].primitives[0].hatch).toBe('solid');
    // Le modèle n'est pas modifié.
    expect(block.primitives[0].hatch).toBe('none');
  });
  it('une occurrence à matériau hachure les contours fermés sans matériau propre', () => {
    const prims = occurrencePrimitives(block, { hatch: 'diagonal' });
    expect(prims.map(p => p.hatch)).toEqual(['none', 'diagonal', 'none']);
    expect(occurrencePrimitives(block, { hatch: 'none' })).toBe(block.primitives);
  });
});

describe('contexte de vue et pièces voisines (lot 3.3)', () => {
  const steel = (id: string, x: number): CadObject => ({ ...base, id, kind: 'rect', x, y: 0, w: 100, h: 50, hatch: 'none', materialId: 'acier' });
  const a = steel('A', 0), b = steel('B', 100), c = steel('C', 300);

  it('en coupe, deux pièces voisines du même motif reçoivent des sens différents', () => {
    const shown = withProfile([a, b, c], profileById('neutre'), 'coupe');
    expect(shown[0].hatchParams).toBeUndefined();               // 45° par défaut
    expect(shown[1].hatchParams).toMatchObject({ angle: 135 });  // voisine : autre sens
    expect(shown[2].hatchParams).toBeUndefined();               // isolée : défaut
  });

  it('trois pièces mutuellement voisines : sens puis pas différents', () => {
    const tri = [steel('A', 0), steel('B', 100), { ...steel('C', 0), y: 50, w: 200 } as CadObject];
    const p = withProfile(tri, profileById('neutre'), 'coupe').map(o => o.hatchParams ?? { angle: 45, spacing: 3 });
    expect(new Set(p.map(h => `${h.angle}/${h.spacing}`)).size).toBe(3);
  });

  it('un angle choisi à la main est respecté', () => {
    const manual = { ...b, hatchParams: { angle: 45, spacing: 3, unit: 'papier' as const } };
    expect(withProfile([a, manual], profileById('neutre'), 'coupe')[1].hatchParams).toEqual(manual.hatchParams);
  });

  it('en vue, les surfaces ne sont pas hachurées (sauf motif de surface du profil) ; le matériau reste', () => {
    const shown = withProfile([a], profileById('neutre'), 'vue');
    expect(shown[0]).toMatchObject({ hatch: 'none', materialId: 'acier' });
    const glass: CadObject = { ...a, id: 'G', materialId: 'verre' };
    expect(withProfile([glass], profileById('enseignement'), 'vue')[0].hatch).toBe('solid');
    expect(effectiveHatch(a, profileById('neutre'), 'coupe')).toBe('diagonal');
  });
});
