import { describe, expect, it, vi } from 'vitest';
import type { CadObject, ElevationObj, ProjectionObj, SolidObj } from '@/types/cad';
import { createDefaultLayers, dimensionOf, parentOf } from '@/types/cad';
import type { ProjLines, SolidRecipe } from './kernel/recipe';
import { exportDxf, exportToDxf } from './dxf';
import { moveObject, objectBounds } from './geometry';
import { ELEVATION_LABEL, cachedProjection, defaultPlacement, elevationLabel, elevationPlacement, elevationSetup, ensureProjections, placedElevation, prepareProjections, setProjectionLevels, setProjectionModel, viewPrimitives, placedView, projectionPrimitives, projectionsVersion, requestProjection, subscribeProjections, viewFrame } from './projection';

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

  it('un export attend le calcul déjà en cours de la même vue (cache rempli au retour)', async () => {
    const r4: SolidRecipe = { op: 'box', x: 9, y: 9, z: 9 };
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const compute = vi.fn(async () => { await gate; return faceLines; });
    void requestProjection(r4, 'face', compute);
    let done = false;
    const exported = ensureProjections([{ ...solid, recipe: r4 }, proj('face')], compute).then(() => { done = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(done).toBe(false);
    release();
    await exported;
    expect(compute).toHaveBeenCalledTimes(1);
    expect(cachedProjection(r4, 'face')).toEqual({ lines: faceLines });
  });

  it('préparation d’un export : erreur du noyau recalculée une fois, puis export refusé avec sa raison', async () => {
    const r5: SolidRecipe = { op: 'box', x: 11, y: 11, z: 11 };
    const objs = [{ ...solid, recipe: r5 }, proj('face')];
    const failing = vi.fn(async () => { throw new Error('noyau absent'); });
    // Rendu de fond : l'erreur est gardée et listée, sans rejet.
    expect(await ensureProjections(objs, failing)).toEqual(['OBJ-0002 (vue de face de OBJ-0001) : noyau absent']);
    // Préparation : nouvel essai, toujours en échec → refus explicite.
    await expect(prepareProjections(objs, failing)).rejects.toThrow('Vues non calculées par le noyau, export refusé — OBJ-0002 (vue de face de OBJ-0001) : noyau absent');
    expect(failing).toHaveBeenCalledTimes(2);
    // Le noyau revenu : la préparation recalcule la vue en erreur et réussit.
    await expect(prepareProjections(objs, async () => faceLines)).resolves.toBeUndefined();
    expect(cachedProjection(r5, 'face')).toEqual({ lines: faceLines });
  });

  it('objet : parent = solide, déplacement libre, emprise = cadre, libellé', () => {
    expect(parentOf(proj('face'))).toBe('OBJ-0001');
    expect(moveObject(proj('face'), 5, 6)).toEqual({ x: 505, y: 6 });
    expect(objectBounds(proj('face'), [], [solid])).toEqual({ minX: 500, minY: 0, maxX: 600, maxY: 20 });
    expect(dimensionOf(proj('cote'))).toBe('Vue de côté de OBJ-0001');
  });

  it('façades et coupes : réglage de caméra, coupe par repère, erreurs en clair, placement, cache', async () => {
    const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe', height: 2500 }) as CadObject;
    const mark = { ...base, id: 'OBJ-0050', name: 'A', kind: 'section', x1: -1000, y1: 2000, x2: 6000, y2: 2000, label: 'A' } as CadObject;
    const objs = [wall('M1', 0, 0, 5000, 0), wall('M2', 5000, 0, 5000, 4000), mark];
    const elev = (view: ElevationObj['view'], extra: Partial<ElevationObj> = {}): ElevationObj => ({ ...base, id: 'OBJ-0060', name: 'F', kind: 'elevation', view, x: 0, y: 6000, ...extra });
    setProjectionLevels(undefined);
    const sud = elevationSetup(elev('sud'), objs);
    if ('error' in sud) throw new Error(sud.error);
    expect(sud.camera).toEqual({ dir: [-0, 1, 0], xAxis: [1, 0, 0] });
    expect(sud.clip).toBeUndefined();
    // Coupe : trait de gauche à droite, vue à gauche du trait (vers le nord, Y décroissant).
    const coupe = elevationSetup(elev('coupe', { markId: 'OBJ-0050' }), objs);
    expect('error' in coupe ? coupe.error : coupe.clip).toEqual({ point: [-1000, 2000], look: [0, -1] });
    const flipped = elevationSetup(elev('coupe', { markId: 'OBJ-0050' }), [objs[0], objs[1], { ...mark, flip: true } as CadObject]);
    expect('error' in flipped ? flipped.error : flipped.clip?.look).toEqual([-0, 1]);
    expect(elevationSetup(elev('coupe', { markId: 'OBJ-9999' }), objs)).toEqual({ error: 'repère de coupe OBJ-9999 absent' });
    expect(elevationSetup(elev('nord'), [mark])).toEqual({ error: 'aucun élément en volume (murs, dalles, toitures… ou solides)' });
    // Réglage impossible : la façade est en erreur, la préparation d'un export la refuse.
    await expect(prepareProjections([mark, elev('nord')], async () => ({ visible: [], hidden: [] }), async () => ({ visible: [], hidden: [] })))
      .rejects.toThrow('OBJ-0060 (nord) : aucun élément en volume');
    expect(elevationLabel(elev('coupe', { markId: 'OBJ-0050' }), objs)).toBe('Coupe A–A');
    expect(ELEVATION_LABEL.est).toBe('Façade est');
    expect(parentOf(elev('coupe', { markId: 'OBJ-0050' }))).toBe('OBJ-0050');
    expect(parentOf(elev('sud'))).toBeNull();
    // Cadre tiré de l'encombrement, sans attendre le noyau ; puis arêtes vues seulement.
    expect(placedElevation(elev('sud'), objs)).toMatchObject({ frame: { x: 0, y: 6000, w: 5100, h: 2500 }, state: 'calcul' });
    const lines: ProjLines = { visible: [[-100, 0, 5100, 0]], hidden: [[0, 0, 0, -2500]] };
    await ensureProjections([...objs, elev('sud')], async () => lines, async () => lines);
    const v = placedElevation(elev('sud'), objs)!;
    expect(v).toMatchObject({ state: 'prête', visible: [[-100, 8500, 5100, 8500]], hidden: [] });
    expect(viewPrimitives(elev('sud'), objs)).toMatchObject([{ kind: 'line', x1: -100, y1: 8500, x2: 5100, y2: 8500 }]);
    expect(exportDxf([...objs, elev('sud')], createDefaultLayers(), []).report.transformed.some(t => t.startsWith('Façades et coupes : 1 →'))).toBe(true);
    // Placement sous le bâtiment, en ligne.
    const placed = elevationPlacement(objs, [{ view: 'sud' }, { view: 'est' }]);
    expect(placed.map(p => p.view)).toEqual(['sud', 'est']);
    // Murs bruts (sans jonction) : X de 0 à 5 100, Y jusqu'à 4 000 ; écart = 5 100 / 5.
    expect(placed).toEqual([{ view: 'sud', x: 0, y: 5020 }, { view: 'est', x: 5100 + 1020, y: 5020 }]);
    expect(elevationPlacement([mark], [{ view: 'sud' }])).toEqual([]);
  });

  it('façade d’un projet à plusieurs niveaux : tout le bâtiment, même depuis le dessin d’un niveau', async () => {
    const wall = (id: string, levelId: string) => ({ ...base, id, name: id, kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe', height: 2500, levelId }) as CadObject;
    const levels = [{ id: 'NIV-0001', name: 'RDC', elevation: 0 }, { id: 'NIV-0002', name: 'R+1', elevation: 2700 }];
    const f = { ...base, id: 'OBJ-0061', name: 'F', kind: 'elevation', view: 'sud', x: 0, y: 6000, levelId: 'NIV-0001' } as ElevationObj;
    const all = [wall('M1', 'NIV-0001'), wall('M2', 'NIV-0002'), f];
    const level = all.filter(o => o.levelId === 'NIV-0001');
    setProjectionLevels(levels);
    setProjectionModel(all);
    try {
      const lines: ProjLines = { visible: [[0, 0, 5000, 0]], hidden: [] };
      await ensureProjections(all, async () => lines, async () => lines);
      // Le dessin du niveau actif retrouve la vue calculée sur la maquette entière.
      expect(placedElevation(f, level)).toMatchObject({ state: 'prête', frame: { h: 5200 } });
    } finally {
      setProjectionModel(undefined);
      setProjectionLevels(undefined);
    }
  });
});
