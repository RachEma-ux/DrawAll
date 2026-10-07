import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { PROFILES, effectiveHatch, profileById, withProfile } from './materials';

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
