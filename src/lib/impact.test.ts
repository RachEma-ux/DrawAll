import { describe, expect, it } from 'vitest';
import type { CadObject, GeoConstraint, Sheet, WallObj } from '@/types/cad';
import { impactOf, impactSummary } from './impact';

const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallObj => ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe' });
const objects: CadObject[] = [
  wall('W1', 0, 0, 5000, 0), wall('W2', 5000, 0, 5000, 4000), wall('W3', 5000, 4000, 0, 4000), wall('W4', 0, 4000, 0, 0),
  { ...base, id: 'O1', name: 'Porte', kind: 'opening', hostId: 'W1', type: 'porte', position: 1000, width: 900, hinge: 'debut', side: 'gauche' } as CadObject,
  { ...base, id: 'D1', name: 'Cote', kind: 'dimension', targetId: 'W1', style: 'aligned', offset: -500 } as CadObject,
  { ...base, id: 'R1', name: 'Séjour', kind: 'room', x: 2500, y: 2000 } as CadObject,
  { ...base, id: 'T1', name: 'Tableau des murs', kind: 'bom', x: 6000, y: 0, table: 'murs' } as CadObject,
  { ...base, id: 'T2', name: 'Tableau des ouvertures', kind: 'bom', x: 6000, y: 2000, table: 'ouvertures' } as CadObject,
  { ...base, id: 'L1', name: 'Trait', kind: 'line', x1: 20000, y1: 0, x2: 21000, y2: 0 } as CadObject,
];
const constraints: GeoConstraint[] = [{ id: 'CTR-0001', type: 'horizontal', seg: { obj: 'L1' } }];
const sheet = (id: string, cx: number, extra: Partial<Sheet['viewports'][0]> = {}): Sheet => ({
  id, name: `Feuille ${id}`, format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 },
  viewports: [{ id: `FEN-${id}`, name: 'Plan', x: 20, y: 10, w: 200, h: 150, scale: { paper: 1, model: 50 }, center: { x: cx, y: 2000 }, hiddenLayerIds: [], ...extra }],
});
const levels = [{ id: 'NIV-0001', name: 'Rez', elevation: 0 }, { id: 'NIV-0002', name: 'Étage', elevation: 2800 }];
const ctx = { objects, blocks: [], constraints, levels, sheets: [sheet('FEU-0001', 2500), sheet('FEU-0002', 100000), sheet('FEU-0003', 2500, { hiddenLayerIds: ['LAY-0001'] }), sheet('FEU-0004', 2500, { levelId: 'NIV-0002' })] };

describe('analyse d’impact (lot 14.3)', () => {
  it('suppression d’un mur : ouverture et cote emportées, pièce et tableaux recalculés, feuille à recalculer', () => {
    const i = impactOf(['W1'], 'suppression', ctx);
    expect(i.removedWith.map(x => x.id)).toEqual(['O1', 'D1']);
    expect(i.affected.map(x => [x.id, x.reason])).toEqual([['R1', 'contour délimité par W1'], ['T1', 'tableau recalculé'], ['T2', 'tableau recalculé']]);
    expect(i.sheets).toEqual([{ id: 'FEU-0001', name: 'Feuille FEU-0001', viewports: ['FEN-FEU-0001'] }]);
    expect(i.constraints).toEqual([]);
    expect(impactSummary(i)).toBe('2 objet(s) associé(s) supprimé(s) avec : O1, D1 ; 3 objet(s) recalculé(s) : R1, T1, T2 ; feuille(s) à recalculer : Feuille FEU-0001');
  });

  it('nomenclature : une pièce ou une occurrence modifiée la recalcule', () => {
    const part = { ...base, id: 'P1', name: 'Pièce', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    const occ = { ...base, id: 'Q1', name: 'Occ', kind: 'occurrence', sourceId: 'P1', x: 0, y: 0, z: 0, angle: 0 } as unknown as CadObject;
    const plain = { ...base, id: 'S1', name: 'Solide', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 } } as unknown as CadObject;
    const nom = { ...base, id: 'N1', name: 'Nomenclature', kind: 'bom', x: 0, y: 0 } as CadObject;
    const c = { ...ctx, objects: [part, occ, plain, nom] };
    expect(impactOf(['Q1'], 'modification', c).affected.map(x => [x.id, x.reason])).toContainEqual(['N1', 'nomenclature recalculée']);
    expect(impactOf(['P1'], 'modification', c).affected.map(x => [x.id, x.reason])).toContainEqual(['N1', 'nomenclature recalculée']);
    expect(impactOf(['S1'], 'modification', c).affected.map(x => x.id)).not.toContain('N1');
  });

  it('suppression d’un repère de coupe : la coupe qui en dépend est annoncée, comme la suppression l’emporte', () => {
    const mark = { ...base, id: 'M1', name: 'A', kind: 'section', x1: 0, y1: 0, x2: 10, y2: 0, label: 'A' } as CadObject;
    const cut = { ...base, id: 'C1', name: 'Coupe', kind: 'cut', sourceId: 'W1', markId: 'M1', depth: 10, gap: 5 } as unknown as CadObject;
    const i = impactOf(['M1'], 'suppression', { ...ctx, objects: [...objects, mark, cut] });
    expect(i.removedWith.map(x => x.id)).toEqual(['C1']);
  });

  it('liaisons d’assemblage : l’occurrence liée est repositionnée (modification) ou perd sa liaison (suppression)', () => {
    const occ = (id: string, extra: Record<string, unknown> = {}) => ({ ...base, id, name: id, kind: 'occurrence', sourceId: 'S', x: 0, y: 0, z: 0, angle: 0, ...extra }) as unknown as CadObject;
    const objs = [...objects, occ('A'), occ('B', { mate: { type: 'fixe', to: 'A', rel: [0, 0, 0, 0] } }), occ('C', { mate: { type: 'fixe', to: 'B', rel: [0, 0, 0, 0] } })];
    expect(impactOf(['A'], 'modification', { ...ctx, objects: objs }).affected.map(x => [x.id, x.reason])).toEqual([['B', 'repositionné par sa liaison à A'], ['C', 'repositionné par sa liaison à B']]);
    const del = impactOf(['A'], 'suppression', { ...ctx, objects: objs });
    expect(del.removedWith).toEqual([]);
    expect(del.affected.map(x => [x.id, x.reason])).toEqual([['B', 'perd sa liaison à A']]);
  });

  it('modification d’un mur : associés suivis, rien d’emporté', () => {
    const i = impactOf(['W1'], 'modification', ctx);
    expect(i.removedWith).toEqual([]);
    expect(i.affected.map(x => x.id)).toEqual(['O1', 'D1', 'R1', 'T1', 'T2']);
    expect(i.affected[0].reason).toBe('suit W1');
  });

  it('objet isolé hors de toute fenêtre : seule sa contrainte est touchée', () => {
    const i = impactOf(['L1'], 'modification', ctx);
    expect(i).toEqual({ removedWith: [], affected: [], constraints: ['CTR-0001'], sheets: [] });
  });

  it('feuilles : fenêtre éloignée, calque masqué ou autre niveau ne comptent pas', () => {
    const i = impactOf(['W2'], 'modification', ctx);
    expect(i.sheets.map(s => s.id)).toEqual(['FEU-0001']);
  });
});

describe('analyse d’impact : contours de pièces par niveau (relecture #68)', () => {
  it('les murs d’un autre étage ne remplacent pas le contour de la pièce', () => {
    const lv = (o: WallObj, levelId: string) => ({ ...o, levelId }) as CadObject;
    const lower = [wall('W1', 0, 0, 5000, 0), wall('W2', 5000, 0, 5000, 4000), wall('W3', 5000, 4000, 0, 4000), wall('W4', 0, 4000, 0, 0)].map(w => lv(w, 'NIV-0001'));
    const upper = [wall('U1', 2000, 1500, 3000, 1500), wall('U2', 3000, 1500, 3000, 2500), wall('U3', 3000, 2500, 2000, 2500), wall('U4', 2000, 2500, 2000, 1500)].map(w => lv(w, 'NIV-0002'));
    const room = { ...base, id: 'R1', name: 'Séjour', kind: 'room', x: 2500, y: 2000, levelId: 'NIV-0001' } as CadObject;
    const i = impactOf(['W1'], 'modification', { ...ctx, objects: [...lower, ...upper, room], constraints: [] });
    expect(i.affected.map(x => [x.id, x.reason])).toContainEqual(['R1', 'contour délimité par W1']);
  });
});


describe('relecture 54e passe : contour dont un îlot est touché', () => {
  it('îlot modifié ou supprimé : le contour qui le hachure est recalculé', () => {
    const outer = { ...base, id: 'C1', name: 'Contour', kind: 'circle', cx: 0, cy: 0, r: 100, hatch: 'solid', holes: ['C2'] } as unknown as CadObject;
    const island = { ...base, id: 'C2', name: 'Îlot', kind: 'circle', cx: 0, cy: 0, r: 10 } as unknown as CadObject;
    const c = { ...ctx, objects: [outer, island] };
    expect(impactOf(['C2'], 'modification', c).affected.map(x => [x.id, x.reason])).toContainEqual(['C1', 'hachure autour de l’îlot C2']);
    expect(impactOf(['C2'], 'suppression', c).affected.map(x => x.id)).toContain('C1');
  });
});
