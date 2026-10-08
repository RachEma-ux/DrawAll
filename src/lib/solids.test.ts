import { describe, expect, it } from 'vitest';
import type { CadObject, SolidObj } from '@/types/cad';
import { createDefaultLayers, dimensionOf } from '@/types/cad';
import { exportDxf, exportToDxf } from './dxf';
import { mirrorObject, moveObject, objectBounds, rotateObject, scaleObject } from './geometry';
import { defaultIfcClass } from './properties';
import { contourOf, extrudeRecipe, holeRecipe, isRecipe, moveSolid, recipeBounds, recipeSteps, revolveRecipe, solidPrimitives, solidTrace } from './solids';
import { stretchObject, stretchPreview } from './stretch';
import type { SolidRecipe } from './kernel/recipe';

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
});
