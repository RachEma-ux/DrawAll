import { describe, expect, it } from 'vitest';
import type { GeoConstraint } from '@/types/cad';
import { bindConstraintValues, constraintExprError, usesOf } from './bind';
import type { Parameter } from './expr';

const P = (name: string, expr: string): Parameter => ({ id: `PAR-${name}`, name, expr, unit: 'mm' });
const len = (id: string, value: number, expr?: string): GeoConstraint => ({ id, type: 'length', seg: { obj: 'OBJ-0001', from: 'v1' }, value, ...(expr ? { expr } : {}) });

describe('cotes pilotantes (lot 12.2)', () => {
  it('valeur calculée depuis les paramètres ; même tableau si rien ne change', () => {
    const k = [len('K1', 1000, 'L'), len('K2', 500, 'L / 2'), len('K3', 70)];
    const out = bindConstraintValues(k, [P('L', '1200')])!;
    expect(out.map(c => ('value' in c ? c.value : null))).toEqual([1200, 600, 70]);
    expect(bindConstraintValues(out, [P('L', '1200')])).toBe(out);
    const plain = [len('K3', 70)];
    expect(bindConstraintValues(plain, [P('L', '1')])).toBe(plain);
  });
  it('expression en erreur ou non positive : dernière valeur gardée', () => {
    const k = [len('K1', 1000, 'L - 2000'), len('K2', 300, 'Z')];
    expect(bindConstraintValues(k, [P('L', '1200')])).toBe(k);
    expect(constraintExprError('L - 2000', [P('L', '1200')])).toBe('Valeur -800 : une cote doit être positive.');
    expect(constraintExprError('Z', [])).toBe('Paramètre inconnu « Z ».');
    expect(constraintExprError('L / 4', [P('L', '1200')])).toBeNull();
  });
  it('ce qui cite un paramètre', () => {
    expect(usesOf('L', [P('L', '1000'), P('H', 'L / 2'), P('E', '20')], [len('K1', 1, 'L'), len('K2', 1, 'E')])).toEqual(['H', 'K1']);
  });
});

describe('paramètres enregistrés (lot 12.2)', async () => {
  const { normalizeParameters } = await import('@/store/project');
  it('relecture : noms valides et uniques, unités connues', () => {
    const ok = [P('L', '1000'), P('H', 'L / 2')];
    expect(normalizeParameters(ok)).toEqual(ok);
    expect(normalizeParameters([...ok, P('L', '3'), { ...P('pi', '3'), unit: 'mm' }, { ...P('Q', '1'), unit: 'm' }, { id: 'x', name: 'R' }])).toEqual(ok);
    expect(normalizeParameters({})).toBeUndefined();
  });
});
