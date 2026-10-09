import { describe, expect, it } from 'vitest';
import type { BeamObj, CadObject, ColumnObj, Level, RoofObj, SlabObj, WallObj } from '@/types/cad';
import { building3d, meshVolume3, p95, prism, storeyHeight, triangulate } from './building3d';
import { roofGeometry, roofInput } from './roof';

const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const wall = (p: Partial<WallObj> = {}): WallObj => ({ ...base, id: 'OBJ-0001', name: 'M', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe', ...p });
const levels: Level[] = [{ id: 'NIV-0001', name: 'RDC', elevation: 0 }, { id: 'NIV-0002', name: 'R+1', elevation: 2700 }];
const polyArea = (pts: { x: number; y: number }[], tris: [number, number, number][]) =>
  tris.reduce((s, [a, b, c]) => s + Math.abs((pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) - (pts[b].y - pts[a].y) * (pts[c].x - pts[a].x)) / 2, 0);

describe('vue 3D : solides dérivés du plan (lot 15.1)', () => {
  it('triangulation par oreilles : L concave, sens indifférent, surface conservée', () => {
    const L = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 5000 }, { x: 0, y: 5000 }];
    const t = triangulate(L);
    expect(t).toHaveLength(4);
    expect(polyArea(L, t)).toBe(18e6);
    const R = [...L].reverse();
    expect(polyArea(R, triangulate(R))).toBe(18e6);
    expect(triangulate(L.slice(0, 2))).toEqual([]);
  });

  it('prisme : volume = surface × hauteur, faces vers l\'extérieur dans les deux sens de parcours', () => {
    const sq = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 2000 }, { x: 0, y: 2000 }];
    expect(meshVolume3(prism('a', 'slab', sq, 0, 300))).toBeCloseTo(1000 * 2000 * 300, 3);
    expect(meshVolume3(prism('a', 'slab', [...sq].reverse(), 0, 300))).toBeCloseTo(1000 * 2000 * 300, 3);
    // 2 faces × 2 triangles + 4 côtés × 2 triangles.
    expect(prism('a', 'slab', sq, 0, 300).indices).toHaveLength(12 * 3);
  });

  it('hauteur d\'étage : jusqu\'au niveau suivant, sinon inconnue', () => {
    expect(storeyHeight(levels, 'NIV-0001')).toBe(2700);
    expect(storeyHeight(levels, 'NIV-0002')).toBeNull();
    expect(storeyHeight(levels, 'NIV-9999')).toBeNull();
  });

  it('mur : longueur × épaisseur × hauteur saisie, sinon hauteur d\'étage ; non montré sans hauteur', () => {
    const own = building3d([wall({ height: 2500 })], undefined);
    expect(own.meshes).toHaveLength(1);
    expect(meshVolume3(own.meshes[0])).toBeCloseTo(5000 * 200 * 2500, 3);
    const storey = building3d([wall()], levels);
    expect(meshVolume3(storey.meshes[0])).toBeCloseTo(5000 * 200 * 2700, 3);
    const none = building3d([wall()], undefined);
    expect(none.meshes).toEqual([]);
    expect(none.skipped).toEqual([{ id: 'OBJ-0001', reason: 'hauteur non saisie et pas de niveau au-dessus' }]);
    // Mur d'étage : posé à l'altitude de son niveau.
    const up = building3d([wall({ height: 1000, levelId: 'NIV-0002' })], levels).meshes[0];
    const ys = up.positions.filter((_, i) => i % 3 === 1);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([2700, 3700]);
  });

  it('dalle : surface × épaisseur, sous le niveau ; poteau et poutre', () => {
    const slab: SlabObj = { ...base, id: 'OBJ-0002', name: 'D', kind: 'slab', points: [0, 0, 6000, 0, 6000, 2000, 2000, 2000, 2000, 5000, 0, 5000], thickness: 200 };
    const s = building3d([slab], undefined).meshes[0];
    expect(meshVolume3(s)).toBeCloseTo(18e6 * 200, 1);
    expect(Math.max(...s.positions.filter((_, i) => i % 3 === 1))).toBe(0);
    const col: ColumnObj = { ...base, id: 'OBJ-0003', name: 'P', kind: 'column', x: 0, y: 0, section: 'rect', b: 300, h: 400 };
    expect(meshVolume3(building3d([col], levels).meshes[0])).toBeCloseTo(300 * 400 * 2700, 3);
    const round: ColumnObj = { ...col, section: 'circle', b: undefined, h: undefined, d: 400, height: 3000 };
    // Polygone à 32 côtés inscrit : (n/2) r² sin(2π/n) × H.
    expect(meshVolume3(building3d([round], undefined).meshes[0])).toBeCloseTo(16 * 200 * 200 * Math.sin(Math.PI / 16) * 3000, 1);
    const beam: BeamObj = { ...base, id: 'OBJ-0004', name: 'B', kind: 'beam', x1: 0, y1: 0, x2: 4000, y2: 0, b: 200, h: 500 };
    const bm = building3d([beam], levels).meshes[0];
    expect(meshVolume3(bm)).toBeCloseTo(4000 * 200 * 500, 3);
    const ys = bm.positions.filter((_, i) => i % 3 === 1);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([2200, 2700]);
    expect(building3d([beam], undefined).skipped[0].reason).toBe('pas de niveau au-dessus pour placer la poutre');
  });

  it('toiture : égout à la hauteur d\'étage ou du plus haut mur saisi, faîtage à la hauteur calculée', () => {
    const roof: RoofObj = { ...base, id: 'OBJ-0005', name: 'T', kind: 'roof', x: 0, y: 0, w: 10000, h: 8000, roofType: 'deux-pans', pitch: 35, overhang: 0, axis: 'x' };
    const ridge = roofGeometry(roofInput(roof)).ridgeHeight;
    const ys = (m: { positions: number[] }) => m.positions.filter((_, i) => i % 3 === 1);
    const a = building3d([roof], levels).meshes[0];
    expect(Math.min(...ys(a))).toBe(2700);
    expect(Math.max(...ys(a))).toBeCloseTo(2700 + ridge, 6);
    const b = building3d([roof, wall({ height: 2500 }), wall({ id: 'OBJ-0009', height: 2800 })] as CadObject[], undefined).meshes.find(m => m.kind === 'roof')!;
    expect(Math.min(...ys(b))).toBe(2800);
    expect(building3d([roof], undefined).skipped[0]).toEqual({ id: 'OBJ-0005', reason: 'hauteur des murs non saisie : égout indéterminé' });
    // Quatre pans à 45° sur 10 × 8 m : sommet à 4 m au-dessus de l'égout ; 4 pans (2 trapèzes, 2 triangles).
    const hip = building3d([{ ...roof, roofType: 'quatre-pans', pitch: 45 }], levels).meshes[0];
    expect(Math.max(...ys(hip))).toBeCloseTo(2700 + 4000, 6);
    expect(hip.indices).toHaveLength((2 + 2 + 1 + 1) * 3);
  });

  it('objets sans volume (lignes, textes) ignorés sans être signalés', () => {
    const line = { ...base, id: 'OBJ-0010', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 } as CadObject;
    expect(building3d([line], levels)).toEqual({ meshes: [], skipped: [] });
  });

  it('temps de trame : 95e centile', () => {
    expect(p95([])).toBeNull();
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95);
    expect(p95([3, 1, 2])).toBe(3);
  });
});

describe('relecture 47e passe : niveaux de même altitude', () => {
  it('hauteur d’étage : jusqu’au niveau strictement plus haut, jamais nulle', () => {
    const lv: Level[] = [{ id: 'A', name: 'A', elevation: 0 }, { id: 'B', name: 'B', elevation: 0 }, { id: 'C', name: 'C', elevation: 2700 }];
    expect(storeyHeight(lv, 'A')).toBe(2700);
    expect(storeyHeight(lv, 'B')).toBe(2700);
    expect(storeyHeight(lv, 'C')).toBeNull();
  });
});
