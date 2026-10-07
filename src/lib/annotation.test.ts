import { describe, expect, it } from 'vitest';
import { PAPER_DIMENSION_STYLE, arrowHead, dashInModel, dimensionTextPosition, modelToPaperSize, paperToModelSize, strokeInModel } from './annotation';

const s50 = { paper: 1, model: 50 };
const s5 = { paper: 1, model: 5 };
const s5to1 = { paper: 5, model: 1 };

describe('annotations papier ↔ modèle', () => {
  it('un texte de 2,5 mm papier mesure 2,5 mm sur la feuille à toute échelle', () => {
    expect(paperToModelSize(2.5, s50)).toBe(125);
    expect(paperToModelSize(2.5, s5)).toBe(12.5);
    expect(paperToModelSize(2.5, s5to1)).toBe(0.5);
    for (const s of [s50, s5, s5to1]) expect(modelToPaperSize(paperToModelSize(2.5, s), s)).toBeCloseTo(2.5, 12);
  });

  it('épaisseur de trait tracée à sa valeur papier', () => {
    expect(strokeInModel(0.5, { paper: 1, model: 100 })).toBe(50);
    expect(modelToPaperSize(strokeInModel(0.35, s50), s50)).toBeCloseTo(0.35, 12);
  });

  it('motif ISO 128-2 en multiples de l’épaisseur, converti à l’échelle', () => {
    // 02 à 0,25 mm : trait 3 mm, espace 0,75 mm sur la feuille.
    expect(dashInModel('interrompu', 0.25, { paper: 1, model: 1 })).toEqual([3, 0.75]);
    expect(dashInModel('interrompu', 0.25, s50)).toEqual([150, 37.5]);
    expect(dashInModel('continu', 0.25, s50)).toBeUndefined();
  });

  it('flèche fermée de 2,5 mm à 30°', () => {
    const [tip, a, b] = arrowHead({ x: 0, y: 0 }, { x: -10, y: 0 }, 2.5, PAPER_DIMENSION_STYLE.arrowHalfWidth);
    expect(tip).toEqual({ x: 0, y: 0 });
    expect(a.x).toBeCloseTo(-2.5, 12);
    expect(Math.abs(a.y - b.y)).toBeCloseTo(2 * 2.5 * Math.tan(Math.PI / 12), 12);
    const halfAngle = Math.atan2(Math.abs(a.y), 2.5) * 180 / Math.PI;
    expect(halfAngle).toBeCloseTo(15, 9);
  });

  it('texte de cote au-dessus d’une cote horizontale, à droite d’une verticale', () => {
    expect(dimensionTextPosition({ x1: 0, y1: 0, x2: 100, y2: 0 }, 50)).toEqual({ x: 50, y: -50, anchor: 'middle' });
    expect(dimensionTextPosition({ x1: 0, y1: 0, x2: 0, y2: 100 }, 50)).toEqual({ x: 50, y: 50, anchor: 'start' });
  });
});
