import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion, ProjectState } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { normalizeProjectState } from '@/store/project';
import { createBranch, switchBranch } from './branches';
import { conflictKey, diffById, merge3, mergeInputs, resolve } from './merge';

const layers = createDefaultLayers();
const base0 = { classification: 'non-classifie' as const, layerId: layers[0].id, hatch: 'none' as const, createdSeq: 0 };
const line = (id: string, x2: number, extra: Partial<CadObject> = {}) => ({ ...base0, id, name: id, kind: 'line', x1: 0, y1: 0, x2, y2: 0, ...extra }) as CadObject;
const v = (seq: number, objects: CadObject[], extra: Partial<MicroVersion> = {}): MicroVersion => ({ seq, label: `v${seq}`, time: seq, objects, layers, blocks: [], ...extra });

describe('comparaison et fusion (lot 14.2)', () => {
  it('différences : ajouté, modifié, supprimé', () => {
    expect(diffById([line('A', 1), line('B', 1)], [line('A', 2), line('C', 1)])).toEqual([
      { id: 'A', kind: 'modifié' }, { id: 'C', kind: 'ajouté' }, { id: 'B', kind: 'supprimé' },
    ]);
  });

  it('changements d’un seul côté repris, sans conflit ; même changement des deux côtés accepté', () => {
    const base = v(0, [line('A', 100), line('B', 100), line('C', 100)]);
    const ours = v(1, [line('A', 150), line('B', 100), line('C', 100), line('D', 10)]);      // A modifié, D ajouté
    const theirs = v(1, [line('A', 150), line('B', 300), line('E', 20)]);                    // A pareil, B modifié, C supprimé, E ajouté
    const r = merge3(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.merged.objects!.map(o => [o.id, (o as { x2: number }).x2])).toEqual([['A', 150], ['B', 300], ['D', 10], ['E', 20]]);
    expect(r.taken.map(t => `${t.id}:${t.kind}`).sort()).toEqual(['B:modifié', 'C:supprimé', 'E:ajouté']);
  });

  it('conflits : modifié des deux côtés, supprimé contre modifié, réglage ; listés, nôtre provisoire', () => {
    const base = v(0, [line('A', 100), line('B', 100)], { profileId: 'neutre' });
    const ours = v(1, [line('A', 200), line('B', 100, { color: '#ff0000' })], { profileId: 'enseignement' });
    const theirs = v(1, [line('A', 300)], { profileId: 'iso' });
    const r = merge3(base, ours, theirs);
    expect(r.conflicts.map(c => [c.where, c.id, c.ours, c.theirs])).toEqual([
      ['objects', 'A', 'modifié', 'modifié'], ['objects', 'B', 'modifié', 'supprimé'], ['profileId', 'profileId', 'modifié', 'modifié'],
    ]);
    expect(r.merged.objects!.map(o => (o as { x2: number }).x2)).toEqual([200, 100]);
    expect(r.merged.profileId).toBe('enseignement');
  });

  it('résolution : chaque conflit tranché ; « leur » reprend la valeur ou la suppression de l’autre variante', () => {
    const base = v(0, [line('A', 100), line('B', 100)]);
    const r = merge3(base, v(1, [line('A', 200), line('B', 100, { color: '#ff0000' })]), v(1, [line('A', 300)]));
    expect(resolve(r, {})).toEqual({ error: '2 conflits à trancher.' });
    const [a, b] = r.conflicts;
    const out = resolve(r, { [conflictKey(a)]: 'leur', [conflictKey(b)]: 'leur' });
    if ('error' in out) throw new Error(out.error);
    expect(out.objects!.map(o => [o.id, (o as { x2: number }).x2])).toEqual([['A', 300]]);
    const keep = resolve(r, { [conflictKey(a)]: 'nôtre', [conflictKey(b)]: 'nôtre' });
    if ('error' in keep) throw new Error(keep.error);
    expect(keep.objects!.map(o => o.id)).toEqual(['A', 'B']);
  });

  it('ancêtre commun : version de départ de la variante, dans un sens comme dans l’autre', () => {
    const start: ProjectState = normalizeProjectState({ versions: [v(0, []), v(1, [line('A', 100)])], pointer: 1, counter: 1, layerCounter: 4, blockCounter: 0, activeLayerId: layers[0].id });
    let s = createBranch(start, 'B') as ProjectState;
    s = { ...s, versions: [...s.versions, v(2, [line('A', 100), line('OBJ-0002', 5)])], pointer: 2 };
    s = switchBranch(s, 'BR-0000') as ProjectState;
    const m = mergeInputs(s, 'BR-0001');
    if ('error' in m) throw new Error(m.error);
    expect(m.base.seq).toBe(1);
    expect(merge3(m.base, m.ours, m.theirs).merged.objects!.map(o => o.id)).toEqual(['A', 'OBJ-0002']);
    const back = switchBranch(s, 'BR-0001') as ProjectState;
    const m2 = mergeInputs(back, 'BR-0000');
    expect('error' in m2 ? null : m2.base.seq).toBe(1);
  });
});
