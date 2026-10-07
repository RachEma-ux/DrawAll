import { describe, expect, it } from 'vitest';
import { deviations, fit, formatDeviation, itValue, parseClass } from './iso286';
import { dimensionValue, type CadObject, type DimensionObj } from '@/types/cad';
import { decodeDxfString, exportDxf } from './dxf';

const dev = (n: number, c: string) => { const r = deviations(n, parseClass(c)!); if (!r.ok) throw new Error(r.error); return [r.value.upper, r.value.lower]; };

describe('ISO 286 (lot 5.1) — échantillon de cotes', () => {
  it('degrés IT : paliers « au-delà de … jusqu’à … inclus »', () => {
    expect(itValue(25, 7)).toEqual({ ok: true, value: 21 });
    expect(itValue(30, 7)).toEqual({ ok: true, value: 21 });   // 30 est dans 18–30
    expect(itValue(30.001, 7)).toEqual({ ok: true, value: 25 });
    expect(itValue(3, 6)).toEqual({ ok: true, value: 6 });
    expect(itValue(500, 11)).toEqual({ ok: true, value: 400 });
    expect(itValue(501, 7).ok).toBe(false);
    expect(itValue(25, 2).ok).toBe(false);
  });

  it('alésages et arbres courants (valeurs ISO 286-2)', () => {
    expect(dev(25, 'H7')).toEqual([21, 0]);
    expect(dev(25, 'g6')).toEqual([-7, -20]);
    expect(dev(25, 'f7')).toEqual([-20, -41]);
    expect(dev(25, 'h6')).toEqual([0, -13]);
    expect(dev(25, 'k6')).toEqual([15, 2]);
    expect(dev(25, 'm6')).toEqual([21, 8]);
    expect(dev(25, 'n6')).toEqual([28, 15]);
    expect(dev(25, 'p6')).toEqual([35, 22]);
    expect(dev(25, 'G7')).toEqual([28, 7]);
    expect(dev(50, 'g6')).toEqual([-9, -25]);
    expect(dev(50, 'f7')).toEqual([-25, -50]);
    expect(dev(10, 'H8')).toEqual([22, 0]);
    expect(dev(10, 'e8')).toEqual([-25, -47]);
    expect(dev(100, 'H11')).toEqual([220, 0]);
    expect(dev(100, 'd9')).toEqual([-120, -207]);
  });

  it('K, M, N, P : ES = −ei + Δ ; nul jusqu’à 3 mm ; cas particulier M6', () => {
    expect(dev(25, 'K7')).toEqual([6, -15]);
    expect(dev(25, 'M7')).toEqual([0, -21]);
    expect(dev(25, 'N7')).toEqual([-7, -28]);
    expect(dev(25, 'P7')).toEqual([-14, -35]);
    expect(dev(40, 'K7')).toEqual([7, -18]);
    expect(dev(40, 'N7')).toEqual([-8, -33]);
    expect(dev(80, 'P7')).toEqual([-21, -51]);
    expect(dev(2, 'K7')).toEqual([0, -10]);
    expect(dev(300, 'M6')).toEqual([-9, -41]);
    expect(deviations(25, parseClass('P8')!).ok).toBe(false);
  });

  it('js / JS : ±IT/2, arrondi pair de IT7 à IT11', () => {
    expect(dev(25, 'js6')).toEqual([6.5, -6.5]);
    expect(dev(25, 'js7')).toEqual([10, -10]);
    expect(dev(40, 'JS7')).toEqual([12, -12]); // IT7 = 25 : impair → ±12
  });

  it('ajustements : jeu, incertain, serrage', () => {
    const a = fit(25, 'H7', 'g6');
    expect(a.ok && a.value).toMatchObject({ maxClearance: 41, minClearance: 7, type: 'jeu' });
    const b = fit(25, 'H7', 'k6');
    expect(b.ok && b.value).toMatchObject({ maxClearance: 19, minClearance: -15, type: 'incertain' });
    const c = fit(25, 'H7', 'p6');
    expect(c.ok && c.value).toMatchObject({ maxClearance: -1, minClearance: -35, type: 'serrage' });
    expect(fit(25, 'h7', 'g6').ok).toBe(false);
    expect(fit(25, 'H7', 'z6').ok).toBe(false);
  });

  it('lecture des classes et affichage des écarts', () => {
    expect(parseClass('H7')).toEqual({ letter: 'h', grade: 7, hole: true });
    expect(parseClass('js6')).toEqual({ letter: 'js', grade: 6, hole: false });
    expect(parseClass('Hx')).toBeNull();
    expect(formatDeviation(21)).toBe('+0,021');
    expect(formatDeviation(-7)).toBe('−0,007');
    expect(formatDeviation(6.5)).toBe('+0,0065');
    expect(formatDeviation(0)).toBe('0');
  });
});

describe('cotes tolérancées (lot 5.1)', () => {
  const base = { classification: 'mecanique' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
  const objects: CadObject[] = [
    { ...base, id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 25, y2: 0 },
    { ...base, id: 'OBJ-0002', kind: 'circle', cx: 0, cy: 0, r: 12.5 },
  ];
  const dim = (targetId: string, tolerance?: DimensionObj['tolerance']): DimensionObj => ({ ...base, id: 'OBJ-0009', kind: 'dimension', targetId, style: targetId === 'OBJ-0002' ? 'radial' : 'aligned', offset: 10, ...(tolerance ? { tolerance } : {}) });

  it('texte de la cote selon la tolérance', () => {
    expect(dimensionValue(dim('OBJ-0001'), objects)).toBe('25 mm');
    expect(dimensionValue(dim('OBJ-0001', { kind: 'symetrique', value: 0.1 }), objects)).toBe('25 ±0,1 mm');
    expect(dimensionValue(dim('OBJ-0001', { kind: 'ecarts', upper: 0.1, lower: -0.05 }), objects)).toBe('25 +0,1/−0,05 mm');
    expect(dimensionValue(dim('OBJ-0002', { kind: 'classe', cls: 'H7' }), objects)).toBe('Ø 25 H7 (+0,021/0) mm');
    expect(dimensionValue(dim('OBJ-0002', { kind: 'classe', cls: 'g6' }), objects)).toBe('Ø 25 g6 (−0,007/−0,02) mm');
    expect(dimensionValue(dim('OBJ-0002', { kind: 'ajustement', hole: 'H7', shaft: 'g6' }), objects)).toBe('Ø 25 H7/g6 mm');
    expect(dimensionValue(dim('OBJ-0002', { kind: 'classe', cls: 'Z9' }), objects)).toBe('Ø 25 Z9 (non évalué) mm');
  });

  it('la tolérance est exportée avec le texte de la cote (DXF)', () => {
    const { content } = exportDxf([...objects, dim('OBJ-0002', { kind: 'classe', cls: 'H7' })], [{ id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false }], []);
    expect(decodeDxfString(content)).toContain('Ø 25 H7 (+0,021/0) mm');
  });
});
