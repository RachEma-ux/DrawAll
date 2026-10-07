import { describe, expect, it } from 'vitest';
import type { Layer } from '@/types/cad';
import { dxfLineWeight, effectiveStyle, lineTypeFromDxf, screenDash, screenWidth } from './linestyle';

const layer: Layer = { id: 'LAY-0001', name: 'Axes', color: '#ff0000', visible: true, locked: false, lineType: 'mixte', lineWeight: 0.18 };

describe('propriétés de trait', () => {
  it('« du calque » par défaut, l’objet l’emporte quand il porte la propriété', () => {
    expect(effectiveStyle({}, layer)).toMatchObject({ color: '#ff0000', lineType: 'mixte', lineWeight: 0.18, byLayer: { color: true, lineType: true, lineWeight: true } });
    expect(effectiveStyle({ lineType: 'interrompu', lineWeight: 0.5 }, layer)).toMatchObject({ color: '#ff0000', lineType: 'interrompu', lineWeight: 0.5, byLayer: { color: true, lineType: false, lineWeight: false } });
    expect(effectiveStyle({}, { ...layer, lineType: undefined, lineWeight: undefined })).toMatchObject({ lineType: 'continu', lineWeight: 0.25 });
  });

  it('largeur et motif à l’écran proportionnés à l’épaisseur (ISO 128-2)', () => {
    expect(screenWidth(0.25)).toBe(1.5);
    expect(screenWidth(0.5)).toBe(3);
    expect(screenWidth(0.13)).toBe(1);
    expect(screenDash('continu', 1.5)).toBeUndefined();
    expect(screenDash('interrompu', 2)).toEqual([24, 6]);
    expect(screenDash('mixte', 2)).toEqual([48, 6, 1, 6]);
    expect(screenDash('mixte-double', 2)).toHaveLength(6);
  });

  it('épaisseurs DXF normalisées et noms de types de ligne', () => {
    expect(dxfLineWeight(0.25)).toBe(25);
    expect(dxfLineWeight(0.7)).toBe(70);
    expect(dxfLineWeight(1.4)).toBe(140);
    expect(dxfLineWeight(0.17)).toBe(18);
    expect(lineTypeFromDxf('ACAD_ISO02W100')).toBe('interrompu');
    expect(lineTypeFromDxf('CENTER')).toBe('mixte');
    expect(lineTypeFromDxf('PHANTOM2')).toBe('mixte-double');
    expect(lineTypeFromDxf('ByLayer')).toBe('bylayer');
    expect(lineTypeFromDxf('ZIGZAG')).toBeUndefined();
  });
});
