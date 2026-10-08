import { describe, expect, it, vi } from 'vitest';
import type { CadObject, ProjectionObj, SolidObj } from '@/types/cad';
import { createDefaultLayers, dimensionOf, parentOf } from '@/types/cad';
import type { ProjLines, SolidRecipe } from './kernel/recipe';
import { exportDxf, exportToDxf } from './dxf';
import { moveObject, objectBounds } from './geometry';
import { cachedProjection, defaultPlacement, ensureProjections, placedView, projectionPrimitives, projectionsVersion, requestProjection, subscribeProjections, viewFrame } from './projection';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const recipe: SolidRecipe = { op: 'box', x: 100, y: 50, z: 20, at: [10, 20, 5] };
const solid: SolidObj = { ...base, id: 'OBJ-0001', name: 'S', kind: 'solid', recipe };
const proj = (view: ProjectionObj['view']): ProjectionObj => ({ ...base, id: 'OBJ-0002', name: 'V', kind: 'projection', sourceId: 'OBJ-0001', view, x: 500, y: 0 });
const faceLines: ProjLines = { visible: [[10, -5, 110, -5], [10, -25, 110, -25]], hidden: [[50, -5, 50, -25]] };

describe('vues projetées : cadre, cache, placement (lot 16.1)', () => {
  it('cadre de chaque vue d’après l’encombrement (repère du plan, Y vers le bas)', () => {
    expect(viewFrame(recipe, 'dessus')).toEqual({ minX: 10, minY: 20, w: 100, h: 50 });
    expect(viewFrame(recipe, 'face')).toEqual({ minX: 10, minY: -25, w: 100, h: 20 });
    expect(viewFrame(recipe, 'cote')).toEqual({ minX: -70, minY: -25, w: 50, h: 20 });
  });

  it('calcul demandé une fois, résultat mis en cache, abonnés prévenus ; la vue est posée en (x, y)', async () => {
    const compute = vi.fn(async () => faceLines);
    const seen = vi.fn();
    const off = subscribeProjections(seen);
    const v0 = projectionsVersion();
    expect(placedView(proj('face'), solid)).toEqual({ frame: { x: 500, y: 0, w: 100, h: 20 }, visible: [], hidden: [], state: 'calcul' });
    await Promise.all([requestProjection(recipe, 'face', compute), requestProjection(recipe, 'face', compute)]);
    await requestProjection(recipe, 'face', compute);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(projectionsVersion()).toBe(v0 + 1);
    off();
    expect(cachedProjection(recipe, 'face')).toEqual({ lines: faceLines });
    const v = placedView(proj('face'), solid)!;
    expect(v.state).toBe('prête');
    expect(v.visible).toEqual([[500, 20, 600, 20], [500, 0, 600, 0]]);
    expect(v.hidden).toEqual([[540, 20, 540, 0]]);
    const prims = projectionPrimitives(proj('face'), solid);
    expect(prims.map(p => (p as { lineType?: string }).lineType ?? 'continu')).toEqual(['continu', 'continu', 'interrompu']);
    expect(prims.every(p => !('sourceId' in p) || (p as { sourceId?: string }).sourceId === undefined)).toBe(true);
    // Échanges : la vue s'exporte en lignes.
    const dxf = exportToDxf([solid, proj('face')] as CadObject[], createDefaultLayers(), []);
    expect(dxf.match(/\nLINE\n/g)?.length).toBe(3);
    expect(exportDxf([solid, proj('face')] as CadObject[], createDefaultLayers(), []).report.transformed.some(t => t.startsWith('Vues projetées : 1 →'))).toBe(true);
  });

  it('erreur du noyau gardée et montrée ; vue sans solide : rien', async () => {
    const r2: SolidRecipe = { op: 'box', x: 1, y: 1, z: 1 };
    await requestProjection(r2, 'dessus', async () => { throw new Error('échec du noyau'); });
    expect(placedView({ ...proj('dessus') }, { ...solid, recipe: r2 })).toMatchObject({ state: 'erreur', error: 'échec du noyau' });
    expect(placedView(proj('dessus'), undefined)).toBeNull();
    expect(placedView(proj('dessus'), { ...base, id: 'X', name: 'X', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 1 } as CadObject)).toBeNull();
  });

  it('tout calculer avant un export ; placement par défaut à droite du solide', async () => {
    const r3: SolidRecipe = { op: 'box', x: 7, y: 7, z: 7 };
    const s3 = { ...solid, recipe: r3 };
    const compute = vi.fn(async () => faceLines);
    await ensureProjections([s3, proj('dessus'), proj('cote')], compute);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(defaultPlacement(solid, ['dessus', 'face', 'cote'])).toEqual([
      { view: 'dessus', x: 130, y: 20 }, { view: 'face', x: 250, y: 20 }, { view: 'cote', x: 370, y: 20 },
    ]);
  });

  it('objet : parent = solide, déplacement libre, emprise = cadre, libellé', () => {
    expect(parentOf(proj('face'))).toBe('OBJ-0001');
    expect(moveObject(proj('face'), 5, 6)).toEqual({ x: 505, y: 6 });
    expect(objectBounds(proj('face'), [], [solid])).toEqual({ minX: 500, minY: 0, maxX: 600, maxY: 20 });
    expect(dimensionOf(proj('cote'))).toBe('Vue de côté de OBJ-0001');
  });
});
