import { describe, expect, it } from 'vitest';
import type { MicroVersion } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { merge3, mergedConstraintError, mergedMateError, mergedParameterError, resolve } from './merge';
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

describe('fusion : au moins un calque', () => {
  it('chaque variante supprime un calque différent : refus, jamais un projet sans calque', () => {
    const L1 = { id: 'LAY-0001', name: 'A', visible: true, locked: false, color: '#000' };
    const L2 = { id: 'LAY-0002', name: 'B', visible: true, locked: false, color: '#000' };
    const ver = (seq: number, ls: typeof L1[]) => ({ ...v(seq, []), layers: ls as unknown as MicroVersion['layers'] });
    const r = merge3(ver(0, [L1, L2]), ver(1, [L2]), ver(2, [L1]));
    expect(r.conflicts).toEqual([]);
    expect(resolve(r, {})).toEqual({ error: 'Fusion refusée : aucun calque ne resterait (chaque variante en supprime un) ; gardez-en un avant de fusionner.' });
    // Une seule suppression : fusion acceptée.
    expect('error' in resolve(merge3(ver(0, [L1, L2]), ver(1, [L2]), ver(2, [L1, L2])), {})).toBe(false);
  });
});


describe('fusion : contraintes géométriques revalidées', () => {
  const line = (x: number) => ({ classification: 'non-classifie', layerId: 'LAY-0001', hatch: 'none', createdSeq: 0, id: 'L', name: 'L', kind: 'line', x1: x, y1: 0, x2: x + 100, y2: 0 }) as unknown as CadObject;
  const fix = (id: string, x: number) => ({ id, type: 'fixed' as const, p: { obj: 'L', at: 'a' as const }, x, y: 0 });
  it('extrémité fixée à x = 0 d’un côté, ligne déplacée et fixée à x = 10 de l’autre : refus', () => {
    const base = { ...v(0, []), objects: [line(0)] };
    const ours = { ...v(1, []), objects: [line(0)], constraints: [fix('CON-0001', 0)] };
    const theirs = { ...v(2, []), objects: [line(10)], constraints: [fix('CON-0002', 10)] };
    const r = merge3(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    const out = resolve(r, {});
    if ('error' in out) throw new Error(out.error);
    const merged = { objects: out.objects ?? ours.objects, constraints: out.constraints ?? ours.constraints };
    expect(mergedConstraintError(merged, ours, theirs)).toMatch(/^Fusion refusée : les contraintes réunies seraient en conflit \(CON-000[12]\)$/);
    // Contraintes compatibles (même point fixé au même endroit) : acceptées.
    expect(mergedConstraintError({ objects: [line(0)], constraints: [fix('CON-0001', 0), fix('CON-0002', 0)] }, ours, base)).toBeNull();
  });
});
