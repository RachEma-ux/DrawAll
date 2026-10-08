import { describe, expect, it } from 'vitest';
import type { Layer, OpeningObj, WallObj } from '@/types/cad';
import { openingFits, openingGeometry, positionOnWall } from './opening';
import { wallsGeometry } from './wall';
import { moveObject, rotateObject } from './geometry';
import { exportDxf } from './dxf';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
const wall: WallObj = { ...base, id: 'M', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' };
const door: OpeningObj = { ...base, id: 'P', kind: 'opening', hostId: 'M', type: 'porte', position: 1500, width: 900, hinge: 'debut', side: 'droite' };

describe('ouvertures', () => {
  it('porte : baie dans l’épaisseur, vantail et débattement', () => {
    const g = openingGeometry(door, wall)!;
    expect([g.from, g.to]).toEqual([1050, 1950]);
    expect(g.rect).toEqual([{ x: 1050, y: -100 }, { x: 1950, y: -100 }, { x: 1950, y: 100 }, { x: 1050, y: 100 }]);
    // Charnière au début de la baie, côté droit (y = +100), vantail ouvert vers le bas sur 900 mm.
    expect(g.leaf).toEqual([{ x: 1050, y: 100 }, { x: 1050, y: 1000 }]);
    expect(g.swing).toMatchObject({ cx: 1050, cy: 100, r: 900, to: { x: 1950, y: 100 } });
  });

  it('fenêtre : appuis et vitrage', () => {
    const g = openingGeometry({ ...door, type: 'fenetre' }, wall)!;
    expect(g.glazing).toHaveLength(3);
    expect(g.leaf).toBeUndefined();
  });

  it('les faces du mur sont coupées sur la largeur de la baie, avec tableaux', () => {
    const edges = wallsGeometry([wall], [door]).get('M')!.edges;
    const crossesOpening = edges.some(([a, b]) => Math.abs(a.y - b.y) < 1e-9 && Math.min(a.x, b.x) < 1500 && Math.max(a.x, b.x) > 1500);
    expect(crossesOpening).toBe(false);
    // 2 faces coupées en 2 + 2 abouts + 2 tableaux.
    expect(edges).toHaveLength(8);
  });

  it('déplacer le mur déplace la porte', () => {
    const before = openingGeometry(door, wall)!;
    const moved = { ...wall, ...moveObject(wall, 300, -700) } as WallObj;
    const after = openingGeometry(door, moved)!;
    expect(after.rect.map((p, i) => [p.x - before.rect[i].x, p.y - before.rect[i].y])).toEqual(Array(4).fill([300, -700]));
    // Tourner le mur d'un quart de tour : la porte tourne avec lui.
    const turned = { ...wall, ...rotateObject(wall, 0, 0, 90) } as WallObj;
    const g = openingGeometry(door, turned)!;
    expect(Math.abs(g.rect[0].x - g.rect[1].x)).toBeLessThan(1e-6);
    // La porte seule ne se déplace pas : elle suit son mur.
    expect(moveObject(door, 100, 100)).toEqual({});
  });

  it('contrôles : la baie doit tenir dans le mur ; projection d’un clic', () => {
    expect(openingFits(door, wall)).toBeNull();
    expect(openingFits({ position: 300, width: 900 }, wall)).toMatch(/dépasse/);
    expect(positionOnWall(wall, { x: 2200, y: 80 })).toBe(2200);
    expect(positionOnWall(wall, { x: -50, y: 0 })).toBe(0);
  });
});

describe('baie vide dans le remplissage du mur', () => {
  it('la baie de chaque ouverture est un îlot du mur', () => {
    const g = wallsGeometry([wall], [door]).get('M')!;
    expect(g.bays).toHaveLength(1);
    const xs = g.bays[0].map(p => p.x), ys = g.bays[0].map(p => p.y);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([1050, 1950]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([-100, 100]);
  });

  it('DXF : la hachure du mur porte la baie comme contour intérieur', () => {
    const layers: Layer[] = [{ id: 'LAY-0001', name: 'Murs', color: '#ffffff', visible: true, locked: false }];
    const { content } = exportDxf([{ ...wall, hatch: 'solid' }, door], layers, []);
    const hatch = content.slice(content.indexOf('\nHATCH\n'));
    const lines = hatch.split('\n').map(l => l.trim());
    expect(lines[lines.indexOf('91') + 1]).toBe('2');
  });
});
