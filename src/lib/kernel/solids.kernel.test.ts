// Lot 15.2 : volumes de référence des solides construits par l'atelier, calculés par OCCT et comparés
// aux formules (aire × hauteur, Pappus-Guldin, perçages), à 10⁻⁶ près en relatif.
import { describe, expect, it } from 'vitest';
import { loadKernel } from './occt';
import { meshVolume, type PathSeg, type SolidRecipe, type SweepProfile } from './recipe';
import { extrudeRecipe, faceChoices, holeRecipe, loftCheckPoints, pushPullRecipe, shellRecipe, loftRecipe, moveSolid, pathLength, pathOf, recipeBounds, revolveRecipe, sweepProfileOf, sweepRecipe } from '../solids';

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

describe('lissage (lot 15.4) : sections retrouvées à 10⁻⁶ mm, volumes de référence', async () => {
  const k = await loadKernel();
  const square = (c: number, half: number) => ({ kind: 'polygon' as const, points: [[c - half, c - half], [c + half, c - half], [c + half, c + half], [c - half, c + half]] as [number, number][] });

  it('tronc de pyramide réglé : volume h/3 (A1 + A2 + √(A1·A2)) ; sections retrouvées', () => {
    const r = take(loftRecipe([square(0, 500), square(0, 250)], [0, 1000], true));
    expect(rel(k.volume(r), (1000 / 3) * (1e6 + 0.25e6 + 0.5e6))).toBeLessThan(1e-6);
    if (r.op !== 'loft') throw new Error();
    expect(k.boundaryDeviation(r, loftCheckPoints(r.sections))).toBeLessThan(1e-6);
  });

  it('trois sections réglées (carré, carré décalé, cercle) : chaque section retrouvée, volume = somme des troncs', () => {
    const r = take(loftRecipe([square(0, 500), square(0, 250), { kind: 'circle', cx: 0, cy: 0, r: 300 }], [0, 1000, 2500], true));
    if (r.op !== 'loft') throw new Error();
    expect(k.boundaryDeviation(r, loftCheckPoints(r.sections))).toBeLessThan(1e-6);
    // Contrôle négatif : un point hors des sections est loin du bord.
    expect(k.boundaryDeviation(r, [[0, 0, 500]])).toBeGreaterThan(100);
    expect(k.volume(r)).toBeGreaterThan((1000 / 3) * (1e6 + 0.25e6 + 0.5e6));
  });

  it('lissage lisse entre deux cercles parallèles égaux : cylindre exact', () => {
    const c = { kind: 'circle' as const, cx: 100, cy: 200, r: 50 };
    const r = take(loftRecipe([c, c], [10, 410], false));
    expect(rel(k.volume(r), Math.PI * 2500 * 400)).toBeLessThan(1e-6);
    if (r.op !== 'loft') throw new Error();
    expect(k.boundaryDeviation(r, loftCheckPoints(r.sections))).toBeLessThan(1e-6);
  });
});

describe('coque (lot 15.5) : volume de matière de référence, faces ouvertes désignées', async () => {
  const k = await loadKernel();
  const block = take(extrudeRecipe(sq(0, 0, 1000, 500), 300, 0, 'P'));
  const full = 1000 * 500 * 300;

  it('dessus ouvert, épaisseur 20 : volume − cavité (960 × 460 × 280)', () => {
    expectVolumeOf(k.volume(take(shellRecipe(block, 20, [{ feature: 'P', role: 'top' }]))), full - 960 * 460 * 280);
  });

  it('dessus et un côté ouverts : la cavité traverse ce côté', () => {
    const choices = faceChoices(block);
    expect(choices.map(c => c.label)).toContain('P — côté 4 (0 ; 500) → (0 ; 0)');
    const side = choices.find(c => c.label.startsWith('P — côté 4'))!.ref;
    expectVolumeOf(k.volume(take(shellRecipe(block, 20, [{ feature: 'P', role: 'top' }, side]))), full - 980 * 460 * 280);
  });

  it('solide déplacé puis tourné : les faces désignées suivent', () => {
    const moved: SolidRecipe = { op: 'rotate', of: moveSolid(block, 5000, -2000), angle: 30, about: [0, 0] };
    expect(faceChoices(moved)).toHaveLength(6);
    expectVolumeOf(k.volume(take(shellRecipe(moved, 20, [{ feature: 'P', role: 'top' }, { feature: 'P', role: 'bottom' }]))), full - 960 * 460 * 300);
  });

  it('face inexistante : référence à réparer, rien n’est appliqué', () => {
    expect(() => k.volume(take(shellRecipe(block, 20, [{ feature: 'Q', role: 'top' }])))).toThrow(/Référence à réparer/);
  });

  function expectVolumeOf(v: number, ref: number) { expect(rel(v, ref)).toBeLessThan(1e-6); }
});

describe('pousser / tirer (lot 15.6) : volume après modification, références suivies', async () => {
  const k = await loadKernel();
  const block = take(extrudeRecipe(sq(0, 0, 1000, 500), 300, 0, 'P'));
  const top = { feature: 'P', role: 'top' };

  it('tirer le dessus de 100, pousser le dessus de 50', () => {
    expect(rel(k.volume(take(pushPullRecipe(block, top, 100))), 1000 * 500 * 400)).toBeLessThan(1e-6);
    expect(rel(k.volume(take(pushPullRecipe(block, top, -50))), 1000 * 500 * 250)).toBeLessThan(1e-6);
  });

  it('tirer un côté : la tranche est ajoutée ; encombrement et trace suivent', () => {
    const side = { feature: 'P', role: 'side:s0' }; // de (0 ; 0) à (1 000 ; 0), normale sortante −Y
    const r = take(pushPullRecipe(block, side, 200));
    expect(rel(k.volume(r), 1000 * 700 * 300)).toBeLessThan(1e-6);
    expect(recipeBounds(r)).toEqual({ min: [0, -200, 0], max: [1000, 500, 300] });
  });

  it('références suivies : après avoir tiré le dessus puis un côté, la coque ouvre le dessus déplacé', () => {
    const pulled = take(pushPullRecipe(take(pushPullRecipe(block, top, 100)), { feature: 'P', role: 'side:s1' }, 100));
    const shell = take(shellRecipe(pulled, 20, [top]));
    expect(k.references(shell).map(x => `${x.op} ${x.ref} ${x.status}`)).toEqual(['pousser / tirer P.top conservée', 'pousser / tirer P.side:s1 conservée', 'coque P.top conservée']);
    // Bloc final 1 100 × 500 × 400, coque de 20 ouverte en haut.
    expect(rel(k.volume(shell), 1100 * 500 * 400 - 1060 * 460 * 380)).toBeLessThan(1e-6);
    // Le côté tiré lui-même reste désignable après déplacement : on le pousse de nouveau.
    const back = take(pushPullRecipe(pulled, { feature: 'P', role: 'side:s1' }, -100));
    expect(rel(k.volume(back), 1000 * 500 * 400)).toBeLessThan(1e-6);
  });

  it('dessus d’un cylindre (disque) tiré ; distance nulle ou face inconnue refusées', () => {
    const cyl = take(extrudeRecipe({ kind: 'circle', cx: 0, cy: 0, r: 100 }, 200, 0, 'C'));
    expect(rel(k.volume(take(pushPullRecipe(cyl, { feature: 'C', role: 'cap' }, 50))), Math.PI * 1e4 * 250)).toBeLessThan(1e-6);
    expect(pushPullRecipe(block, top, 0)).toMatchObject({ error: expect.stringContaining('distance non nulle') });
    expect(pushPullRecipe(block, { feature: 'Q', role: 'top' }, 10)).toEqual({ error: 'Pousser / tirer : fonction « Q » absente de la recette.' });
    expect(pushPullRecipe(cyl, { feature: 'C', role: 'wall' }, 10)).toEqual({ error: 'Pousser / tirer : face plane attendue.' });
  });
});
