import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion, ProjectState } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { normalizeProjectState } from '@/store/project';
import { activeBranch, allVersions, branchList, createBranch, removeBranch, switchBranch } from './branches';
import { canonicalJson, fromPackage, toPackage } from './package';
import { decodeHistory, encodeHistory } from './history';

const layers = createDefaultLayers();
const base = { classification: 'non-classifie' as const, layerId: layers[0].id, hatch: 'none' as const, createdSeq: 0 };
const line = (id: string, x2: number) => ({ ...base, id, name: id, kind: 'line', x1: 0, y1: 0, x2, y2: 0 }) as CadObject;
const v = (seq: number, label: string, objects: CadObject[]): MicroVersion => ({ seq, label, time: seq, objects, layers, blocks: [] });
const state = (): ProjectState => normalizeProjectState({
  versions: [v(0, 'Initial', []), v(1, 'Ligne', [line('OBJ-0001', 100)]), v(2, 'Allonger', [line('OBJ-0001', 200)])],
  pointer: 2, counter: 1, layerCounter: 4, blockCounter: 0, activeLayerId: layers[0].id,
});
const ok = (r: ProjectState | { error: string }) => { if ('error' in r) throw new Error(r.error); return r; };

describe('branches (lot 14.1)', () => {
  it('variante depuis une version : historique jusqu’à elle, la branche quittée gardée intacte', () => {
    const s = ok(createBranch(state(), 'Variante B', 1));
    expect(activeBranch(s)).toEqual({ id: 'BR-0001', name: 'Variante B', from: { branchId: 'BR-0000', seq: 1 } });
    expect(s.versions.map(x => x.label)).toEqual(['Initial', 'Ligne']);
    expect(s.pointer).toBe(1);
    expect(s.branches).toHaveLength(1);
    expect(s.branches![0]).toMatchObject({ id: 'BR-0000', name: 'Principale', pointer: 2 });
    expect(s.branches![0].versions).toHaveLength(3);
    // Versions communes partagées, sans copie.
    expect(s.versions[1]).toBe(s.branches![0].versions[1]);
  });

  it('bascule : chaque branche garde son historique et sa position', () => {
    let s = ok(createBranch(state(), 'Variante B', 1));
    s = { ...s, versions: [...s.versions, v(3, 'Raccourcir', [line('OBJ-0001', 50)])], pointer: 2 };
    s = ok(switchBranch(s, 'BR-0000'));
    expect(s.branch).toBeUndefined();
    expect(s.versions.map(x => x.label)).toEqual(['Initial', 'Ligne', 'Allonger']);
    expect((s.versions[s.pointer].objects[0] as { x2: number }).x2).toBe(200);
    s = ok(switchBranch(s, 'BR-0001'));
    expect(s.versions.map(x => x.label)).toEqual(['Initial', 'Ligne', 'Raccourcir']);
    expect((s.versions[s.pointer].objects[0] as { x2: number }).x2).toBe(50);
    expect(branchList(s).map(b => [b.name, b.active, b.versions])).toEqual([['Variante B', true, 3], ['Principale', false, 3]]);
  });

  it('refus : nom vide ou pris, variante inconnue, suppression de l’active', () => {
    const s = ok(createBranch(state(), 'B'));
    expect(createBranch(s, 'B')).toEqual({ error: 'La variante « B » existe déjà.' });
    expect(createBranch(s, ' ')).toEqual({ error: 'Nom de variante attendu.' });
    expect(switchBranch(s, 'BR-9999')).toEqual({ error: 'Variante inconnue.' });
    expect(removeBranch(s, 'BR-0001')).toMatchObject({ error: expect.stringContaining('ne se supprime pas') });
    expect(ok(removeBranch(s, 'BR-0000')).branches).toBeUndefined();
  });

  it('identifiants : le compteur couvre toutes les branches', () => {
    let s = ok(createBranch(state(), 'B', 0));
    // Dans la variante, un objet OBJ-0007 ; de retour sur la principale, le compteur relu le dépasse.
    s = { ...s, versions: [...s.versions, v(1, 'Autre', [line('OBJ-0007', 10)])], pointer: 1 };
    const back = normalizeProjectState(decodeHistory(JSON.parse(JSON.stringify(encodeHistory(ok(switchBranch(s, 'BR-0000')))))));
    expect(back.counter).toBe(7);
    expect(allVersions(back)).toHaveLength(5);
  });

  it('enregistrement et paquet natif : branches conservées, aller-retour octet pour octet', () => {
    let s = ok(createBranch(state(), 'Variante B', 1));
    s = { ...s, versions: [...s.versions, v(2, 'Raccourcir', [line('OBJ-0001', 50)])], pointer: 2 };
    // État tel que l'application le tient : normalisé (comme après un enregistrement).
    s = normalizeProjectState(JSON.parse(JSON.stringify(s)));
    const pkg = toPackage(s);
    const back = fromPackage(pkg);
    if (!back.ok) throw new Error(back.error);
    expect(toPackage(back.state)).toBe(pkg);
    const again = fromPackage(toPackage(back.state));
    if (!again.ok) throw new Error(again.error);
    expect(canonicalJson(again.state)).toBe(canonicalJson(back.state));
    expect(back.state.branches![0].versions.map(x => x.label)).toEqual(['Initial', 'Ligne', 'Allonger']);
    expect(branchList(back.state).map(b => b.name)).toEqual(['Variante B', 'Principale']);
  });
});
