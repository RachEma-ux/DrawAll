// Lot 15.2 : volumes de référence des solides construits par l'atelier, calculés par OCCT et comparés
// aux formules (aire × hauteur, Pappus-Guldin, perçages), à 10⁻⁶ près en relatif.
import { describe, expect, it } from 'vitest';
import { loadKernel } from './occt';
import { meshVolume, type PathSeg, type SolidRecipe, type SweepProfile } from './recipe';
import { extrudeRecipe, holeRecipe, moveSolid, pathLength, pathOf, recipeBounds, revolveRecipe, sweepProfileOf, sweepRecipe } from '../solids';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const take = (r: { recipe: SolidRecipe } | { error: string }) => { if ('error' in r) throw new Error(r.error); return r.recipe; };
const sq = (x: number, y: number, w: number, h: number) => ({ kind: 'polygon' as const, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as [number, number][] });

describe('solides du noyau (lot 15.2) : volumes de référence', async () => {
  const k = await loadKernel();
  const expectVolume = (r: SolidRecipe, v: number) => expect(rel(k.volume(r), v)).toBeLessThan(1e-6);

  it('extrusion : profil en L sur 250 mm depuis la cote 100 ; cercle en cylindre', () => {
    const L = take(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [600, 0], [600, 100], [100, 100], [100, 400], [0, 400]] }, 250, 100));
    expectVolume(L, (600 * 100 + 100 * 300) * 250);
    expect(recipeBounds(L)).toEqual({ min: [0, 0, 100], max: [600, 400, 350] });
    expectVolume(take(extrudeRecipe({ kind: 'circle', cx: 50, cy: 50, r: 40 }, 300)), Math.PI * 1600 * 300);
  });

  it('révolution autour d’un axe du plan : tube (Pappus), quart de tour', () => {
    // Rectangle de 1 000 × 200 à 100 mm de l'axe X : couronne R 100 à 300 sur 1 000 mm.
    const tube = take(revolveRecipe(sq(0, 100, 1000, 200), { x: 0, y: 0 }, { x: 1000, y: 0 }, 360));
    expectVolume(tube, Math.PI * (300 ** 2 - 100 ** 2) * 1000);
    expectVolume(take(revolveRecipe(sq(0, 100, 1000, 200), { x: 0, y: 0 }, { x: 1000, y: 0 }, 90)), (Math.PI * (300 ** 2 - 100 ** 2) * 1000) / 4);
    // Axe oblique : volume = aire × 2π × distance du centre de gravité à l'axe.
    const tri = { kind: 'polygon' as const, points: [[300, 0], [500, 0], [400, 150]] as [number, number][] };
    const axis = [{ x: 0, y: 0 }, { x: 1, y: 1 }] as const;
    const gx = 400, gy = 50, d = Math.abs(gy - gx) / Math.SQRT2;
    expectVolume(take(revolveRecipe(tri, axis[0], axis[1], 360)), ((200 * 150) / 2) * 2 * Math.PI * d);
  });

  it('booléens : union, différence, intersection de deux extrusions qui se chevauchent', () => {
    const a = take(extrudeRecipe(sq(0, 0, 100, 100), 50)), b = take(extrudeRecipe(sq(50, 50, 100, 100), 50));
    expectVolume({ op: 'union', a, b }, (10000 + 10000 - 2500) * 50);
    expectVolume({ op: 'cut', a, b }, (10000 - 2500) * 50);
    expectVolume({ op: 'intersect', a, b }, 2500 * 50);
  });

  it('perçage : traversant, borgne, sur un solide déplacé', () => {
    const block = take(extrudeRecipe(sq(0, 0, 100, 50), 20));
    expectVolume(take(holeRecipe(block, 50, 25, 20)), 100000 - Math.PI * 100 * 20);
    expectVolume(take(holeRecipe(block, 50, 25, 20, 5)), 100000 - Math.PI * 100 * 5);
    const moved = moveSolid(block, 1000, 2000);
    expectVolume(take(holeRecipe(moved, 1050, 2025, 20)), 100000 - Math.PI * 100 * 20);
  });

  it('transformations : volume conservé (échelle : k³), position conforme à l’encombrement calculé', () => {
    const e = take(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [300, 0], [300, 100], [0, 100]] }, 50, 10));
    for (const r of [
      { op: 'translate', of: e, by: [100, -50, 5] },
      { op: 'rotate', of: e, angle: 30, about: [100, 100] },
      { op: 'mirror', of: e, axis: 'x', value: -200 },
      { op: 'mirror', of: e, axis: 'y', value: 400 },
    ] as SolidRecipe[]) {
      expectVolume(r, 300 * 100 * 50);
      // Le maillage du noyau tient dans l'encombrement calculé sans lui (et l'atteint pour les isométries d'axe).
      const m = k.mesh(r, 0.1), b = recipeBounds(r);
      for (let i = 0; i < 3; i++) {
        const xs = m.vertices.filter((_, j) => j % 3 === i);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(b.min[i] - 1e-6);
        expect(Math.max(...xs)).toBeLessThanOrEqual(b.max[i] + 1e-6);
      }
      expect(rel(meshVolume(m), 300 * 100 * 50)).toBeLessThan(1e-6);
    }
    expectVolume({ op: 'scale', of: e, factor: 2, about: [0, 0, 0] }, 300 * 100 * 50 * 8);
  });

  it('références : une face nommée reste résolue après déplacement et rotation du solide', () => {
    const named: SolidRecipe = { op: 'box', x: 100, y: 50, z: 20, name: 'P' };
    for (const of of [{ op: 'translate', of: named, by: [500, 300, 10] }, { op: 'rotate', of: named, angle: 37, about: [10, 20] }, { op: 'mirror', of: named, axis: 'y', value: 7 }] as SolidRecipe[]) {
      const shell: SolidRecipe = { op: 'shell', of, thickness: 2, open: { feature: 'P', role: 'zmax' } };
      expect(k.references(shell).map(r => r.status)).toEqual(['conservée']);
      expectVolume(shell, 100 * 50 * 20 - 96 * 46 * 18);
    }
  });
});

describe('balayage et Follow Me (lot 15.3) : volume = aire du profil × longueur du trajet', async () => {
  const k = await loadKernel();
  const v = (r: SolidRecipe) => k.volume(r);
  const prof = sweepProfileOf(sq(0, 0, 100, 50)); // 100 × 50, centré sur le trajet, base à la cote
  const A = 5000;
  const sweepOf = (path: PathSeg[], profile: SweepProfile = prof, z = 0): SolidRecipe => ({ ...take(sweepRecipe(sq(0, 0, 100, 50), path, z)), profile } as SolidRecipe);

  it('droite, quart de cercle, polyligne en L à angle vif, contour fermé', () => {
    const line: PathSeg[] = [{ kind: 'line', from: [0, 0], to: [1000, 0] }];
    expect(rel(v(sweepOf(line)), A * 1000)).toBeLessThan(1e-6);
    const arc: PathSeg[] = [{ kind: 'arc', from: [1000, 0], via: [1000 * Math.SQRT1_2, 1000 * Math.SQRT1_2], to: [0, 1000] }];
    expect(rel(pathLength(arc), (Math.PI / 2) * 1000)).toBeLessThan(1e-12);
    expect(rel(v(sweepOf(arc)), A * (Math.PI / 2) * 1000)).toBeLessThan(1e-6);
    const L: PathSeg[] = [{ kind: 'line', from: [0, 0], to: [1000, 0] }, { kind: 'line', from: [1000, 0], to: [1000, 500] }];
    expect(rel(v(sweepOf(L)), A * 1500)).toBeLessThan(1e-6);
    const ring: PathSeg[] = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]].map((p, i, a) => ({ kind: 'line', from: p as [number, number], to: a[(i + 1) % 4] as [number, number] }));
    expect(rel(v(sweepOf(ring)), A * 4000)).toBeLessThan(1e-6);
  });

  it('profil circulaire (tube plein) ; cote du trajet', () => {
    const line: PathSeg[] = [{ kind: 'line', from: [0, 0], to: [0, 800] }];
    const tube = sweepOf(line, { r: 20, c: [0, 20] }, 300);
    expect(rel(v(tube), Math.PI * 400 * 800)).toBeLessThan(1e-6);
    const m = k.mesh(tube, 0.1), zs = m.vertices.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(300, 6);
    expect(Math.max(...zs)).toBeCloseTo(340, 6);
  });

  it('profil décalé sur un arc : Pappus (centre de gravité à R − 50) ; u du côté (−t_y, t_x)', () => {
    const arc: PathSeg[] = [{ kind: 'arc', from: [1000, 0], via: [1000 * Math.SQRT1_2, 1000 * Math.SQRT1_2], to: [0, 1000] }];
    const r = { op: 'sweep', profile: [[0, 0], [100, 0], [100, 50], [0, 50]], path: arc } as SolidRecipe;
    expect(rel(v(r), A * (Math.PI / 2) * 950)).toBeLessThan(1e-6);
  });

  it('spline : longueur du trajet retrouvée', () => {
    const spline = { id: 'S', name: 'S', kind: 'spline', classification: 'non-classifie', layerId: 'L', hatch: 'none', createdSeq: 0, points: [0, 0, 300, 400, 700, -200, 1000, 0], degree: 3 } as const;
    const p = pathOf(spline as never);
    if ('error' in p) throw new Error(p.error);
    expect(rel(pathLength(p.path), p.length)).toBeLessThan(1e-6);
    expect(rel(v(sweepOf(p.path, { r: 20, c: [0, 20] })), Math.PI * 400 * p.length)).toBeLessThan(1e-5);
  });
});
