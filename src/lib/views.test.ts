import { describe, expect, it } from 'vitest';
import type { CadObject, ViewsObj } from '@/types/cad';
import { distanceToViews, linkedViews } from './views';

const base = { classification: 'mecanique' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
// Platine 100 × 60, perçage Ø 12,5 au centre, épaisseur 10.
const plate: CadObject = { ...base, id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, holes: ['OBJ-0002'] };
const hole: CadObject = { ...base, id: 'OBJ-0002', kind: 'circle', cx: 50, cy: 30, r: 6.25 };
const views: ViewsObj = { ...base, id: 'OBJ-0003', kind: 'views', sourceId: 'OBJ-0001', depth: 10, gap: 20, top: true, side: true };

describe('vues liées (lot 5.2)', () => {
  it('premier dièdre : dessus sous la face, gauche à droite ; perçage en traits cachés et axe', () => {
    const [top, side] = linkedViews(views, plate, [plate, hole])!;
    expect(top.kind).toBe('dessus');
    expect(top.frame).toEqual({ x: 0, y: 80, w: 100, h: 10 });
    expect(top.hidden).toEqual([[43.75, 80, 43.75, 90], [56.25, 80, 56.25, 90]]);
    expect(top.axes).toHaveLength(1);
    expect(side.kind).toBe('gauche');
    expect(side.frame).toEqual({ x: 120, y: 0, w: 10, h: 60 });
    expect(side.hidden).toEqual([[120, 23.75, 130, 23.75], [120, 36.25, 130, 36.25]]);
  });

  it('troisième dièdre : dessus au-dessus de la face, vue de droite', () => {
    const [top, side] = linkedViews(views, plate, [plate, hole], 'troisieme-diedre')!;
    expect(top.frame.y).toBe(-30);
    expect(side.kind).toBe('droite');
    expect(side.frame.x).toBe(120);
  });

  it('modifier la face met à jour les autres vues', () => {
    const wider = { ...plate, w: 140 } as CadObject;
    const [top, side] = linkedViews(views, wider, [wider, hole])!;
    expect(top.frame.w).toBe(140);
    expect(side.frame.x).toBe(160);
  });

  it('arêtes d’une face en L : vues ou cachées selon le côté d’observation', () => {
    // L : 0,0 → 100,0 → 100,60 → 60,60 → 60,30 → 0,30 → fermé ; épaisseur 10.
    const L: CadObject = { ...base, id: 'OBJ-0001', kind: 'polyline', points: [0, 0, 100, 0, 100, 60, 60, 60, 60, 30, 0, 30, 0, 0] };
    const [top, side] = linkedViews(views, L, [L])!;
    // Dessus : l'arête x = 60 est sous la matière (bord supérieur y = 0) : cachée.
    expect(top.hidden).toEqual([[60, 80, 60, 90]]);
    // Gauche (premier dièdre) : l'arête y = 30 est sur le bord gauche (x = 0) : vue.
    expect(side.visible).toContainEqual([120, 30, 130, 30]);
    // Droite (troisième dièdre) : l'arête y = 30 est derrière la matière (bord droit x = 100) : cachée.
    const [, right] = linkedViews(views, L, [L], 'troisieme-diedre')!;
    expect(right.hidden).toContainEqual([120, 30, 130, 30]);
  });

  it('cylindre (face circulaire) : pas d’arête fictive ; emprise exacte', () => {
    const disc: CadObject = { ...base, id: 'OBJ-0001', kind: 'circle', cx: 0, cy: 0, r: 20 };
    const [top] = linkedViews(views, disc, [disc])!;
    expect(top.frame).toEqual({ x: -20, y: 40, w: 40, h: 10 });
    expect(top.visible).toHaveLength(4);
  });

  it('contour ouvert ou épaisseur nulle : aucune vue ; désignation', () => {
    const line: CadObject = { ...base, id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 };
    expect(linkedViews(views, line, [line])).toBeNull();
    expect(linkedViews({ ...views, depth: 0 }, plate, [plate])).toBeNull();
    const v = linkedViews(views, plate, [plate, hole])!;
    expect(distanceToViews(v, 50, 80)).toBe(0);
  });
});
