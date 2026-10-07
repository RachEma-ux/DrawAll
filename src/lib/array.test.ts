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
