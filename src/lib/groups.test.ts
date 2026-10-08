// Groupes (lot 10.5) : identifiants, sélection étendue, grouper, dégrouper, copies regroupées.
import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { expandToGroups, groupPatches, groupsOf, nextGroupId, ungroupIds } from './groups';
import { cloneAll, translation } from './array';

const base = { name: 'o', classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const line = (id: string, groupId?: string): CadObject => ({ ...base, id, kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, ...(groupId ? { groupId } : {}) });

describe('groupes (lot 10.5)', () => {
  it('identifiant libre suivant, en tenant compte des identifiants déjà réservés', () => {
    expect(nextGroupId([line('A'), line('B')])).toBe('GRP-0001');
    expect(nextGroupId([line('A', 'GRP-0003'), line('B', 'GRP-0001')])).toBe('GRP-0004');
    expect(nextGroupId([line('A', 'GRP-0003')], ['GRP-0007'])).toBe('GRP-0008');
  });

  it('désigner un membre désigne le groupe ; l’objet désigné reste le dernier (inspecteur)', () => {
    const objs = [line('A', 'GRP-0001'), line('B', 'GRP-0001'), line('C'), line('D', 'GRP-0002')];
    expect(expandToGroups(objs, ['B'])).toEqual(['A', 'B']);
    expect(expandToGroups(objs, ['C'])).toEqual(['C']);
    expect(expandToGroups(objs, ['C', 'D'])).toEqual(['C', 'D']);
  });

  it('grouper : groupe neuf (membres des groupes touchés compris) ; au moins deux objets', () => {
    const objs = [line('A', 'GRP-0001'), line('B', 'GRP-0001'), line('C')];
    expect(groupPatches(objs, ['B', 'C'])).toEqual({ groupId: 'GRP-0002', patches: ['A', 'B', 'C'].map(id => ({ id, patch: { groupId: 'GRP-0002' } })) });
    expect(groupPatches(objs, ['C'])).toBeNull();
  });

  it('dégrouper : tous les membres des groupes touchés', () => {
    const objs = [line('A', 'GRP-0001'), line('B', 'GRP-0001'), line('C', 'GRP-0002'), line('D', 'GRP-0002')];
    expect(ungroupIds(objs, ['A'])).toEqual(['A', 'B']);
    expect(groupsOf(objs)).toEqual([{ id: 'GRP-0001', members: ['A', 'B'] }, { id: 'GRP-0002', members: ['C', 'D'] }]);
  });

  it('copies : un groupe neuf par pose, jamais le groupe d’origine ; sans générateur, copies isolées', () => {
    const src = [line('A', 'GRP-0001'), line('B', 'GRP-0001'), line('C')];
    const all = [...src];
    const { objects } = cloneAll(src, [translation(10, 0), translation(20, 0)], 100, 1, [], taken => nextGroupId(all, taken));
    expect(objects.map(o => o.groupId ?? null)).toEqual(['GRP-0002', 'GRP-0002', null, 'GRP-0003', 'GRP-0003', null]);
    const isolated = cloneAll(src, [translation(10, 0)], 100, 1).objects;
    expect(isolated.every(o => !o.groupId)).toBe(true);
  });
});

describe('groupes et paquet natif', () => {
  it('l’appartenance aux groupes survit à l’historique compact et au paquet', async () => {
    const { normalizeProjectState } = await import('@/store/project');
    const { fromPackage, toPackage } = await import('./package');
    const { createDefaultLayers } = await import('@/types/cad');
    const layers = createDefaultLayers();
    const objs = [line('A', 'GRP-0001'), line('B', 'GRP-0001'), line('C')];
    const state = normalizeProjectState({ versions: [{ seq: 0, label: 'v0', time: 1, objects: objs, layers, blocks: [] }], pointer: 0, counter: 3, layerCounter: 4, blockCounter: 0, activeLayerId: 'LAY-0001' });
    const back = fromPackage(toPackage(state));
    if (!back.ok) throw new Error(back.error);
    expect(back.state.versions[0].objects.map(o => o.groupId ?? null)).toEqual(['GRP-0001', 'GRP-0001', null]);
  });
});
