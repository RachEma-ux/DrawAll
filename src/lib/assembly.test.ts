import { describe, expect, it } from 'vitest';
import type { CadObject, OccurrenceObj, SolidObj } from '@/types/cad';
import { assemblyRows, explodeOffsets, fixeMate, isMate, mateLoop, placeMate, resolveMates, type Mate } from './assembly';
import { scheduleTable } from './schedules';
import { effectiveSolid, extrudeRecipe, recipeBounds } from './solids';
import type { SolidRecipe } from './kernel/recipe';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const take = (r: { recipe: SolidRecipe } | { error: string }) => { if ('error' in r) throw new Error(r.error); return r.recipe; };
// Pièce 1 : pavé 300 × 100 × 50 ; pièce 2 : cylindre Ø 40 × 200.
const plate: SolidObj = { ...base, id: 'P1', name: 'Platine', kind: 'solid', recipe: take(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [300, 0], [300, 100], [0, 100]] }, 50, 0, 'P1')), partDef: { no: 1, origin: [0, 0, 0], angle: 0 } };
const pin: SolidObj = { ...base, id: 'P2', name: 'Axe', kind: 'solid', recipe: take(extrudeRecipe({ kind: 'circle', cx: 20, cy: 20, r: 20 }, 200, 0, 'P2')), partDef: { no: 2, origin: [0, 0, 0], angle: 0 } };
const occ = (id: string, sourceId: string, p: Partial<OccurrenceObj> = {}): OccurrenceObj => ({ ...base, id, name: id, kind: 'occurrence', sourceId, x: 0, y: 0, z: 0, angle: 0, ...p });
const bounds = (o: CadObject, objs: CadObject[]) => recipeBounds(effectiveSolid(o, objs)!.recipe);
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe('assemblage (lot 16.4)', () => {
  it('liaison fixe : l’occurrence suit sa référence (position et angle)', () => {
    const a = occ('A', 'P1', { x: 1000 }), b = occ('B', 'P1', { x: 1500, y: 200, angle: 10 });
    const m = fixeMate(b, a)!;
    expect(m).toEqual({ type: 'fixe', to: 'A', rel: [500, 200, 0, 10] });
    const moved = [plate, { ...a, x: 2000, y: 500, angle: 90 }, { ...b, mate: m }];
    const p = placeMate(b, m, moved);
    if ('error' in p) throw new Error(p.error);
    near([p.x, p.y, p.z, p.angle], [2000 - 200, 500 + 500, 0, 100]);
  });

  it('appui plan : dessous de B sur le dessus de A (écart 0 puis 10)', () => {
    const a = occ('A', 'P1', { x: 1000, z: 0 }), b = occ('B', 'P1', { x: 1100, y: 30, z: 500 });
    const m: Mate = { type: 'appui', to: 'A', face: { feature: 'P1', role: 'bottom' }, toFace: { feature: 'P1', role: 'top' }, offset: 0 };
    const r = resolveMates([plate, a, { ...b, mate: m }]);
    expect(r.errors).toEqual([]);
    const placed = r.objects.find(o => o.id === 'B') as OccurrenceObj;
    expect([placed.x, placed.y, placed.z, placed.angle]).toEqual([1100, 30, 50, 0]);
    expect(bounds(placed, r.objects).min[2]).toBe(bounds(a, r.objects).max[2]);
    const r10 = resolveMates([plate, a, { ...b, mate: { ...m, offset: 10 } }]);
    expect((r10.objects.find(o => o.id === 'B') as OccurrenceObj).z).toBe(60);
  });

  it('appui plan entre faces latérales : B tourne pour opposer les normales, puis se plaque', () => {
    const a = occ('A', 'P1', { x: 0 }), b = occ('B', 'P1', { x: 1000, y: 0, angle: 90 });
    // Côté 4 de B (X min, normale −X) contre le côté 2 de A (X max, normale +X).
    const m: Mate = { type: 'appui', to: 'A', face: { feature: 'P1', role: 'side:s3' }, toFace: { feature: 'P1', role: 'side:s1' }, offset: 0 };
    const p = placeMate(b, m, [plate, a, b]);
    if ('error' in p) throw new Error(p.error);
    expect(((p.angle % 360) + 360) % 360).toBeCloseTo(0, 9);
    const placed = { ...b, ...p };
    near([bounds(placed, [plate]).min[0]], [300]);
  });

  it('coaxiale : axes des cylindres confondus ; erreurs en clair ; boucle signalée', () => {
    const a = occ('A', 'P2', { x: 500, y: 500 }), b = occ('B', 'P2', { x: 0, y: 0, z: 300 });
    const m: Mate = { type: 'coaxiale', to: 'A', face: { feature: 'P2', role: 'wall' }, toFace: { feature: 'P2', role: 'wall' } };
    const p = placeMate(b, m, [pin, a, b]);
    expect(p).toEqual({ x: 500, y: 500, z: 300, angle: 0 });
    expect(placeMate(b, { ...m, toFace: { feature: 'P2', role: 'cap' } }, [pin, a, b])).toEqual({ error: 'liaison coaxiale : deux faces cylindriques attendues' });
    const same: Mate = { type: 'appui', to: 'A', face: { feature: 'P2', role: 'cap' }, toFace: { feature: 'P2', role: 'cap' }, offset: 0 };
    expect(placeMate(b, same, [pin, a, b])).toEqual({ error: 'appui plan : normales non opposables par une rotation autour de la verticale' });
    expect(placeMate(b, { ...m, to: 'Z' }, [pin, a, b])).toEqual({ error: 'référence Z absente' });
    const loop = resolveMates([plate, { ...occ('A', 'P1'), mate: { type: 'fixe', to: 'B', rel: [0, 0, 0, 0] } }, { ...occ('B', 'P1'), mate: { type: 'fixe', to: 'A', rel: [0, 0, 0, 0] } }]);
    expect(loop.errors.map(e => e.text)).toContain('liaisons en boucle');
    // Chaque membre de la boucle est signalé et laissé en place, ainsi que ce qui en dépend.
    const a0 = { ...occ('A', 'P1', { x: 10 }), mate: { type: 'fixe', to: 'B', rel: [100, 0, 0, 0] } } as OccurrenceObj;
    const b0 = { ...occ('B', 'P1', { x: 20 }), mate: { type: 'fixe', to: 'A', rel: [100, 0, 0, 0] } } as OccurrenceObj;
    const c0 = { ...occ('C', 'P1', { x: 30 }), mate: { type: 'fixe', to: 'A', rel: [100, 0, 0, 0] } } as OccurrenceObj;
    const cyc = resolveMates([plate, a0, b0, c0]);
    expect(cyc.errors.map(e => e.id).sort()).toEqual(['A', 'B', 'C']);
    expect(cyc.objects.filter(o => o.kind === 'occurrence').map(o => (o as OccurrenceObj).x)).toEqual([10, 20, 30]);
  });

  it('chaîne de liaisons : déplacer la base entraîne tout l’empilement', () => {
    const a = occ('A', 'P1', { x: 0 });
    const onTop = (id: string, to: string): OccurrenceObj => ({ ...occ(id, 'P1', { x: 50, z: 999 }), mate: { type: 'appui', to, face: { feature: 'P1', role: 'bottom' }, toFace: { feature: 'P1', role: 'top' }, offset: 0 } });
    const r = resolveMates([plate, { ...a, z: 1000 }, onTop('C', 'B'), onTop('B', 'A')]);
    expect(r.errors).toEqual([]);
    expect((r.objects.find(o => o.id === 'B') as OccurrenceObj).z).toBe(1050);
    expect((r.objects.find(o => o.id === 'C') as OccurrenceObj).z).toBe(1100);
  });

  it('nomenclature d’assemblage : repère, désignation, quantité (pièce type + occurrences)', () => {
    const objs = [pin, { ...plate, part: 'Platine acier' }, occ('A', 'P1'), occ('B', 'P1'), occ('C', 'P2')] as CadObject[];
    expect(assemblyRows(objs)).toEqual([{ no: 1, name: 'Platine acier', qty: 3 }, { no: 2, name: 'Axe', qty: 2 }]);
    const t = scheduleTable('assemblage', objs);
    expect(t.header).toEqual(['Rep.', 'Désignation', 'Qté']);
    expect(t.rows).toEqual([['1', 'Platine acier', '3'], ['2', 'Axe', '2']]);
    expect(t.total).toEqual(['', 'Total', '5']);
  });

  it('vue éclatée et relecture des liaisons', () => {
    expect(explodeOffsets([[0, 0, 0], [100, 0, 0]], 1)).toEqual([[-50, 0, 0], [50, 0, 0]]);
    expect(explodeOffsets([[0, 0, 0], [100, 0, 0]], 0)).toEqual([[-0, 0, 0], [0, 0, 0]]);
    expect(explodeOffsets([], 1)).toEqual([]);
    expect(isMate({ type: 'fixe', to: 'A', rel: [0, 0, 0, 0] })).toBe(true);
    expect(isMate({ type: 'appui', to: 'A', face: { feature: 'P', role: 'top' }, toFace: { feature: 'P', role: 'top' }, offset: 0 })).toBe(true);
    expect(isMate({ type: 'appui', to: 'A', face: { feature: 'P', role: 'top' }, toFace: { feature: 'P', role: 'top' } })).toBe(false);
    expect(isMate({ type: 'soudure', to: 'A' })).toBe(false);
  });
});

describe('boucles de liaisons (relecture #68)', () => {
  const occ = (id: string, to?: string) => ({ ...base, id, name: id, kind: 'occurrence', sourceId: 'P1', x: 0, y: 0, z: 0, angle: 0, ...(to ? { mate: { type: 'fixe', to, rel: [0, 0, 0, 0] } } : {}) }) as OccurrenceObj;
  it('liaison sur soi-même, A → B → A, A → B → C → A : boucle ; chaîne vers une pièce : non', () => {
    expect(mateLoop('A', 'A', [plate, occ('A')])).toBe(true);
    expect(mateLoop('A', 'B', [plate, occ('A'), occ('B', 'A')])).toBe(true);
    expect(mateLoop('A', 'B', [plate, occ('A'), occ('B', 'C'), occ('C', 'A')])).toBe(true);
    expect(mateLoop('A', 'B', [plate, occ('A'), occ('B', 'P1')])).toBe(false);
    // Boucle existante ailleurs (B ↔ C) : sans rapport avec A, pas de faux positif ni de boucle infinie.
    expect(mateLoop('A', 'B', [plate, occ('A'), occ('B', 'C'), occ('C', 'B')])).toBe(false);
  });
});

