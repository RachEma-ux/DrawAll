// Diagnostics du solveur DrawAll (lot 11.1) : redondance par contrainte entière, conflits multiples.
import { describe, expect, it } from 'vitest';
import type { Sketch } from './sketch';
import { solveSketch } from './solver';

const P = (id: string, x: number, y: number, fixed = false) => ({ id, x, y, ...(fixed ? { fixed } : {}) });

describe('solveur DrawAll — diagnostics', () => {
  it('coïncidence dont une seule équation est déjà imposée : pas redondante', () => {
    // a fixe ; ab horizontale impose déjà yb = ya ; la coïncidence de b sur c ajoute xb = xc.
    const s: Sketch = {
      points: [P('a', 0, 0, true), P('b', 10, 1), P('c', 12, 0, true)],
      lines: [{ id: 'ab', p1: 'a', p2: 'b' }], circles: [],
      constraints: [{ id: 'h', type: 'horizontal', line: 'ab' }, { id: 'k', type: 'coincident', a: 'b', b: 'c' }],
    };
    const r = solveSketch(s);
    expect(r.solved).toBe(true);
    expect(r.redundant).toEqual([]);
    expect(r.dof).toBe(0);
  });

  it('coïncidence entièrement imposée par ailleurs : redondante', () => {
    const s: Sketch = {
      points: [P('a', 0, 0, true), P('b', 10, 1)], lines: [], circles: [],
      constraints: [{ id: 'd', type: 'coincident', a: 'a', b: 'b' }, { id: 'k', type: 'coincident', a: 'b', b: 'a' }],
    };
    expect(solveSketch(s).redundant).toEqual(['k']);
  });

  it('deux conflits indépendants : les contraintes en cause de chacun sont nommées', () => {
    // Deux paires de points fixes que des coïncidences voudraient confondre : deux conflits séparés.
    const s: Sketch = {
      points: [P('a', 0, 0, true), P('b', 5, 0, true), P('c', 100, 0, true), P('d', 105, 0, true), P('m', 2, 1), P('n', 102, 1)],
      lines: [], circles: [],
      constraints: [
        { id: 'am', type: 'coincident', a: 'a', b: 'm' }, { id: 'bm', type: 'coincident', a: 'b', b: 'm' },
        { id: 'cn', type: 'coincident', a: 'c', b: 'n' }, { id: 'dn', type: 'coincident', a: 'd', b: 'n' },
      ],
    };
    const r = solveSketch(s);
    expect(r.solved).toBe(false);
    expect(r.conflicting).toEqual(['am', 'bm', 'cn', 'dn']);
    expect(r.redundant).toEqual([]);
  });
});
