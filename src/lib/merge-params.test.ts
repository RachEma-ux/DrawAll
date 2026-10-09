import { describe, expect, it } from 'vitest';
import type { MicroVersion } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { merge3, mergedMateError, mergedParameterError, resolve } from './merge';
import type { CadObject } from '@/types/cad';
import type { Parameter } from './params/expr';

const layers = createDefaultLayers();
const P = (id: string, name: string, expr: string): Parameter => ({ id, name, expr, unit: '' });
const v = (seq: number, parameters: Parameter[]): MicroVersion => ({ seq, label: `v${seq}`, time: seq, objects: [], layers, blocks: [], parameters });

describe('fusion : graphe des paramètres revalidé', () => {
  it('a ← b d’un côté, b ← a de l’autre : la référence circulaire née de la fusion est refusée', () => {
    const base = v(0, [P('PAR-0001', 'a', '1'), P('PAR-0002', 'b', '2')]);
    const ours = v(1, [P('PAR-0001', 'a', 'b'), P('PAR-0002', 'b', '2')]);
    const theirs = v(2, [P('PAR-0001', 'a', '1'), P('PAR-0002', 'b', 'a')]);
    const r = merge3(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    const out = resolve(r, {});
    if ('error' in out) throw new Error(out.error);
    expect(mergedParameterError(out.parameters, ours.parameters, theirs.parameters)).toMatch(/^Fusion refusée : le paramètre a serait en erreur \(Référence circulaire/);
  });
  it('modifications compatibles : acceptées ; erreur déjà présente d’un côté : pas imputée à la fusion', () => {
    const p = (a: string, b: string) => [P('PAR-0001', 'a', a), P('PAR-0002', 'b', b)];
    expect(mergedParameterError(p('b + 1', '2'), p('b + 1', '1'), p('1', '2'))).toBeNull();
    expect(mergedParameterError(p('c', '2'), p('c', '2'), p('1', '2'))).toBeNull();
  });

  it('même nom ajouté dans chaque variante : fusion refusée', () => {
    const base = v(0, []);
    const ours = v(1, [P('PAR-0001', 'e', '200')]);
    const theirs = v(2, [P('PAR-0002', 'e', '300')]);
    const out = resolve(merge3(base, ours, theirs), {});
    if ('error' in out) throw new Error(out.error);
    expect(mergedParameterError(out.parameters, ours.parameters, theirs.parameters)).toBe('Fusion refusée : deux paramètres portent le nom e (PAR-0001 et PAR-0002) ; renommez-en un avant de fusionner');
  });
});

describe('fusion : liaisons revalidées', () => {
  const base0 = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
  const part = { ...base0, id: 'P', name: 'P', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
  const occ = (id: string, to?: string) => ({ ...base0, id, name: id, kind: 'occurrence', sourceId: 'P', x: 0, y: 0, z: 0, angle: 0, ...(to ? { mate: { type: 'fixe', to, rel: [0, 0, 0, 0] } } : {}) }) as unknown as CadObject;
  it('A → B d’un côté, B → A de l’autre : la boucle née de la fusion est refusée', () => {
    const base = { ...v(0, []), objects: [part, occ('A'), occ('B')] };
    const ours = { ...v(1, []), objects: [part, occ('A', 'B'), occ('B')] };
    const theirs = { ...v(2, []), objects: [part, occ('A'), occ('B', 'A')] };
    const r = merge3(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    const out = resolve(r, {});
    if ('error' in out) throw new Error(out.error);
    expect(mergedMateError(out.objects, ours.objects, theirs.objects)).toMatch(/^Fusion refusée : les liaisons réunies formeraient une boucle \((A|B)\)$/);
    expect(mergedMateError(ours.objects, ours.objects, base.objects)).toBeNull();
  });
});

