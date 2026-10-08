// Étirer (lot 10.3) : fenêtre de capture, sommets intérieurs déplacés, les autres fixes.
import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { capturedVertices, stretchAll, stretchObject, windowOf } from './stretch';

const base = { name: 'o', classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const W = windowOf({ x: 900, y: -100 }, { x: 1100, y: 600 }); // capture la zone autour de x = 1 000

describe('étirer (lot 10.3)', () => {
  it('ligne et mur : seule l’extrémité capturée se déplace', () => {
    const l: CadObject = { ...base, id: 'L', kind: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 };
    expect(stretchObject(l, W, 500, 0)).toEqual({ x1: 0, y1: 0, x2: 1500, y2: 0 });
    const w: CadObject = { ...base, id: 'W', kind: 'wall', x1: 1000, y1: 0, x2: 1000, y2: 500, thickness: 200, justification: 'axe' };
    expect(stretchObject(w, W, 200, 0)).toMatchObject({ x1: 1200, x2: 1200 });
    expect(stretchObject({ ...l, x2: 500 }, W, 500, 0)).toBeNull();
  });

  it('rectangle : un côté capturé s’allonge selon sa normale ; un coin seul entraîne ses deux côtés', () => {
    const r: CadObject = { ...base, id: 'R', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 };
    // Côté droit (deux coins capturés), déplacement oblique : seule la composante horizontale compte.
    expect(stretchObject(r, W, 300, 40)).toEqual({ x: 0, y: 0, w: 1300, h: 500 });
    // Coin bas droit seul.
    const corner = windowOf({ x: 900, y: 400 }, { x: 1100, y: 600 });
    expect(stretchObject(r, corner, 100, 50)).toEqual({ x: 0, y: 0, w: 1100, h: 550 });
    // Rectangle entièrement capturé : déplacé.
    expect(stretchObject(r, windowOf({ x: -1, y: -1 }, { x: 2000, y: 2000 }), 10, 20)).toEqual({ x: 10, y: 20 });
    // Rectangle qui s'aplatirait : refusé.
    expect(stretchObject(r, W, -1000, 0)).toBeNull();
    // Retournement : le côté passe de l'autre côté, la largeur reste positive.
    expect(stretchObject(r, W, -1500, 0)).toEqual({ x: -500, y: 0, w: 500, h: 500 });
  });

  it('polyligne et spline : sommets capturés déplacés, les autres fixes', () => {
    const p: CadObject = { ...base, id: 'P', kind: 'polyline', points: [0, 0, 1000, 0, 1000, 500, 2000, 500] };
    expect(stretchObject(p, W, 0, 100)).toEqual({ points: [0, 0, 1000, 100, 1000, 600, 2000, 500] });
    const s: CadObject = { ...base, id: 'S', kind: 'spline', degree: 3, points: [0, 0, 1000, 0, 1500, 0, 2000, 0] };
    expect(stretchObject(s, W, 0, 100)).toEqual({ points: [0, 0, 1000, 100, 1500, 0, 2000, 0] });
  });

  it('cercle, ellipse, texte : déplacés entiers si leur centre ou point est capturé ; cote et ouverture suivent leur hôte', () => {
    const c: CadObject = { ...base, id: 'C', kind: 'circle', cx: 1000, cy: 200, r: 300 };
    expect(stretchObject(c, W, 50, 0)).toEqual({ cx: 1050, cy: 200 });
    const e: CadObject = { ...base, id: 'E', kind: 'ellipse', cx: 0, cy: 0, rx: 1000, ry: 100, rotation: 0 };
    expect(stretchObject(e, W, 50, 0)).toBeNull();
    const t: CadObject = { ...base, id: 'T', kind: 'text', x: 1000, y: 0, content: 'A', height: 100, rotation: 0, align: 'left' };
    expect(stretchObject(t, W, 5, 5)).toEqual({ x: 1005, y: 5 });
    const d: CadObject = { ...base, id: 'D', kind: 'dimension', targetId: 'L', style: 'aligned', offset: 100 };
    expect(stretchObject(d, W, 5, 5)).toBeNull();
  });

  it('ensemble : seuls les objets touchés reçoivent une modification ; déplacement nul = rien', () => {
    const objs: CadObject[] = [
      { ...base, id: 'A', kind: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 },
      { ...base, id: 'B', kind: 'line', x1: 0, y1: 300, x2: 500, y2: 300 },
    ];
    expect(stretchAll(objs, W, 100, 0).map(p => p.id)).toEqual(['A']);
    expect(stretchAll(objs, W, 0, 0)).toEqual([]);
    expect(capturedVertices(objs, W)).toEqual([{ x: 1000, y: 0 }]);
  });
});
