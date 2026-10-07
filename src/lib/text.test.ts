import { describe, expect, it } from 'vitest';
import { normalizeAngle, pointInText, textBounds, textCorners, textLines, TEXT_CHAR_WIDTH, TEXT_LINE_SPACING } from './text';

const t = { x: 100, y: 200, content: 'ABCD', height: 10, rotation: 0, align: 'left' as const };

describe('géométrie du texte', () => {
  it('place la boîte au-dessus de la ligne de base, à partir du point d’insertion', () => {
    const b = textBounds(t);
    expect(b.minX).toBe(100);
    expect(b.maxX).toBeCloseTo(100 + 4 * 10 * TEXT_CHAR_WIDTH, 9);
    expect(b.minY).toBe(190);
    expect(b.maxY).toBeCloseTo(202.5, 9);
  });

  it('tient compte de l’alignement', () => {
    const w = 4 * 10 * TEXT_CHAR_WIDTH;
    expect(textBounds({ ...t, align: 'center' }).minX).toBeCloseTo(100 - w / 2, 9);
    expect(textBounds({ ...t, align: 'right' }).maxX).toBeCloseTo(100, 9);
  });

  it('empile les lignes vers le bas', () => {
    const b = textBounds({ ...t, content: 'A\nB\nC' });
    expect(b.maxY).toBeCloseTo(200 + 2 * 10 * TEXT_LINE_SPACING + 2.5, 9);
    expect(textLines('A\r\nB')).toEqual(['A', 'B']);
  });

  it('tourne dans le sens trigonométrique (repère DXF), donc vers le haut à l’écran', () => {
    const [topLeft, topRight] = textCorners({ ...t, rotation: 90 });
    // À 90°, le texte monte : le coin haut-droit est au-dessus du point d’insertion (Y écran plus petit).
    expect(topRight.y).toBeLessThan(t.y - 20);
    expect(topLeft.x).toBeCloseTo(t.x - 10, 9);
  });

  it('teste l’appartenance d’un point, rotation comprise', () => {
    expect(pointInText(t, 110, 195)).toBe(true);
    expect(pointInText(t, 110, 215)).toBe(false);
    const rotated = { ...t, rotation: 90 };
    expect(pointInText(rotated, 95, 180)).toBe(true);
    expect(pointInText(rotated, 120, 195)).toBe(false);
  });

  it('normalise les angles', () => {
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(-450)).toBe(-90);
    expect(normalizeAngle(180)).toBe(180);
  });
});
