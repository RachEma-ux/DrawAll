// Lot 15.2 : volumes de référence des solides construits par l'atelier, calculés par OCCT et comparés
// aux formules (aire × hauteur, Pappus-Guldin, perçages), à 10⁻⁶ près en relatif.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadKernel } from './occt';
import { cameraLooking, meshVolume, type PathSeg, type SolidRecipe, type SweepProfile } from './recipe';
import { buildingRecipe } from '../building3d';
import { AP242_ED3, AP242_SUBSET, declaredSchema, entityTypes } from './step-ap242';
import { extrudeRecipe, faceChoices, holeRecipe, loftCheckPoints, occurrenceRecipe, pushPullRecipe, shellRecipe, loftRecipe, moveSolid, pathLength, pathOf, recipeBounds, revolveRecipe, sweepProfileOf, sweepRecipe } from '../solids';

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

describe('vues projetées (lot 16.1) : arêtes vues et cachées du noyau', async () => {
  const k = await loadKernel();
  const norm = (lines: number[][]) => lines.map(l => (l[0] > l[2] || (l[0] === l[2] && l[1] > l[3]) ? [l[2], l[3], l[0], l[1]] : l)).map(l => l.join(' ')).sort();
  const drilled: SolidRecipe = { op: 'cut', a: { op: 'box', x: 100, y: 50, z: 20 }, b: { op: 'cylinder', r: 10, h: 40, at: [50, 25, -10] } };

  it('pavé percé : dessus (cercle vu, rien de caché), face et côté (perçage en interrompu)', () => {
    const top = k.project(drilled, 'dessus');
    expect(top.hidden).toEqual([]);
    expect(top.visible.filter(l => l.length === 4)).toHaveLength(4);
    const circle = top.visible.find(l => l.length > 4)!;
    for (let i = 0; i < circle.length; i += 2) expect(Math.hypot(circle[i] - 50, circle[i + 1] - 25)).toBeCloseTo(10, 6);
    const face = k.project(drilled, 'face');
    expect(norm(face.visible)).toEqual(norm([[0, 0, 0, -20], [100, 0, 100, -20], [0, 0, 100, 0], [0, -20, 100, -20]]));
    expect(norm(face.hidden)).toEqual(norm([[40, 0, 40, -20], [60, 0, 60, -20]]));
    const side = k.project(drilled, 'cote');
    expect(norm(side.visible)).toEqual(norm([[-50, 0, -50, -20], [0, 0, 0, -20], [-50, 0, 0, 0], [-50, -20, 0, -20]]));
    expect(norm(side.hidden)).toEqual(norm([[-35, 0, -35, -20], [-15, 0, -15, -20]]));
  });

  it('la vue suit le solide : dessus tiré de 30 mm, la vue de face passe à 50 mm de haut', () => {
    const block = take(extrudeRecipe(sq(0, 0, 100, 50), 20, 0, 'P'));
    const ys = (r: SolidRecipe) => k.project(r, 'face').visible.flatMap(l => l.filter((_, i) => i % 2 === 1));
    expect(Math.min(...ys(block))).toBeCloseTo(-20, 9);
    expect(Math.min(...ys(take(pushPullRecipe(block, { feature: 'P', role: 'top' }, 30))))).toBeCloseTo(-50, 9);
  });
});

describe('façades et coupes de bâtiment (lot 16.2)', async () => {
  const k = await loadKernel();
  const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
  const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ ...base, id, name: id, kind: 'wall' as const, x1, y1, x2, y2, thickness: 200, justification: 'axe' as const, height: 2500 });
  const walls = [wall('M1', 0, 0, 5000, 0), wall('M2', 5000, 0, 5000, 4000), wall('M3', 5000, 4000, 0, 4000), wall('M4', 0, 4000, 0, 0)];
  const { recipe } = buildingRecipe(walls, undefined);
  const xs = (p: { visible: number[][] }) => p.visible.flatMap(l => l.filter((_, i) => i % 2 === 0));
  const ys = (p: { visible: number[][] }) => p.visible.flatMap(l => l.filter((_, i) => i % 2 === 1));
  const vertical = (p: { visible: number[][] }, x: number) => p.visible.some(l => l.length === 4 && Math.abs(l[0] - x) < 1e-6 && Math.abs(l[2] - x) < 1e-6 && Math.abs(Math.abs(l[1] - l[3]) - 2500) < 1e-6);

  it('caméras : regard horizontal ; face = façade sud, côté = façade est', () => {
    expect(cameraLooking([0, -1])).toEqual({ dir: [-0, 1, 0], xAxis: [1, 0, 0] });
    expect(cameraLooking([-1, 0])).toEqual({ dir: [1, -0, 0], xAxis: [-0, -1, 0] });
  });

  it('façade sud : nu extérieur de −100 à 5 100, hauteur 2 500 ; les faces intérieures ne se voient pas', () => {
    const p = k.projectCamera(recipe!, cameraLooking([0, -1]));
    expect([Math.min(...xs(p)), Math.max(...xs(p))]).toEqual([-100, 5100]);
    expect([Math.min(...ys(p)), Math.max(...ys(p))]).toEqual([-2500, 0]);
    expect(vertical(p, 100)).toBe(false);
  });

  it('coupe horizontale à y = 2 000, vers le nord : murs coupés (nus intérieurs à 100 et 4 900) et mur du fond', () => {
    const p = k.projectCamera(recipe!, cameraLooking([0, -1]), { point: [-1000, 2000], look: [0, -1] });
    expect(vertical(p, 100)).toBe(true);
    expect(vertical(p, 4900)).toBe(true);
    expect([Math.min(...xs(p)), Math.max(...xs(p))]).toEqual([-100, 5100]);
    // Plan de coupe hors du bâtiment : refusé en clair.
    expect(() => k.projectCamera(recipe!, cameraLooking([0, -1]), { point: [0, 9000], look: [0, 1] })).toThrow('Coupe : le plan ne traverse pas le bâtiment.');
  });
});

describe('pièces et occurrences (lot 16.3) : la forme suit la pièce type', async () => {
  const k = await loadKernel();
  const base = { classification: 'non-classifie' as const, layerId: 'L', hatch: 'none' as const, createdSeq: 0 };
  const recipe = take(extrudeRecipe(sq(1000, 2000, 300, 100), 50, 0, 'OBJ-0001'));
  const def = { ...base, id: 'OBJ-0001', name: 'P', kind: 'solid' as const, recipe, partDef: { no: 1, origin: [1000, 2000, 0] as [number, number, number], angle: 0 } };
  const occ = { ...base, id: 'OBJ-0002', name: 'O', kind: 'occurrence' as const, sourceId: 'OBJ-0001', x: -500, y: 300, z: 1000, angle: 30 };

  it('même volume, posée et tournée ; modifier la pièce type modifie l’occurrence', () => {
    const r = occurrenceRecipe(occ, def)!;
    expect(rel(k.volume(r), 300 * 100 * 50)).toBeLessThan(1e-6);
    const m = k.mesh(r, 0.1), zs = m.vertices.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(1000, 6);
    // Point de base de l'occurrence = coin de la pièce : un sommet du maillage y est.
    expect(m.vertices.some((_, i) => i % 3 === 0 && Math.abs(m.vertices[i] + 500) < 1e-6 && Math.abs(m.vertices[i + 1] - 300) < 1e-6)).toBe(true);
    const drilled = { ...def, recipe: take(holeRecipe(recipe, 1150, 2050, 40)) };
    expect(rel(k.volume(occurrenceRecipe(occ, drilled)!), 300 * 100 * 50 - Math.PI * 400 * 50)).toBeLessThan(1e-6);
  });
});

describe('STEP AP242 édition 3 (lot 17.2) : export, relecture, import en recettes', async () => {
  const k = await loadKernel();
  const parts: { name: string; recipe: SolidRecipe }[] = [
    { name: 'Pavé percé', recipe: take(holeRecipe(take(extrudeRecipe(sq(0, 0, 100, 50), 20)), 50, 25, 20)) },
    { name: 'Axe Ø 40', recipe: { op: 'cylinder', r: 20, h: 200, at: [300, 0, 0] } },
    { name: 'Tube', recipe: take(revolveRecipe(sq(0, 100, 1000, 200), { x: 0, y: 0 }, { x: 1000, y: 0 }, 360)) },
  ];
  const volumes = parts.map(p => k.volume(p.recipe));
  const out = k.exportStep(parts, 'solides.step', new Date('2026-10-08T12:00:00Z'));

  it('barre oblique inverse d’un nom de pièce : doublée une seule fois, par le noyau (aucun second doublement)', () => {
    const one = k.exportStep([{ name: 'A\\B', recipe: { op: 'box', x: 1, y: 1, z: 1 } }], 'f.step', new Date(0));
    if ('error' in one) throw new Error(one.error);
    expect(one.content).toContain("PRODUCT('A\\\\B',");
    expect(one.content).not.toContain("'A\\\\\\\\B'");
  });

  it('en-tête de l’édition 3, sous-ensemble B-rep vérifié, noms des pièces', () => {
    if ('error' in out) throw new Error(out.error);
    expect(declaredSchema(out.content)).toBe(AP242_ED3);
    expect(out.content).not.toMatch(/442 1 1 4/);
    expect(out.content).toContain("'ap242_managed_model_based_3d_engineering',2022,");
    expect([...entityTypes(out.content)].every(t => AP242_SUBSET.has(t))).toBe(true);
    expect(out.content).toContain("PRODUCT('Axe \\X2\\00D8\\X0\\ 40'");
  });

  it('réimport : mêmes volumes à 10⁻⁶ près ; recettes « step » reconstruites, encombrement relevé', () => {
    if ('error' in out) throw new Error(out.error);
    const r = k.importStep(out.content, true);
    expect(r.losses).toEqual([]);
    expect(r.status).toBe('importé');
    expect(r.solids).toHaveLength(3);
    const got = r.solids.map(s => s.volume).sort((a, b) => a - b), want = [...volumes].sort((a, b) => a - b);
    got.forEach((v, i) => expect(rel(v, want[i])).toBeLessThan(1e-6));
    for (const s of r.solids) {
      const rec = s.recipe!;
      expect(declaredSchema(rec.data)).toBe(AP242_ED3);
      expect(rel(k.volume(rec), s.volume)).toBeLessThan(1e-6);
      expect(rec.trace.length).toBeGreaterThan(0);
      // Recette importée déplacée : le volume ne change pas.
      expect(rel(k.volume({ op: 'translate', of: rec, by: [1000, 0, 0] }), s.volume)).toBeLessThan(1e-6);
    }
    const axe = r.solids.find(s => Math.abs(s.volume - Math.PI * 400 * 200) < 1)!.recipe!;
    expect(axe.bounds.min.map(v => Math.round(v))).toEqual([280, -20, 0]);
    expect(axe.bounds.max.map(v => Math.round(v))).toEqual([320, 20, 200]);
  });

  it('fichier de référence écrit pour le lecteur tiers (STEP_FIXTURES_DIR)', () => {
    const dir = process.env.STEP_FIXTURES_DIR;
    if (!dir || 'error' in out) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'solides.step'), out.content);
    writeFileSync(join(dir, 'solides.step.expected.json'), JSON.stringify({ schema: AP242_ED3, volumes: [...volumes].sort((a, b) => a - b) }, null, 2));
  });
});
