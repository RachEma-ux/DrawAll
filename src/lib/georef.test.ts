import { describe, expect, it } from 'vitest';
import type { Georef } from '@/types/cad';
import { formatGeoref, georefError, gridNorthLocal, ifcMapConversion, mapToModel, modelToMap, normalizeGeoref } from './georef';

const g = (p: Partial<Georef> = {}): Georef => ({ crs: 'EPSG:2056', e: 2600000, n: 1200000, h: 432.5, north: 0, ...p });
const close = (a: { E: number; N: number; H: number }, b: [number, number, number]) => { expect(a.E).toBeCloseTo(b[0], 9); expect(a.N).toBeCloseTo(b[1], 9); expect(a.H).toBeCloseTo(b[2], 9); };

describe('géoréférencement (lot 17.3)', () => {
  it('saisie validée : code EPSG, nombres, angle ; rien de deviné', () => {
    expect(georefError(g())).toBeNull();
    expect(georefError(g({ crs: 'CH1903+' }))).toBe('Système de coordonnées : code EPSG attendu (ex. EPSG:2056).');
    expect(georefError(g({ e: Number.NaN }))).toBe('Est (E) : nombre attendu.');
    expect(georefError(g({ north: 400 }))).toBe('Rotation du nord : angle entre −360 et 360° attendu.');
    expect(normalizeGeoref({ ...g(), extra: 1 })).toEqual(g());
    expect(normalizeGeoref({ crs: 'EPSG:2056' })).toBeUndefined();
  });

  it('conversion modèle → carte : nord en haut, puis nord à 90° (à droite du haut du plan)', () => {
    // Nord en haut : X du plan → est ; Y du plan (vers le bas) → sud ; millimètres → mètres.
    close(modelToMap({ x: 10000, y: 0, z: 0 }, g()), [2600010, 1200000, 432.5]);
    close(modelToMap({ x: 0, y: 10000, z: 3000 }, g()), [2600000, 1199990, 435.5]);
    // Nord à 90° : le nord est à droite du plan ; l'axe X du plan pointe vers le nord.
    close(modelToMap({ x: 10000, y: 0, z: 0 }, g({ north: 90 })), [2600000, 1200010, 432.5]);
    close(modelToMap({ x: 0, y: -10000, z: 0 }, g({ north: 90 })), [2599990, 1200000, 432.5]);
    // Nord à 30°.
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    close(modelToMap({ x: 1000, y: -2000, z: 0 }, g({ north: 30 })), [2600000 + 1 * c - 2 * s, 1200000 + 1 * s + 2 * c, 432.5]);
  });

  it('aller-retour carte ↔ modèle à 10⁻⁶ mm', () => {
    for (const north of [0, 17.5, -42, 135, 270]) {
      for (const p of [{ x: 0, y: 0, z: 0 }, { x: 12345.678, y: -9876.5, z: 2750 }, { x: -50000, y: 30000, z: -1200 }]) {
        const back = mapToModel(modelToMap(p, g({ north })), g({ north }));
        expect(back.x).toBeCloseTo(p.x, 6); expect(back.y).toBeCloseTo(p.y, 6); expect(back.z).toBeCloseTo(p.z, 6);
      }
    }
  });

  it('paramètres IFC : conversion (échelle mm → m), nord dans le repère local ; affichage', () => {
    expect(ifcMapConversion(g({ north: 90 }))).toMatchObject({ eastings: 2600000, northings: 1200000, orthogonalHeight: 432.5, scale: 0.001 });
    expect(ifcMapConversion(g({ north: 90 })).xAxisOrdinate).toBeCloseTo(1, 12);
    const n = gridNorthLocal(g({ north: 90 }));
    expect(n[0]).toBeCloseTo(1, 12); expect(n[1]).toBeCloseTo(0, 12);
    expect(formatGeoref(g({ north: 15 })).replace(/\u202f/g, ' ')).toBe('EPSG:2056 · E 2 600 000,000 · N 1 200 000,000 · H 432,500 m · nord 15°');
  });
});
