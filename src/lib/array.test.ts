import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { MAX_COPIES, cloneAll, polarAngles, polarArray, rectangularArray, rotation, translation, withDependencies } from './array';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
const line: CadObject = { ...base, id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0 };
const rect: CadObject = { ...base, id: 'OBJ-0002', kind: 'rect', x: 0, y: 0, w: 10, h: 5 };
const dim: CadObject = { ...base, id: 'OBJ-0003', kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: 10 };

describe('réseau rectangulaire', () => {
  it('place les copies aux positions du pas, sans l’original', () => {
    const out = rectangularArray(2, 3, 100, 50);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { objects } = cloneAll([line], out.placements, 1, 7);
    expect(objects.map(o => o.kind === 'line' && [o.x1, o.y1])).toEqual([[100, 0], [200, 0], [0, 50], [100, 50], [200, 50]]);
  });

  it('refuse les paramètres invalides', () => {
    expect(rectangularArray(1, 1, 10, 10).ok).toBe(false);
    expect(rectangularArray(0, 3, 10, 10).ok).toBe(false);
    expect(rectangularArray(2.5, 3, 10, 10).ok).toBe(false);
    expect(rectangularArray(1, 3, 0, 10).ok).toBe(false);
    expect(rectangularArray(100, 100, 1, 1).ok).toBe(false);
    expect(rectangularArray(1, MAX_COPIES + 1, 1, 0).ok).toBe(true);
    expect(rectangularArray(1, MAX_COPIES + 1, 1, 0, 2).ok).toBe(false);
  });
});

describe('réseau polaire', () => {
  it('répartit un tour complet sans superposer le dernier exemplaire', () => {
    expect(polarAngles(4, 360)).toEqual([90, 180, 270]);
  });

  it('répartit un angle partiel de bout en bout', () => {
    expect(polarAngles(3, 90)).toEqual([45, 90]);
  });

  it('tourne dans le sens antihoraire à l’écran (Y vers le bas)', () => {
    const out = polarArray(4, 360, 0, 0);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { objects } = cloneAll([line], out.placements, 1, 0);
    const first = objects[0];
    expect(first.kind).toBe('line');
    if (first.kind !== 'line') return;
    // (10, 0) tourné de 90° antihoraire à l'écran : vers le haut, donc y = −10.
    expect(first.x2).toBeCloseTo(0, 9);
    expect(first.y2).toBeCloseTo(-10, 9);
  });

  it('un rectangle tourné d’un angle quelconque devient une polyligne fermée', () => {
    const patch = rotation(0, 0, 45)(rect);
    expect(patch?.kind).toBe('polyline');
    expect((patch as { points: number[] }).points).toHaveLength(10);
    expect(rotation(0, 0, 90)(rect)?.kind).toBeUndefined();
  });

  it('refuse un angle nul ou un seul exemplaire', () => {
    expect(polarArray(1, 360, 0, 0).ok).toBe(false);
    expect(polarArray(4, 0, 0, 0).ok).toBe(false);
    expect(polarArray(4, 400, 0, 0).ok).toBe(false);
  });
});

describe('identifiants des copies', () => {
  it('n’engendre aucun doublon et suit le compteur', () => {
    const out = rectangularArray(3, 3, 20, 20);
    if (!out.ok) throw new Error(out.error);
    const { objects, counter } = cloneAll([line, rect], out.placements, 41, 3);
    const ids = objects.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(16);
    expect(ids[0]).toBe('OBJ-0042');
    expect(counter).toBe(57);
    expect(ids).not.toContain(line.id);
    expect(objects.every(o => o.createdSeq === 3)).toBe(true);
  });

  it('une cote suit la copie de sa cible, et seulement si la cible est copiée', () => {
    const { objects } = cloneAll([line, dim], [translation(5, 5), translation(10, 10)], 10, 0);
    const lines = objects.filter(o => o.kind === 'line');
    const dims = objects.filter(o => o.kind === 'dimension');
    expect(dims.map(d => d.kind === 'dimension' && d.targetId)).toEqual(lines.map(l => l.id));
    expect(cloneAll([dim], [translation(5, 5)], 10, 0).objects).toEqual([]);
  });
});

describe('dépendances de copie', () => {
  it('une cote choisie seule emporte sa cible ; une cible emporte ses cotes', () => {
    expect(withDependencies([line, rect, dim], ['OBJ-0003']).map(o => o.id)).toEqual(['OBJ-0001', 'OBJ-0003']);
    expect(withDependencies([line, rect, dim], ['OBJ-0001']).map(o => o.id)).toEqual(['OBJ-0001', 'OBJ-0003']);
    expect(withDependencies([line, rect, dim], ['OBJ-0002']).map(o => o.id)).toEqual(['OBJ-0002']);
  });

  it('une occurrence de bloc ne tourne pas (pas d’orientation) ; elle reste copiable par translation', () => {
    const ref: CadObject = { ...base, id: 'OBJ-0009', kind: 'blockRef', blockId: 'BLQ-0001', x: 10, y: 0, scale: 1 };
    expect(rotation(0, 0, 90)(ref)).toBeNull();
    expect(rotation(0, 0, 360)(ref)).not.toBeNull();
    expect(translation(5, 5)(ref)).toEqual({ x: 15, y: 5 });
  });
});

describe('îlots de hachure copiés', () => {
  it('les îlots suivent la copie de leur contour, à chaque pose', () => {
    const outer: CadObject = { ...base, id: 'OBJ-0010', kind: 'rect', x: 0, y: 0, w: 100, h: 100, hatch: 'diagonal', holes: ['OBJ-0011'] };
    const inner: CadObject = { ...base, id: 'OBJ-0011', kind: 'circle', cx: 50, cy: 50, r: 10 };
    const { objects } = cloneAll([outer, inner], [translation(200, 0), translation(400, 0)], 20, 0);
    const [o1, i1, o2, i2] = objects;
    expect(o1.holes).toEqual([i1.id]);
    expect(o2.holes).toEqual([i2.id]);
    // Contour copié sans son îlot : plus d'îlot.
    expect(cloneAll([outer], [translation(5, 5)], 30, 0).objects[0].holes).toBeUndefined();
  });
});

describe('ouvertures copiées avec leur mur', () => {
  const wall = { id: 'OBJ-0010', kind: 'wall', classification: 'non-classifie', layerId: 'L', hatch: 'none', createdSeq: 0, x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200, justification: 'axe' } as CadObject;
  const door = { id: 'OBJ-0011', kind: 'opening', classification: 'non-classifie', layerId: 'L', hatch: 'none', createdSeq: 0, hostId: 'OBJ-0010', type: 'porte', position: 1000, width: 900, hinge: 'debut', side: 'gauche' } as CadObject;

  it('une ouverture suit la copie de son mur, et seulement si le mur est copié', () => {
    const { objects } = cloneAll([wall, door], [translation(0, 3000), translation(0, 6000)], 20, 0);
    const walls = objects.filter(o => o.kind === 'wall');
    const doors = objects.filter(o => o.kind === 'opening');
    expect(doors.map(d => d.kind === 'opening' && d.hostId)).toEqual(walls.map(w => w.id));
    expect(cloneAll([door], [translation(0, 3000)], 20, 0).objects).toEqual([]);
  });

  it('une ouverture choisie seule emporte son mur ; un mur emporte ses ouvertures', () => {
    expect(withDependencies([wall, door], ['OBJ-0011']).map(o => o.id)).toEqual(['OBJ-0010', 'OBJ-0011']);
    expect(withDependencies([wall, door], ['OBJ-0010']).map(o => o.id)).toEqual(['OBJ-0010', 'OBJ-0011']);
  });
});

describe('objets associatifs copiés avec leur parent (lot 5.2)', () => {
  const b = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
  const objs: CadObject[] = [
    { ...b, id: 'OBJ-0001', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' },
    { ...b, id: 'OBJ-0002', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 1500, width: 900, hinge: 'debut', side: 'droite' },
    { ...b, id: 'OBJ-0003', kind: 'rect', x: 0, y: 1000, w: 100, h: 60 },
    { ...b, id: 'OBJ-0004', kind: 'views', sourceId: 'OBJ-0003', depth: 10, gap: 20, top: true, side: true },
  ];

  it('copier une porte copie son mur ; copier une face copie ses vues', () => {
    expect(withDependencies(objs, ['OBJ-0002']).map(o => o.id)).toEqual(['OBJ-0001', 'OBJ-0002']);
    expect(withDependencies(objs, ['OBJ-0003']).map(o => o.id)).toEqual(['OBJ-0003', 'OBJ-0004']);
  });

  it('la copie de la porte est hébergée par la copie du mur, pas par le mur d’origine', () => {
    const { objects: copies } = cloneAll(withDependencies(objs, ['OBJ-0001']), [translation(0, 3000)], 10, 1);
    const wall = copies.find(o => o.kind === 'wall')!;
    const door = copies.find(o => o.kind === 'opening');
    expect(door).toMatchObject({ hostId: wall.id });
    const { objects: viewCopies } = cloneAll(withDependencies(objs, ['OBJ-0003']), [translation(0, 3000)], 20, 1);
    expect(viewCopies.find(o => o.kind === 'views')).toMatchObject({ sourceId: viewCopies.find(o => o.kind === 'rect')!.id });
  });
});
