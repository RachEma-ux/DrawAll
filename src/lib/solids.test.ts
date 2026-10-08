import { describe, expect, it } from 'vitest';
import type { CadObject, SolidObj } from '@/types/cad';
import { createDefaultLayers, dimensionOf } from '@/types/cad';
import { exportDxf, exportToDxf } from './dxf';
import { mirrorObject, moveObject, objectBounds, rotateObject, scaleObject } from './geometry';
import { defaultIfcClass } from './properties';
import { contourOf, extrudeRecipe, faceChoices, shellRecipe, loftCheckPoints, loftRecipe, parseLevels, holeRecipe, isRecipe, moveSolid, pathLength, pathOf, pathPoints, recipeBounds, recipeSteps, revolveRecipe, solidPrimitives, solidTrace, sweepProfileOf, sweepRecipe } from './solids';
import { stretchObject, stretchPreview } from './stretch';
import type { PathSeg, SolidRecipe } from './kernel/recipe';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const rect = (x: number, y: number, w: number, h: number) => ({ ...base, id: 'OBJ-0001', name: 'R', kind: 'rect', x, y, w, h }) as CadObject;
const poly = (points: number[]) => ({ ...base, id: 'OBJ-0002', name: 'P', kind: 'polyline', points }) as CadObject;
const solid = (recipe: SolidRecipe): SolidObj => ({ ...base, id: 'OBJ-0009', name: 'S', kind: 'solid', recipe });
const ok = (r: ReturnType<typeof extrudeRecipe>) => { if ('error' in r) throw new Error(r.error); return r.recipe; };

describe('solides : recettes (lot 15.2)', () => {
  it('contour fermé : rectangle, cercle, polyligne fermée ; refus en clair sinon', () => {
    expect(contourOf(rect(0, 0, 100, 50))).toEqual({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50], [0, 50]] });
    expect(contourOf({ ...base, id: 'C', name: 'C', kind: 'circle', cx: 5, cy: 6, r: 7 } as CadObject)).toEqual({ kind: 'circle', cx: 5, cy: 6, r: 7 });
    expect(contourOf(poly([0, 0, 10, 0, 10, 10, 0, 0]))).toEqual({ kind: 'polygon', points: [[0, 0], [10, 0], [10, 10]] });
    expect(contourOf(poly([0, 0, 10, 0, 10, 10]))).toEqual({ error: 'Polyligne ouverte : un contour fermé est attendu (dernier sommet sur le premier).' });
    expect(contourOf(poly([0, 0, 10, 10, 10, 0, 0, 10, 0, 0]))).toEqual({ error: 'Contour qui se recoupe : aucun solide.' });
    expect(contourOf(poly([0, 0, 10, 0, 20, 0, 0, 0]))).toEqual({ error: 'Contour d’aire nulle.' });
    expect('error' in contourOf({ ...base, id: 'L', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 } as CadObject)).toBe(true);
  });

  it('extrusion : polygone (cote de base), cercle en cylindre ; hauteur positive exigée', () => {
    const c = contourOf(rect(0, 0, 100, 50));
    if ('error' in c) throw new Error();
    expect(extrudeRecipe(c, 30, 10)).toEqual({ recipe: { op: 'extrude', profile: [[0, 0], [100, 0], [100, 50], [0, 50]], height: 30, z: 10 } });
    expect(extrudeRecipe({ kind: 'circle', cx: 1, cy: 2, r: 3 }, 4)).toEqual({ recipe: { op: 'cylinder', r: 3, h: 4, at: [1, 2, 0] } });
    expect(extrudeRecipe(c, 0)).toEqual({ error: 'Extrusion : hauteur positive attendue.' });
    expect(extrudeRecipe(c, Number.NaN)).toMatchObject({ error: expect.any(String) });
  });

  it('révolution : axe du plan, contour d’un seul côté, angle de 0 à 360°', () => {
    const c = contourOf(rect(0, 100, 1000, 200));
    if ('error' in c || c.kind !== 'polygon') throw new Error();
    expect(revolveRecipe(c, { x: 0, y: 0 }, { x: 2000, y: 0 }, 360)).toEqual({ recipe: { op: 'revolve', profile: c.points, angle: 360, axis: { origin: [0, 0], dir: [1, 0] } } });
    expect(revolveRecipe(c, { x: 0, y: 200 }, { x: 10, y: 200 }, 360)).toEqual({ error: 'Révolution : le contour traverse l’axe ; il doit rester d’un seul côté.' });
    expect(revolveRecipe(c, { x: 0, y: 0 }, { x: 0, y: 0 }, 360)).toEqual({ error: 'Révolution : axe de longueur nulle.' });
    expect(revolveRecipe(c, { x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toMatchObject({ error: expect.any(String) });
    expect(revolveRecipe(c, { x: 0, y: 0 }, { x: 1, y: 0 }, 361)).toMatchObject({ error: expect.any(String) });
    expect(revolveRecipe({ kind: 'circle', cx: 0, cy: 500, r: 100 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 360)).toMatchObject({ error: expect.stringContaining('polygonal') });
  });

  it('encombrement : extrusion, révolution autour d’un axe du plan, booléens, transformations', () => {
    const e = ok(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50], [0, 50]] }, 30, 10));
    expect(recipeBounds(e)).toEqual({ min: [0, 0, 10], max: [100, 50, 40] });
    const r = ok(revolveRecipe({ kind: 'polygon', points: [[0, 100], [1000, 100], [1000, 300], [0, 300]] }, { x: 0, y: 0 }, { x: 1, y: 0 }, 360));
    expect(recipeBounds(r)).toEqual({ min: [0, -300, -300], max: [1000, 300, 300] });
    expect(recipeBounds({ op: 'translate', of: e, by: [5, 6, 7] })).toEqual({ min: [5, 6, 17], max: [105, 56, 47] });
    const q = recipeBounds({ op: 'rotate', of: e, angle: 90, about: [0, 0] });
    expect(q.min.map(v => Math.round(v))).toEqual([-50, 0, 10]);
    expect(q.max.map(v => Math.round(v))).toEqual([0, 100, 40]);
    expect(recipeBounds({ op: 'mirror', of: e, axis: 'x', value: 0 })).toEqual({ min: [-100, 0, 10], max: [0, 50, 40] });
    expect(recipeBounds({ op: 'scale', of: e, factor: 2, about: [0, 0, 0] })).toEqual({ min: [0, 0, 20], max: [200, 100, 80] });
    expect(recipeBounds({ op: 'intersect', a: e, b: { op: 'box', x: 10, y: 10, z: 100, at: [90, 40, 0] } })).toEqual({ min: [90, 40, 10], max: [100, 50, 40] });
    expect(recipeBounds({ op: 'cylinder', r: 10, h: 40, at: [-20, 0, 0], dir: [1, 0, 0] })).toEqual({ min: [-20, -10, -10], max: [20, 10, 10] });
  });

  it('perçage : depuis le dessus, traversant ou borgne ; point hors emprise refusé', () => {
    const e = ok(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50], [0, 50]] }, 20));
    expect(holeRecipe(e, 50, 25, 20)).toEqual({ recipe: { op: 'cut', a: e, b: { op: 'cylinder', r: 10, h: 22, at: [50, 25, -1] } } });
    expect(holeRecipe(e, 50, 25, 20, 5)).toEqual({ recipe: { op: 'cut', a: e, b: { op: 'cylinder', r: 10, h: 6, at: [50, 25, 15] } } });
    expect(holeRecipe(e, 500, 25, 20)).toEqual({ error: 'Perçage : le point est hors de l’emprise du solide.' });
    expect(holeRecipe(e, 50, 25, 0)).toMatchObject({ error: expect.any(String) });
    expect(holeRecipe(e, 50, 25, 10, -1)).toMatchObject({ error: expect.any(String) });
    expect(recipeSteps(ok(holeRecipe(e, 50, 25, 20)))).toEqual(['extrusion', 'perçage']);
  });

  it('trace en plan : partie retirée en traits interrompus ; DXF ; classe IFC', () => {
    const e = ok(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50], [0, 50]] }, 20));
    const s = solid(ok(holeRecipe(e, 50, 25, 20)));
    expect(solidTrace(s.recipe)).toEqual([{ pts: [[0, 0], [100, 0], [100, 50], [0, 50]], hidden: false }, { circle: { cx: 50, cy: 25, r: 10 }, hidden: true }]);
    const prims = solidPrimitives(s);
    expect(prims).toMatchObject([{ kind: 'polyline', points: [0, 0, 100, 0, 100, 50, 0, 50, 0, 0] }, { kind: 'circle', cx: 50, cy: 25, r: 10, lineType: 'interrompu' }]);
    expect(prims.every(p => !('recipe' in p) || p.recipe === undefined)).toBe(true);
    const dxf = exportToDxf([s as CadObject], createDefaultLayers(), []);
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('\nCIRCLE\n');
    // Partie retirée : le CIRCLE porte lui-même le type interrompu ; le contour vu reste du calque.
    const circle = dxf.split('\n0\nCIRCLE\n')[1].split('\n0\n')[0];
    expect(circle).toContain('\n6\nACAD_ISO02W100\n');
    expect(dxf.split('\n0\nLWPOLYLINE\n')[1].split('\n0\n')[0]).not.toContain('\n6\n');
    expect(exportDxf([s as CadObject], createDefaultLayers(), []).report.transformed.some(t => t.startsWith('Solides : 1 →'))).toBe(true);
    expect(defaultIfcClass(s)).toBe('IfcBuildingElementProxy');
    expect(dimensionOf(s)).toBe('Encombrement 100 × 50 × 20 mm');
  });

  it('transformations du plan : la recette est enveloppée, les déplacements fusionnent ; étirer = déplacer entier', () => {
    const e = ok(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50], [0, 50]] }, 20));
    const s = solid(e);
    const moved = { ...s, ...moveObject(s, 10, 0) } as SolidObj;
    expect(moved.recipe).toEqual({ op: 'translate', of: e, by: [10, 0, 0] });
    expect(({ ...moved, ...moveObject(moved, 5, 5) } as SolidObj).recipe).toEqual({ op: 'translate', of: e, by: [15, 5, 0] });
    expect(moveSolid(moved.recipe, -10, 0)).toEqual(e);
    expect(objectBounds(moved, [], [])).toEqual({ minX: 10, minY: 0, maxX: 110, maxY: 50 });
    expect(rotateObject(s, 0, 0, 30)).toEqual({ recipe: { op: 'rotate', of: e, angle: 30, about: [0, 0] } });
    expect(mirrorObject(s, 'y', 100)).toEqual({ recipe: { op: 'mirror', of: e, axis: 'y', value: 100 } });
    expect(scaleObject(s, 0, 0, 2)).toEqual({ recipe: { op: 'scale', of: e, factor: 2, about: [0, 0, 0] } });
    expect(stretchObject(s, { minX: -1, minY: -1, maxX: 101, maxY: 51 }, 5, 0)).toEqual({ recipe: { op: 'translate', of: e, by: [5, 0, 0] } });
    expect(stretchObject(s, { minX: 90, minY: -1, maxX: 101, maxY: 51 }, 5, 0)).toBeNull();
    // Aperçu : les coins capturés, déplacés avec le solide.
    expect(stretchPreview([s], { minX: -1, minY: -1, maxX: 101, maxY: 51 }, 5, 0)).toEqual([{ x: 5, y: 0 }, { x: 105, y: 0 }, { x: 105, y: 50 }, { x: 5, y: 50 }]);
  });

  it('relecture : recette bien formée seulement', () => {
    const e = ok(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50]] }, 20));
    expect(isRecipe(e)).toBe(true);
    expect(isRecipe({ op: 'cut', a: e, b: { op: 'cylinder', r: 1, h: 2 } })).toBe(true);
    expect(isRecipe({ op: 'translate', of: e, by: [1, 2, 3] })).toBe(true);
    expect(isRecipe({ op: 'extrude', profile: [[0, 0], [1, 0]], height: 1 })).toBe(false);
    expect(isRecipe({ op: 'box', x: 1, y: 1, z: -1 })).toBe(false);
    expect(isRecipe({ op: 'union', a: e })).toBe(false);
    expect(isRecipe({ op: 'eval', code: 'x' })).toBe(false);
    expect(isRecipe({ op: 'translate', of: e, by: [1, 2, Number.NaN] })).toBe(false);
    let deep: unknown = e;
    for (let i = 0; i < 300; i++) deep = { op: 'translate', of: deep, by: [0, 0, 0] };
    expect(isRecipe(deep)).toBe(false);
  });

  it('balayage : trajets (ligne, arc, polyligne, spline), longueurs de référence, refus', () => {
    const line = { ...base, id: 'L', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 300, y2: 400 } as CadObject;
    expect(pathOf(line)).toEqual({ path: [{ kind: 'line', from: [0, 0], to: [300, 400] }], length: 500 });
    // Demi-cercle de rayon 100 : longueur π·100, dans les deux sens de parcours.
    const arc = { ...base, id: 'A', name: 'A', kind: 'arc', cx: 0, cy: 0, r: 100, start: 0, end: 180 } as CadObject;
    const pa = pathOf(arc);
    if ('error' in pa) throw new Error(pa.error);
    expect(pa.length).toBeCloseTo(Math.PI * 100, 9);
    expect(pathLength(pa.path)).toBeCloseTo(Math.PI * 100, 9);
    const back: PathSeg[] = [{ kind: 'arc', from: [-100, 0], via: [0, 100], to: [100, 0] }];
    expect(pathLength(back)).toBeCloseTo(Math.PI * 100, 9);
    expect(pathLength([{ kind: 'arc', from: [100, 0], via: [0, -100], to: [0, 100] }])).toBeCloseTo(1.5 * Math.PI * 100, 9);
    const pts = pathPoints(back);
    expect(pts[0]).toEqual([-100, 0]);
    expect(pts[pts.length - 1]).toEqual([100, 0]);
    expect(pts.every(p => Math.abs(Math.hypot(p[0], p[1]) - 100) < 1e-9)).toBe(true);
    // Polyligne : sommets répétés ignorés.
    expect(pathOf(poly([0, 0, 1000, 0, 1000, 0, 1000, 500]))).toEqual({ path: [{ kind: 'line', from: [0, 0], to: [1000, 0] }, { kind: 'line', from: [1000, 0], to: [1000, 500] }], length: 1500 });
    expect(pathOf(poly([5, 5, 5, 5]))).toEqual({ error: 'Trajet de longueur nulle.' });
    expect(pathOf(rect(0, 0, 1, 1))).toEqual({ error: 'Trajet attendu : ligne, arc, polyligne ou spline.' });
  });

  it('balayage : profil redressé (centré, base à la cote), encombrement, trace ouverte, relecture', () => {
    const c = contourOf(rect(1000, 2000, 100, 50));
    if ('error' in c) throw new Error();
    expect(sweepProfileOf(c)).toEqual([[-50, 50], [50, 50], [50, 0], [-50, 0]]);
    expect(sweepProfileOf({ kind: 'circle', cx: 9, cy: 9, r: 20 })).toEqual({ r: 20, c: [0, 20] });
    const path: PathSeg[] = [{ kind: 'line', from: [0, 0], to: [1000, 0] }, { kind: 'line', from: [1000, 0], to: [1000, 500] }];
    const r = sweepRecipe(c, path, 300);
    if ('error' in r) throw new Error(r.error);
    expect(r.recipe).toEqual({ op: 'sweep', profile: [[-50, 50], [50, 50], [50, 0], [-50, 0]], path, z: 300 });
    expect(recipeBounds(r.recipe)).toEqual({ min: [-50, -50, 300], max: [1050, 550, 350] });
    expect(solidTrace(r.recipe)).toEqual([{ pts: [[0, 0], [1000, 0], [1000, 500]], hidden: false, open: true }]);
    expect(solidPrimitives(solid(r.recipe))).toMatchObject([{ kind: 'polyline', points: [0, 0, 1000, 0, 1000, 500] }]);
    expect(recipeSteps(r.recipe)).toEqual(['balayage']);
    expect(isRecipe(r.recipe)).toBe(true);
    expect(isRecipe({ op: 'sweep', profile: { r: 5, c: [0, 5] }, path: [{ kind: 'curve', points: [[0, 0], [1, 1]] }] })).toBe(true);
    expect(isRecipe({ op: 'sweep', profile: { r: -5, c: [0, 5] }, path })).toBe(false);
    expect(isRecipe({ op: 'sweep', profile: [[0, 0], [1, 0], [0, 1]], path: [] })).toBe(false);
    expect(isRecipe({ op: 'sweep', profile: [[0, 0], [1, 0], [0, 1]], path: [{ kind: 'arc', from: [0, 0], to: [1, 1] }] })).toBe(false);
    expect(sweepRecipe(c, [{ kind: 'line', from: [0, 0], to: [0, 0] }])).toEqual({ error: 'Balayage : trajet de longueur nulle.' });
  });

  it('lissage : sections dans l’ordre, cotes strictement monotones, une par section', () => {
    const a = contourOf(rect(0, 0, 1000, 1000)), b = contourOf(rect(250, 250, 500, 500));
    if ('error' in a || 'error' in b || a.kind !== 'polygon' || b.kind !== 'polygon') throw new Error();
    const c = { kind: 'circle' as const, cx: 500, cy: 500, r: 300 };
    const r = loftRecipe([a, b, c], [0, 1000, 2500], true);
    if ('error' in r) throw new Error(r.error);
    expect(r.recipe).toEqual({ op: 'loft', ruled: true, sections: [{ z: 0, points: a.points }, { z: 1000, points: b.points }, { z: 2500, circle: { cx: 500, cy: 500, r: 300 } }] });
    expect(recipeBounds(r.recipe)).toEqual({ min: [0, 0, 0], max: [1000, 1000, 2500] });
    expect(solidTrace(r.recipe)).toHaveLength(3);
    expect(recipeSteps(r.recipe)).toEqual(['lissage']);
    expect(isRecipe(r.recipe)).toBe(true);
    expect(isRecipe({ op: 'loft', ruled: true, sections: [{ z: 0, points: a.points }] })).toBe(false);
    expect(isRecipe({ op: 'loft', sections: [{ z: 0, points: a.points }, { z: 1, points: a.points }] })).toBe(false);
    // Points de contrôle : sommets et milieux des côtés, 8 points par cercle.
    if (r.recipe.op !== 'loft') throw new Error();
    expect(loftCheckPoints(r.recipe.sections)).toHaveLength(8 + 8 + 8);
    expect(loftCheckPoints(r.recipe.sections).slice(0, 2)).toEqual([[0, 0, 0], [500, 0, 0]]);
    expect(loftRecipe([a, b], [1000, 0], false)).toMatchObject({ recipe: { op: 'loft' } });
    expect(loftRecipe([a], [0], true)).toEqual({ error: 'Lissage : deux sections au moins.' });
    expect(loftRecipe([a, b], [0], true)).toEqual({ error: 'Lissage : 2 cotes attendues (une par section), 1 données.' });
    expect(loftRecipe([a, b, c], [0, 1000, 500], true)).toEqual({ error: 'Lissage : les cotes doivent croître (ou décroître) strictement d’une section à la suivante.' });
    expect(loftRecipe([a, b], [0, Number.NaN], true)).toEqual({ error: 'Lissage : cote invalide.' });
    expect(parseLevels('0 ; 1000,5;2500 ')).toEqual([0, 1000.5, 2500]);
    expect(parseLevels('')).toEqual([]);
  });

  it('coque : faces désignables des fonctions nommées, une face ouverte au moins, épaisseur positive', () => {
    const e = ok(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [100, 0], [100, 50]] }, 20, 0, 'OBJ-0001'));
    expect(e).toMatchObject({ op: 'extrude', name: 'OBJ-0001' });
    expect(faceChoices(e).map(f => f.label)).toEqual([
      'OBJ-0001 — dessus', 'OBJ-0001 — dessous',
      'OBJ-0001 — côté 1 (0 ; 0) → (100 ; 0)', 'OBJ-0001 — côté 2 (100 ; 0) → (100 ; 50)', 'OBJ-0001 — côté 3 (100 ; 50) → (0 ; 0)',
    ]);
    expect(faceChoices(e)[2].ref).toEqual({ feature: 'OBJ-0001', role: 'side:s0' });
    const cyl = ok(extrudeRecipe({ kind: 'circle', cx: 0, cy: 0, r: 5 }, 10, 0, 'C'));
    expect(faceChoices(cyl).map(f => f.ref.role)).toEqual(['cap', 'base', 'wall']);
    expect(faceChoices({ op: 'box', x: 1, y: 1, z: 1, name: 'B' })).toHaveLength(6);
    expect(faceChoices(ok(extrudeRecipe({ kind: 'polygon', points: [[0, 0], [1, 0], [0, 1]] }, 1)))).toEqual([]);
    // Les faces des deux opérandes d'un booléen restent désignables.
    expect(faceChoices({ op: 'union', a: e, b: cyl })).toHaveLength(8);
    const top = { feature: 'OBJ-0001', role: 'top' };
    expect(shellRecipe(e, 2, [top])).toEqual({ recipe: { op: 'shell', of: e, thickness: 2, open: top } });
    expect(shellRecipe(e, 2, [top, top])).toMatchObject({ recipe: { open: [top, top] } });
    expect(shellRecipe(e, 2, [])).toEqual({ error: 'Coque : désignez au moins une face ouverte.' });
    expect(shellRecipe(e, 0, [top])).toEqual({ error: 'Coque : épaisseur positive attendue.' });
    expect(isRecipe({ op: 'shell', of: e, thickness: 2, open: [top] })).toBe(true);
    expect(isRecipe({ op: 'shell', of: e, thickness: 2, open: [] })).toBe(false);
    expect(isRecipe({ op: 'shell', of: e, thickness: 2, open: { feature: 1 } })).toBe(false);
    expect(recipeSteps({ op: 'shell', of: e, thickness: 2, open: top })).toEqual(['extrusion', 'coque']);
  });
});
