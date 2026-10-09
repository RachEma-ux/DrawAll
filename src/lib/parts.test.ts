import { describe, expect, it } from 'vitest';
import type { CadObject, OccurrenceObj, SolidObj } from '@/types/cad';
import { createDefaultLayers, dimensionOf, parentOf } from '@/types/cad';
import { exportToDxf } from './dxf';
import { mirrorObject, moveObject, objectBounds, rotateObject, scaleObject } from './geometry';
import { effectiveSolid, extrudeRecipe, solidTrace, nextPartNo, renumberParts, occurrenceRecipe, partInstances, partLocalRecipe, pushPullRecipe, recipeBounds } from './solids';
import type { SolidRecipe } from './kernel/recipe';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const take = (r: { recipe: SolidRecipe } | { error: string }) => { if ('error' in r) throw new Error(r.error); return r.recipe; };
const block = take(extrudeRecipe({ kind: 'polygon', points: [[1000, 2000], [1300, 2000], [1300, 2100], [1000, 2100]] }, 50, 0, 'OBJ-0001'));
const def: SolidObj = { ...base, id: 'OBJ-0001', name: 'Platine', kind: 'solid', recipe: block, partDef: { no: 1, origin: [1000, 2000, 0], angle: 0 } };
const occ = (p: Partial<OccurrenceObj> = {}): OccurrenceObj => ({ ...base, id: 'OBJ-0002', name: 'O', kind: 'occurrence', sourceId: 'OBJ-0001', x: 0, y: 0, z: 100, angle: 0, ...p });
const bounds = (o: CadObject, objs: CadObject[]) => recipeBounds(effectiveSolid(o, objs)!.recipe);

describe('pièces et occurrences (lot 16.3)', () => {
  it('repère local de la pièce, occurrence posée et tournée', () => {
    expect(recipeBounds(partLocalRecipe(def)!)).toEqual({ min: [0, 0, 0], max: [300, 100, 50] });
    expect(bounds(occ(), [def])).toEqual({ min: [0, 0, 100], max: [300, 100, 150] });
    const turned = bounds(occ({ x: 500, y: 500, angle: 90 }), [def]);
    expect(turned.min.map(Math.round)).toEqual([400, 500, 100]);
    expect(turned.max.map(Math.round)).toEqual([500, 800, 150]);
    expect(occurrenceRecipe(occ(), undefined)).toBeNull();
    expect(occurrenceRecipe(occ(), { ...def, partDef: undefined })).toBeNull();
  });

  it('modifier la définition met à jour toutes les occurrences', () => {
    const occs = [occ(), occ({ id: 'OBJ-0003', x: 1000, angle: 180 })];
    const longer: SolidObj = { ...def, recipe: take(pushPullRecipe(block, { feature: 'OBJ-0001', role: 'top' }, 25)) };
    for (const o of occs) {
      const before = bounds(o, [def]), after = bounds(o, [longer]);
      expect(after.max[2] - after.min[2]).toBe(75);
      expect(before.max[2] - before.min[2]).toBe(50);
    }
  });

  it('déplacer ou tourner la pièce type ne déplace pas ses occurrences (repère local suivi)', () => {
    const o = occ({ x: 5000, y: 0 });
    const ref = bounds(o, [def]);
    const moved = { ...def, ...moveObject(def, 700, -300) } as SolidObj;
    expect(moved.partDef!.origin).toEqual([1700, 1700, 0]);
    expect(bounds(o, [moved])).toEqual(ref);
    const turned = { ...def, ...rotateObject(def, 0, 0, 37) } as SolidObj;
    expect(turned.partDef!.angle).toBe(37);
    // L'encombrement d'une recette tournée est majorant : on compare la trace exacte (sommets).
    const pts = (d: SolidObj) => solidTrace(effectiveSolid(o, [d])!.recipe).flatMap(t => ('pts' in t ? t.pts : []));
    const a = pts(def), b = pts(turned);
    expect(b).toHaveLength(a.length);
    b.forEach((p, i) => { expect(p[0]).toBeCloseTo(a[i][0], 6); expect(p[1]).toBeCloseTo(a[i][1], 6); });
  });

  it('transformations d’une occurrence ; repères ; exemplaires ; échanges', () => {
    expect(moveObject(occ(), 10, 20)).toEqual({ x: 10, y: 20 });
    expect(rotateObject(occ({ x: 100, y: 0 }), 0, 0, 90)).toMatchObject({ angle: 90 });
    expect(scaleObject(occ(), 0, 0, 2)).toBeNull();
    expect(mirrorObject(occ(), 'x', 0)).toEqual({});
    expect(parentOf(occ())).toBe('OBJ-0001');
    expect(objectBounds(occ(), [], [def])).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 100 });
    expect(nextPartNo([def, { ...def, id: 'X', partDef: { ...def.partDef!, no: 4 } }])).toBe(5);
    expect(nextPartNo([])).toBe(1);
    expect(partInstances('OBJ-0001', [def, occ(), occ({ id: 'OBJ-0003' })])).toEqual(['OBJ-0001', 'OBJ-0002', 'OBJ-0003']);
    expect(dimensionOf(occ({ x: 1, y: 2, z: 3, angle: 45 }))).toBe('Occurrence de OBJ-0001 en (1 ; 2 ; 3), 45°');
    const dxf = exportToDxf([def, occ()] as CadObject[], createDefaultLayers(), []);
    expect(dxf.match(/LWPOLYLINE/g)?.length).toBe(2);
  });
});

describe('pièces copiées : nouveaux repères (relecture #68)', () => {
  it('chaque pièce copiée reçoit le repère suivant ; les autres objets sont inchangés', () => {
    const part = (id: string, no: number) => ({ ...base, id, name: id, kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no, origin: [0, 0, 0], angle: 0 } }) as unknown as CadObject;
    const line = { ...base, id: 'L', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 } as CadObject;
    const out = renumberParts([part('C1', 1), line, part('C2', 2)], [part('P1', 1), part('P2', 2), part('X', 7)]);
    expect(out.map(o => (o.kind === 'solid' ? o.partDef?.no : null))).toEqual([8, null, 9]);
  });
});

