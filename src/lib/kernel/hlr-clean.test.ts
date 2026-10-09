import { describe, expect, it } from 'vitest';
import { cleanProjection, simplify, uncovered } from './hlr-clean';

describe('vues projetées : nettoyage (lot 16.1)', () => {
  it('points alignés retirés (cercle vu par la tranche = segment), courbe conservée, points confondus fusionnés', () => {
    const edgeOn = Array.from({ length: 49 }, (_, i) => [40 + (20 * i) / 48, 0]).flat();
    expect(simplify(edgeOn)).toEqual([40, 0, 60, 0]);
    expect(simplify([0, 0, 0, 0, 10, 0])).toEqual([0, 0, 10, 0]);
    const arc = Array.from({ length: 9 }, (_, i) => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)]).flat();
    expect(simplify(arc)).toHaveLength(18);
    // Aller-retour sur la même droite : le point de rebroussement reste.
    expect(simplify([0, 0, 10, 0, 5, 0])).toEqual([0, 0, 10, 0, 5, 0]);
  });

  it('partie non recouverte d’un segment par des segments colinéaires', () => {
    expect(uncovered([0, 0, 100, 0], [[0, 0, 100, 0]])).toEqual([]);
    expect(uncovered([0, 0, 100, 0], [[100, 0, 0, 0]])).toEqual([]);
    expect(uncovered([0, 0, 100, 0], [[20, 0, 40, 0], [60, 0, 120, 0]])).toEqual([[0, 0, 20, 0], [40, 0, 60, 0]]);
    expect(uncovered([0, 0, 100, 0], [[0, 1, 100, 1]])).toEqual([[0, 0, 100, 0]]);
    expect(uncovered([0, 0, 0, 0], [])).toEqual([]);
  });

  it('cachée confondue avec une vue, ou en double : non dessinée', () => {
    const p = cleanProjection({
      visible: [[0, 0, 100, 0], [0, -20, 100, -20]],
      hidden: [[100, 0, 0, 0], [40, 0, 40, -20], [40, -20, 40, 0], [30, -20, 70, -20, 70, -10]],
    });
    expect(p.visible).toEqual([[0, 0, 100, 0], [0, -20, 100, -20]]);
    expect(p.hidden).toEqual([[40, 0, 40, -20], [70, -20, 70, -10]]);
  });
});
