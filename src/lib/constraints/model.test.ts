import { describe, expect, it } from 'vitest';
import type { CadObject, GeoConstraint, PolylineObj } from '@/types/cad';
import { buildSketch, constraintAnchors, diagnose, enforceConstraints, makeConstraint, pickElement, pointOf, pruneConstraints, segOf, vertexIdsValid, withVertexIds } from './model';

const base = { layerId: 'LAY-0001', classification: 'non-classifie', hatch: 'none', createdSeq: 0 } as const;
const poly = (points: number[], vids?: string[]): PolylineObj => ({ ...base, id: 'OBJ-0001', name: 'R', kind: 'polyline', points, ...(vids ? { vids } : {}) } as PolylineObj);
/** Rectangle fermé un peu de travers (comme dessiné à main levée). */
const skewed = () => withVertexIds(poly([0, 0, 1003, 4, 998, 497, 2, 506, 0, 0]));
const rectConstraints = (w = 1000, h = 500): GeoConstraint[] => [
  { id: 'K1', type: 'horizontal', seg: { obj: 'OBJ-0001', from: 'v1' } },
  { id: 'K2', type: 'vertical', seg: { obj: 'OBJ-0001', from: 'v2' } },
  { id: 'K3', type: 'horizontal', seg: { obj: 'OBJ-0001', from: 'v3' } },
  { id: 'K4', type: 'vertical', seg: { obj: 'OBJ-0001', from: 'v4' } },
  { id: 'K5', type: 'length', seg: { obj: 'OBJ-0001', from: 'v1' }, value: w },
  { id: 'K6', type: 'length', seg: { obj: 'OBJ-0001', from: 'v2' }, value: h },
  { id: 'K7', type: 'fixed', p: { obj: 'OBJ-0001', at: 'v:v1' }, x: 0, y: 0 },
];
const pts = (o: CadObject) => (o as PolylineObj).points.map(v => Math.round(v * 1e6) / 1e6);

describe('contraintes dans l’atelier (lot 12.1)', () => {
  it('identifiants de sommets : un par point, la fermeture reprend le premier', () => {
    const r = skewed();
    expect(r.vids).toEqual(['v1', 'v2', 'v3', 'v4', 'v1']);
    expect(vertexIdsValid(r)).toBe(true);
    // Un sommet inséré sans identifiant : les identifiants ne valent plus.
    expect(vertexIdsValid({ ...r, points: [0, 0, 500, 0, ...r.points.slice(2)] })).toBe(false);
  });

  it('rectangle entièrement contraint : remis d’équerre aux cotes, 0 degré de liberté', () => {
    const r = skewed();
    const out = enforceConstraints([r], [r], rectConstraints());
    expect(out.solved).toBe(true);
    expect(pts(out.objects[0])).toEqual([0, 0, 1000, 0, 1000, 500, 0, 500, 0, 0]);
    const d = diagnose(out.objects, rectConstraints());
    expect(d.dof).toBe(0);
    expect(Object.values(d.states).every(s => s === 'satisfaite')).toBe(true);
  });

  it('glisser un coin d’un rectangle sans cotes : il reste d’équerre et suit le coin', () => {
    const k = rectConstraints().filter(c => c.type !== 'length');
    const r = enforceConstraints([skewed()], [skewed()], k).objects[0] as PolylineObj;
    const moved = { ...r, points: r.points.map((v, i) => (i === 4 ? 1200 : i === 5 ? 600 : v)) };
    const out = enforceConstraints([r], [moved], k);
    expect(out.solved).toBe(true);
    expect(pts(out.objects[0])).toEqual([0, 0, 1200, 0, 1200, 600, 0, 600, 0, 0]);
  });

  it('modification contraire aux cotes : la forme revient aux cotes', () => {
    const r = enforceConstraints([skewed()], [skewed()], rectConstraints()).objects[0] as PolylineObj;
    const moved = { ...r, points: r.points.map((v, i) => (i === 4 ? 1200 : v)) };
    const out = enforceConstraints([r], [moved], rectConstraints());
    expect(out.solved).toBe(true);
    expect(pts(out.objects[0])).toEqual([0, 0, 1000, 0, 1000, 500, 0, 500, 0, 0]);
  });

  it('sur-contrainte cohérente : la contrainte de trop est signalée redondante', () => {
    const k = [...rectConstraints(), { id: 'K8', type: 'length', seg: { obj: 'OBJ-0001', from: 'v3' }, value: 1000 } as GeoConstraint];
    const r = enforceConstraints([skewed()], [skewed()], k);
    expect(r.solved).toBe(true);
    const d = diagnose(r.objects, k);
    expect(d.redundant.length).toBeGreaterThan(0);
    expect(Object.values(d.states)).toContain('redondante');
    expect(Object.values(d.states)).not.toContain('conflit');
  });

  it('conflit : aucune solution, objets laissés tels quels, contraintes en cause nommées', () => {
    const r = enforceConstraints([skewed()], [skewed()], rectConstraints()).objects;
    const k = [...rectConstraints(), { id: 'K8', type: 'length', seg: { obj: 'OBJ-0001', from: 'v3' }, value: 900 } as GeoConstraint];
    const out = enforceConstraints(r, r, k);
    expect(out.solved).toBe(false);
    expect(out.objects).toBe(r);
    const d = diagnose(r, k);
    expect(d.solved).toBe(false);
    expect(d.conflicting).toContain('K8');
    expect(d.states.K8).toBe('conflit');
  });

  it('référence perdue (sommets renumérotés par une autre opération) : à réparer, jamais réattribuée', () => {
    const r = skewed();
    const edited = { ...r, points: [0, 0, 500, 0, ...r.points.slice(2)] }; // un sommet de plus, identifiants périmés
    const d = diagnose([edited], rectConstraints());
    expect(Object.values(d.states).every(s => s === 'à réparer')).toBe(true);
    // Rien n'est déplacé.
    expect(enforceConstraints([r], [edited], rectConstraints()).objects[0]).toBe(edited);
  });

  it('lignes et cercle : coïncidence, perpendicularité, tangence, rayon', () => {
    const objs: CadObject[] = [
      { ...base, id: 'L1', name: 'L1', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 3 },
      { ...base, id: 'L2', name: 'L2', kind: 'line', x1: 102, y1: 1, x2: 105, y2: 80 },
      { ...base, id: 'C1', name: 'C1', kind: 'circle', cx: 50, cy: 30, r: 20 },
    ] as CadObject[];
    const k: GeoConstraint[] = [
      { id: 'A', type: 'fixed', p: { obj: 'L1', at: 'a' }, x: 0, y: 0 },
      { id: 'B', type: 'horizontal', seg: { obj: 'L1' } },
      { id: 'C', type: 'coincident', a: { obj: 'L1', at: 'b' }, b: { obj: 'L2', at: 'a' } },
      { id: 'D', type: 'perpendicular', s1: { obj: 'L1' }, s2: { obj: 'L2' } },
      { id: 'E', type: 'radius', curve: { obj: 'C1' }, value: 25 },
      { id: 'F', type: 'tangent', seg: { obj: 'L1' }, curve: { obj: 'C1' } },
    ];
    const out = enforceConstraints(objs, objs, k);
    expect(out.solved).toBe(true);
    const [l1, l2, c] = out.objects as [CadObject & { x1: number; y1: number; x2: number; y2: number }, CadObject & { x1: number; y1: number; x2: number; y2: number }, CadObject & { cx: number; cy: number; r: number }];
    expect(l1.y1).toBeCloseTo(0, 6); expect(l1.y2).toBeCloseTo(0, 6);
    expect(l2.x1).toBeCloseTo(l1.x2, 6); expect(l2.y1).toBeCloseTo(l1.y2, 6);
    expect(l2.x2).toBeCloseTo(l2.x1, 6);
    expect(c.r).toBeCloseTo(25, 6);
    expect(Math.abs(c.cy)).toBeCloseTo(25, 6);
  });

  it('désignation : sommet, puis segment, puis cercle ; polyligne munie d’identifiants à enregistrer', () => {
    const r = poly([0, 0, 1000, 0, 1000, 500, 0, 500, 0, 0]);
    const circle = { ...base, id: 'C1', name: 'C1', kind: 'circle', cx: 3000, cy: 0, r: 200 } as CadObject;
    const assigned = new Map<string, PolylineObj>();
    expect(pickElement([r, circle], { x: 998, y: 3 }, 10, assigned)).toMatchObject({ type: 'point', ref: { obj: 'OBJ-0001', at: 'v:v2' } });
    expect(assigned.get('OBJ-0001')?.vids).toEqual(['v1', 'v2', 'v3', 'v4', 'v1']);
    expect(pickElement([r, circle], { x: 500, y: 498 }, 10)).toMatchObject({ type: 'seg', ref: { obj: 'OBJ-0001', from: 'v3' } });
    expect(pickElement([r, circle], { x: 3000, y: 205 }, 10)).toMatchObject({ type: 'curve', ref: { obj: 'C1' } });
    expect(pickElement([r, circle], { x: 2000, y: 2000 }, 10)).toBeNull();
  });

  it('création : la valeur par défaut est la mesure actuelle ; désignation incomplète refusée', () => {
    const r = withVertexIds(poly([0, 0, 1000, 0, 1000, 500, 0, 500, 0, 0]));
    const seg = pickElement([r], { x: 500, y: 1 }, 10)!;
    expect(makeConstraint('K1', 'length', [seg], [r])).toMatchObject({ type: 'length', value: 1000 });
    expect(makeConstraint('K1', 'length', [seg], [r], 1200)).toMatchObject({ value: 1200 });
    expect(makeConstraint('K1', 'parallel', [seg], [r])).toEqual({ error: 'Parallèle : désignez un segment puis un segment.' });
    expect(makeConstraint('K1', 'equal', [seg, seg], [r])).toEqual({ error: 'Égalité de longueur : désignez deux segments différents.' });
  });

  it('lecture des références, ancrages des symboles, suppression d’un objet visé', () => {
    const r = withVertexIds(poly([0, 0, 1000, 0, 1000, 500, 0, 500, 0, 0]));
    expect(pointOf([r], { obj: 'OBJ-0001', at: 'v:v3' })).toEqual({ x: 1000, y: 500 });
    expect(segOf([r], { obj: 'OBJ-0001', from: 'v4' })?.slice(0, 2)).toEqual([{ x: 0, y: 500 }, { x: 0, y: 0 }]);
    expect(constraintAnchors([r], rectConstraints()[0])).toEqual([{ x: 500, y: 0 }]);
    expect(pruneConstraints([], rectConstraints())).toEqual([]);
    const k = rectConstraints();
    expect(pruneConstraints([r], k)).toBe(k);
    expect(buildSketch([r], k).sketch.points).toHaveLength(4);
  });
});

describe('contraintes enregistrées (lot 12.1)', async () => {
  const { normalizeConstraints } = await import('@/store/project');
  it('relecture : formes reconnues gardées, entrées abîmées écartées', () => {
    const ok = rectConstraints();
    expect(normalizeConstraints(ok)).toEqual(ok);
    expect(normalizeConstraints([...ok, { id: 'X', type: 'inconnu', seg: { obj: 'A' } }, { id: 'Y', type: 'length', seg: { obj: 'A' }, value: -3 }, { id: 'Z', type: 'horizontal', seg: 'A' }, null])).toEqual(ok);
    expect(normalizeConstraints('rien')).toBeUndefined();
    expect(normalizeConstraints([])).toBeUndefined();
  });
});
