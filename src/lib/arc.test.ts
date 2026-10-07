import { describe, expect, it } from 'vitest';
import { angleInArc, arcBounds, arcEndpoints, arcFrom3Points, arcFromCenter, arcLength, arcMidpoint, arcSweep, distanceToArc, norm360 } from './arc';

// Rappel : Y écran vers le bas ; angles DXF (Y vers le haut), sens trigonométrique.
describe('arcs', () => {
  const quarter = { cx: 0, cy: 0, r: 10, start: 0, end: 90 };

  it('place les extrémités et le milieu', () => {
    const [a, b] = arcEndpoints(quarter);
    expect(a.x).toBeCloseTo(10, 9); expect(a.y).toBeCloseTo(0, 9);
    expect(b.x).toBeCloseTo(0, 9); expect(b.y).toBeCloseTo(-10, 9); // 90° = vers le haut à l'écran
    const m = arcMidpoint(quarter);
    expect(m.x).toBeCloseTo(10 * Math.SQRT1_2, 9); expect(m.y).toBeCloseTo(-10 * Math.SQRT1_2, 9);
  });

  it('mesure ouverture et longueur, y compris en passant par 0°', () => {
    expect(arcSweep(quarter)).toBe(90);
    expect(arcSweep({ ...quarter, start: 300, end: 30 })).toBe(90);
    expect(arcLength(quarter)).toBeCloseTo(Math.PI * 5, 9);
    expect(angleInArc({ ...quarter, start: 300, end: 30 }, 350)).toBe(true);
    expect(angleInArc({ ...quarter, start: 300, end: 30 }, 100)).toBe(false);
  });

  it('calcule l’emprise avec les quadrants traversés', () => {
    const b = arcBounds({ cx: 0, cy: 0, r: 10, start: 45, end: 135 });
    expect(b.minY).toBeCloseTo(-10, 9); // passe par 90° (le haut)
    expect(b.maxY).toBeCloseTo(-10 * Math.SQRT1_2, 9);
    expect(b.minX).toBeCloseTo(-10 * Math.SQRT1_2, 9);
  });

  it('mesure la distance d’un point à l’arc', () => {
    expect(distanceToArc(quarter, 0, -12)).toBeCloseTo(2, 9);
    expect(distanceToArc(quarter, -10, 0)).toBeCloseTo(Math.hypot(10, 10), 9); // hors de l'arc : extrémité la plus proche
  });

  it('construit un arc par trois points, dans le sens qui passe par le point intermédiaire', () => {
    const a = arcFrom3Points({ x: 10, y: 0 }, { x: 0, y: -10 }, { x: -10, y: 0 })!;
    expect(a.cx).toBeCloseTo(0, 9); expect(a.cy).toBeCloseTo(0, 9); expect(a.r).toBeCloseTo(10, 9);
    expect(a.start).toBeCloseTo(0, 9); expect(a.end).toBeCloseTo(180, 9);
    const b = arcFrom3Points({ x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 })!;
    expect(b.start).toBeCloseTo(180, 9); expect(b.end).toBeCloseTo(0, 9); // passe par le bas : sens inverse
    expect(arcFrom3Points({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });

  it('construit un arc par le centre', () => {
    const a = arcFromCenter({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 20 })!;
    expect(a).toMatchObject({ cx: 0, cy: 0, r: 5, start: 0 });
    expect(a.end).toBeCloseTo(270, 9);
    expect(norm360(-90)).toBe(270);
  });
});
