import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion, ProjectState } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { normalizeProjectState } from '@/store/project';
import { createBranch, switchBranch } from './branches';
import { conflictKey, diffById, merge3, mergeInputs, resolve, versionDiff } from './merge';

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

  it('dépendances : bloc supprimé d’un côté, occurrence ajoutée de l’autre → conflit, jamais d’occurrence orpheline', () => {
    const blk = { id: 'BLQ-0001', name: 'Porte', primitives: [], base: { x: 0, y: 0 } } as unknown as MicroVersion['blocks'][number];
    const ref = { ...base0, id: 'R', name: 'R', kind: 'blockRef', blockId: 'BLQ-0001', x: 0, y: 0, scale: 1, rotation: 0 } as unknown as CadObject;
    const base = v(0, [], { blocks: [blk] });
    const ours = v(1, [], { blocks: [] });              // nous : bloc supprimé
    const theirs = v(1, [ref], { blocks: [blk] });      // eux : occurrence ajoutée
    const r = merge3(base, ours, theirs);
    // Le bloc est gardé provisoirement ; la suppression est un conflit qui nomme l'occurrence dépendante.
    expect(r.merged.blocks!.map(b => b.id)).toEqual(['BLQ-0001']);
    const c = r.conflicts.find(x => x.where === 'blocks')!;
    expect(c).toMatchObject({ id: 'BLQ-0001', ours: 'supprimé', dependents: ['R'] });
    // Garder la suppression retire aussi l'occurrence ; garder le bloc garde les deux.
    const del = resolve(r, { [conflictKey(c)]: 'nôtre' });
    if ('error' in del) throw new Error(del.error);
    expect([del.blocks, del.objects]).toEqual([[], []]);
    const keep = resolve(r, { [conflictKey(c)]: 'leur' });
    if ('error' in keep) throw new Error(keep.error);
    expect([keep.blocks!.map(b => b.id), keep.objects!.map(o => o.id)]).toEqual([['BLQ-0001'], ['R']]);
  });

  it('dépendances : calque supprimé par l’autre variante alors que nous y avons ajouté un objet', () => {
    const extra = { id: 'LAY-0009', name: 'Relevé', color: '#ffffff', visible: true, locked: false } as MicroVersion['layers'][number];
    const base = v(0, [], { layers: [...layers, extra] });
    const ours = v(1, [line('N', 10, { layerId: 'LAY-0009' })], { layers: [...layers, extra] });
    const theirs = v(1, [], { layers });
    const r = merge3(base, ours, theirs);
    expect(r.merged.layers!.some(l => l.id === 'LAY-0009')).toBe(true);
    expect(r.conflicts).toEqual([expect.objectContaining({ where: 'layers', id: 'LAY-0009', theirs: 'supprimé', dependents: ['N'] })]);
  });

  it('zone supprimée chez nous, pièce rangée dans cette zone chez eux → conflit ; suppression retenue : pièce gardée, sans zone', () => {
    const zone = { id: 'ZON-0001', name: 'Jour', color: '#ffcc00' };
    const room = { ...base0, id: 'R1', name: 'Séjour', kind: 'room', x: 0, y: 0 } as CadObject;
    const base = v(0, [room], { zones: [zone] });
    const ours = v(1, [room], { zones: [] });
    const theirs = v(1, [{ ...room, zoneId: 'ZON-0001' } as CadObject], { zones: [zone] });
    const r = merge3(base, ours, theirs);
    expect(r.conflicts).toEqual([expect.objectContaining({ where: 'zones', id: 'ZON-0001', ours: 'supprimé', dependents: ['R1'] })]);
    expect(r.merged.zones!.map(z => z.id)).toEqual(['ZON-0001']);
    const kept = resolve(r, { [conflictKey(r.conflicts[0])]: 'nôtre' });
    if ('error' in kept) throw new Error(kept.error);
    expect(kept.zones).toEqual([]);
    expect(kept.objects!.map(o => [o.id, (o as { zoneId?: string }).zoneId])).toEqual([['R1', undefined]]);
    const theirsWins = resolve(r, { [conflictKey(r.conflicts[0])]: 'leur' });
    if ('error' in theirsWins) throw new Error(theirsWins.error);
    expect((theirsWins.objects![0] as { zoneId?: string }).zoneId).toBe('ZON-0001');
  });

  it('pièce en conflit et zone supprimée : après les choix, jamais de rattachement à une zone absente', () => {
    const Z = { id: 'Z', name: 'Z', color: '#000000' }, W = { id: 'W', name: 'W', color: '#ffffff' };
    const room = { ...base0, id: 'R1', name: 'Séjour', kind: 'room', x: 0, y: 0, zoneId: 'Z' } as CadObject;
    const base = v(0, [room], { zones: [Z, W] });
    const ours = v(1, [{ ...room, zoneId: 'W' } as CadObject], { zones: [Z, W] });
    const theirs = v(1, [{ ...room, name: 'Salon' } as CadObject], { zones: [W] });
    const r = merge3(base, ours, theirs);
    const out = resolve(r, Object.fromEntries(r.conflicts.map(c => [conflictKey(c), 'leur' as const])));
    if ('error' in out) throw new Error(out.error);
    const zones = new Set(out.zones!.map(z => z.id));
    expect(out.objects!.every(o => o.kind !== 'room' || !o.zoneId || zones.has(o.zoneId))).toBe(true);
    expect(out.objects![0]).toMatchObject({ id: 'R1', name: 'Salon' });
  });

  it('liaison vers une occurrence supprimée de l’autre côté : l’occurrence liée reste, sans liaison', () => {
    const occ = (id: string, extra: Record<string, unknown> = {}) => ({ ...base0, id, name: id, kind: 'occurrence', sourceId: 'S', x: 0, y: 0, z: 0, angle: 0, ...extra }) as unknown as CadObject;
    const S = { ...base0, id: 'S', name: 'S', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    const base = v(0, [S, occ('A')]);
    const ours = v(1, [S, occ('A'), occ('B', { mate: { type: 'fixe', to: 'A', rel: [0, 0, 0, 0] } })]);
    const theirs = v(1, [S]);
    const r = merge3(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(r.merged.objects!.map(o => [o.id, 'mate' in o ? o.mate : undefined])).toEqual([['S', undefined], ['B', undefined]]);
    const out = resolve(r, {});
    if ('error' in out) throw new Error(out.error);
    expect(out.objects!.map(o => o.id)).toEqual(['S', 'B']);
  });

  it('objet rétabli par un choix alors que son parent a été supprimé sans conflit : il suit son parent', () => {
    const wall = { ...base0, id: 'W', name: 'W', kind: 'wall', x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200, justification: 'axe' } as CadObject;
    const door = { ...base0, id: 'D', name: 'D', kind: 'opening', hostId: 'W', type: 'porte', position: 1000, width: 900, hinge: 'debut', side: 'gauche' } as unknown as CadObject;
    const base = v(0, [wall, door]);
    const ours = v(1, []); // mur supprimé, porte emportée
    const theirs = v(1, [wall, { ...door, width: 1000 } as CadObject]); // porte élargie
    const r = merge3(base, ours, theirs);
    const out = resolve(r, Object.fromEntries(r.conflicts.map(c => [conflictKey(c), 'leur' as const])));
    if ('error' in out) throw new Error(out.error);
    const present = new Set(out.objects!.map(o => o.id));
    expect(out.objects!.every(o => o.kind !== 'opening' || present.has(o.hostId))).toBe(true);
  });

  it('objet en conflit : chacune de ses deux valeurs doit trouver son calque (calque supprimé par l’une)', () => {
    const L1 = { ...layers[0], id: 'LAY-0101', name: 'L1' }, L2 = { ...layers[0], id: 'LAY-0102', name: 'L2' };
    const obj = line('X', 10, { layerId: 'LAY-0101' });
    const base = v(0, [obj], { layers: [...layers, L1, L2] });
    const ours = v(1, [{ ...obj, layerId: 'LAY-0102' } as CadObject], { layers: [...layers, L1, L2] });
    const theirs = v(1, [{ ...obj, x2: 20 } as CadObject], { layers: [...layers, L2] });
    const r = merge3(base, ours, theirs);
    expect(r.conflicts.map(c => `${c.where}:${c.id}`).sort()).toEqual(['layers:LAY-0101', 'objects:X']);
    // Leur objet retenu, la suppression du calque refusée : l'objet garde son calque.
    const out = resolve(r, { 'objects:X': 'leur', 'layers:LAY-0101': 'nôtre' });
    if ('error' in out) throw new Error(out.error);
    const ids = new Set(out.layers!.map(l => l.id));
    expect(out.objects!.every(o => ids.has(o.layerId))).toBe(true);
    // Notre objet retenu (sur L2) et la suppression de L1 retenue : l'objet, qui n'utilise plus L1, reste.
    const kept = resolve(r, { 'objects:X': 'nôtre', 'layers:LAY-0101': 'leur' });
    if ('error' in kept) throw new Error(kept.error);
    expect(kept.layers!.some(l => l.id === 'LAY-0101')).toBe(false);
    expect(kept.objects!.map(o => [o.id, o.layerId])).toEqual([['X', 'LAY-0102']]);
  });

  it('niveau supprimé chez nous, feuille ajoutée chez eux qui le montre → conflit ; suppression retenue : fenêtre retournée au premier niveau', () => {
    const L1 = { id: 'NIV-0001', name: 'Rez', elevation: 0 }, L2 = { id: 'NIV-0002', name: 'Étage', elevation: 3000 };
    const sheet = { id: 'FEU-0001', name: 'Étage', format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 },
      viewports: [{ id: 'FEN-0001', name: 'Plan', x: 20, y: 10, w: 200, h: 150, scale: { paper: 1, model: 50 }, center: { x: 0, y: 0 }, hiddenLayerIds: [], levelId: 'NIV-0002' }] } as unknown as NonNullable<MicroVersion['sheets']>[number];
    const base = v(0, [], { levels: [L1, L2], sheets: [] });
    const ours = v(1, [], { levels: [L1], sheets: [] });
    const theirs = v(1, [], { levels: [L1, L2], sheets: [sheet] });
    const r = merge3(base, ours, theirs);
    expect(r.conflicts).toEqual([expect.objectContaining({ where: 'levels', id: 'NIV-0002', ours: 'supprimé', dependents: ['FEU-0001'] })]);
    const out = resolve(r, { [conflictKey(r.conflicts[0])]: 'nôtre' });
    if ('error' in out) throw new Error(out.error);
    expect(out.levels!.map(l => l.id)).toEqual(['NIV-0001']);
    expect(out.sheets![0].viewports[0].levelId).toBe('NIV-0001');
  });

  it('objet supprimé chez nous avec sa contrainte, contrainte modifiée chez eux → la suppression de l’objet est un conflit', () => {
    const L = line('L', 100);
    const k = { id: 'CTR-0001', type: 'horizontal', seg: { obj: 'L' } } as unknown as NonNullable<MicroVersion['constraints']>[number];
    const base = v(0, [L], { constraints: [k] });
    const ours = v(1, [], { constraints: [] });
    const theirs = v(1, [L], { constraints: [{ ...k, type: 'vertical' } as typeof k] });
    const r = merge3(base, ours, theirs);
    expect(r.conflicts.map(c => `${c.where}:${c.id}`).sort()).toEqual(['constraints:CTR-0001', 'objects:L']);
    // Leur contrainte et leur objet retenus : la contrainte garde son objet.
    const out = resolve(r, { 'constraints:CTR-0001': 'leur', 'objects:L': 'leur' });
    if ('error' in out) throw new Error(out.error);
    expect(out.objects!.map(o => o.id)).toEqual(['L']);
    expect(out.constraints!.map(c => c.id)).toEqual(['CTR-0001']);
  });

  it('objet rétabli par une dépendance : son calque supprimé devient aussi un conflit (contrôles répétés)', () => {
    const L = { ...layers[0], id: 'LAY-0201', name: 'L' };
    const P = line('P', 100, { layerId: 'LAY-0201' });
    const D = { ...base0, id: 'D', name: 'D', kind: 'dimension', targetId: 'P', style: 'aligned', offset: 5 } as unknown as CadObject;
    const base = v(0, [P], { layers: [...layers, L] });
    const ours = v(1, [], { layers });
    const theirs = v(1, [P, D], { layers: [...layers, L] });
    const r = merge3(base, ours, theirs);
    expect(r.conflicts.map(c => `${c.where}:${c.id}`).sort()).toEqual(['layers:LAY-0201', 'objects:P']);
    const out = resolve(r, { 'objects:P': 'leur', 'layers:LAY-0201': 'leur' });
    if ('error' in out) throw new Error(out.error);
    const ids = new Set(out.layers!.map(l => l.id));
    expect(out.objects!.map(o => o.id).sort()).toEqual(['D', 'P']);
    expect(out.objects!.every(o => ids.has(o.layerId))).toBe(true);
  });

  it('paramètre supprimé chez nous, encore cité par la contrainte modifiée chez eux → conflit sur le paramètre', () => {
    const L = line('L', 100);
    type K = NonNullable<MicroVersion['constraints']>[number];
    const P = { id: 'PAR-0001', name: 'a', expr: '100', unit: 'mm' } as NonNullable<MicroVersion['parameters']>[number];
    const C = { id: 'CTR-0001', type: 'length', seg: { obj: 'L' }, value: 100, expr: 'a' } as unknown as K;
    const base = v(0, [L], { constraints: [C], parameters: [P] });
    const ours = v(1, [L], { constraints: [{ ...C, expr: undefined } as unknown as K], parameters: [] });
    const theirs = v(1, [L], { constraints: [{ ...C, expr: 'a*2' } as unknown as K], parameters: [P] });
    const r = merge3(base, ours, theirs);
    expect(r.conflicts.map(c => `${c.where}:${c.id}`).sort()).toEqual(['constraints:CTR-0001', 'parameters:PAR-0001']);
    const out = resolve(r, { 'constraints:CTR-0001': 'leur', 'parameters:PAR-0001': 'leur' });
    if ('error' in out) throw new Error(out.error);
    expect(out.parameters!.map(p => p.name)).toEqual(['a']);
    // Choix incompatibles : suppression de `a` retenue, mais leur contrainte qui le cite aussi → refusé.
    expect(resolve(r, { 'constraints:CTR-0001': 'leur', 'parameters:PAR-0001': 'nôtre' })).toEqual({ error: 'Choix incompatibles : le paramètre a est supprimé mais CTR-0001 le cite encore.' });
    // Notre contrainte (sans expression) avec la suppression : cohérent.
    expect('error' in resolve(r, { 'constraints:CTR-0001': 'nôtre', 'parameters:PAR-0001': 'nôtre' })).toBe(false);
  });

  it('comparaison : toutes les collections et les réglages sont comptés, pas seulement les objets', () => {
    const base = v(0, [line('A', 1)]);
    const other = v(1, [line('A', 1)], { layers: [...layers, { id: 'LAY-0009', name: 'X', color: '#000000', visible: true, locked: false }], profileId: 'beton' } as Partial<MicroVersion>);
    expect(versionDiff(base, other)).toEqual([{ id: 'LAY-0009', kind: 'ajouté', where: 'layers' }, { id: 'profileId', kind: 'modifié', where: 'profileId' }]);
  });

  it('dépendances entre objets : pièce supprimée d’un côté, occurrence ajoutée de l’autre → conflit, aucune occurrence orpheline', () => {
    const part = { ...base0, id: 'P', name: 'P', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    const occ = { ...base0, id: 'O', name: 'O', kind: 'occurrence', sourceId: 'P', x: 0, y: 0, z: 0, angle: 0 } as unknown as CadObject;
    const dim = { ...base0, id: 'D', name: 'D', kind: 'dimension', targetId: 'O', style: 'aligned', offset: 10 } as unknown as CadObject;
    const r = merge3(v(0, [part]), v(1, []), v(1, [part, occ, dim]));
    expect(r.merged.objects!.map(o => o.id).sort()).toEqual(['D', 'O', 'P']);
    const c = r.conflicts.find(x => x.where === 'objects' && x.id === 'P')!;
    expect(c).toMatchObject({ ours: 'supprimé', dependents: ['O'] });
    // Retenir la suppression retire l'occurrence et, de proche en proche, la cote qui la vise.
    const del = resolve(r, { [conflictKey(c)]: 'nôtre' });
    if ('error' in del) throw new Error(del.error);
    expect(del.objects).toEqual([]);
    const keep = resolve(r, { [conflictKey(c)]: 'leur' });
    if ('error' in keep) throw new Error(keep.error);
    expect(keep.objects!.map(o => o.id).sort()).toEqual(['D', 'O', 'P']);
  });

  it('contrainte ajoutée d’un côté sur un objet supprimé de l’autre → conflit, pas d’élagage silencieux', () => {
    const k = { id: 'CTR-0001', type: 'horizontal', seg: { obj: 'A', i: 0 } } as unknown as NonNullable<MicroVersion['constraints']>[number];
    const r = merge3(v(0, [line('A', 100)]), v(1, []), v(1, [line('A', 100)], { constraints: [k] }));
    const c = r.conflicts.find(x => x.where === 'objects' && x.id === 'A')!;
    expect(c).toMatchObject({ ours: 'supprimé', dependents: ['CTR-0001'] });
    const del = resolve(r, { [conflictKey(c)]: 'nôtre' });
    if ('error' in del) throw new Error(del.error);
    expect([del.objects, del.constraints]).toEqual([[], []]);
    const keep = resolve(r, { [conflictKey(c)]: 'leur' });
    if ('error' in keep) throw new Error(keep.error);
    expect(keep.constraints!.map(x => x.id)).toEqual(['CTR-0001']);
  });

  it('géoréférencement fusionné : ajout, retrait et conflit', () => {
    const g = { crs: 'EPSG:2056', e: 2600000, n: 1200000, h: 400, north: 0 };
    const added = merge3(v(0, []), v(1, []), v(1, [], { georef: g }));
    expect(added.merged.georef).toEqual(g);
    expect(added.taken).toContainEqual({ where: 'georef', id: 'georef', kind: 'ajouté' });
    const removed = merge3(v(0, [], { georef: g }), v(1, [], { georef: g }), v(1, []));
    expect(removed.merged.georef).toBeNull();
    const both = merge3(v(0, [], { georef: g }), v(1, [], { georef: { ...g, north: 10 } }), v(1, []));
    expect(both.conflicts).toEqual([expect.objectContaining({ where: 'georef', ours: 'modifié', theirs: 'supprimé' })]);
    expect(versionDiff(v(0, []), v(1, [], { georef: g }))).toEqual([{ id: 'georef', kind: 'modifié', where: 'georef' }]);
  });
});

describe('relecture 57e passe : ancêtre commun perdu par une histoire', () => {
  it('variante revenue avant son point de départ puis modifiée : l’ancêtre est trouvé chez sa mère', () => {
    const start: ProjectState = normalizeProjectState({ versions: [v(0, []), v(1, [line('A', 100)])], pointer: 1, counter: 1, layerCounter: 4, blockCounter: 0, activeLayerId: layers[0].id });
    let s = createBranch(start, 'B') as ProjectState;
    // La variante revient à v0 et modifie : v1 (son point de départ) quitte son histoire.
    s = { ...s, versions: [s.versions[0], v(2, [line('C', 7)])], pointer: 1 };
    // Variante → mère.
    const m = mergeInputs(s, 'BR-0000');
    expect('error' in m ? m.error : m.base.seq).toBe(1);
    // Mère → variante.
    const back = switchBranch(s, 'BR-0000') as ProjectState;
    const m2 = mergeInputs(back, 'BR-0001');
    expect('error' in m2 ? m2.error : m2.base.seq).toBe(1);
  });
});
