import { describe, expect, it } from 'vitest';
import type { LineObj } from '@/types/cad';
import { arcPointAt, arcSweep } from './arc';
import { chamferLines, filletLines } from './fillet';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
const line = (id: string, x1: number, y1: number, x2: number, y2: number): LineObj => ({ ...base, id, kind: 'line', x1, y1, x2, y2 });

/** Égalité à 10⁻⁹ près, champ par champ. */
const expectClose = (got: object | undefined, want: Record<string, number>) => {
  expect(Object.keys(got ?? {}).sort()).toEqual(Object.keys(want).sort());
  for (const [k, v] of Object.entries(want)) expect((got as Record<string, number>)[k]).toBeCloseTo(v, 9);
};

/** Distance d'un point à la droite portée par la ligne. */
const distToLine = (l: LineObj, p: { x: number; y: number }) =>
  Math.abs((l.x2 - l.x1) * (l.y1 - p.y) - (l.x1 - p.x) * (l.y2 - l.y1)) / Math.hypot(l.x2 - l.x1, l.y2 - l.y1);

describe('congé', () => {
  // Coin en L : horizontale de (0,0) à (100,0), verticale de (100,0) à (100,100).
  const h = line('H', 0, 0, 100, 0);
  const v = line('V', 100, 0, 100, 100);

  it('raccorde deux lignes à angle droit par un arc tangent à 10⁻⁶ mm', () => {
    const out = filletLines(h, { x: 20, y: 0 }, v, { x: 100, y: 80 }, 10);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { patchA, patchB, arc } = out.result;
    const c = { x: arc!.cx, y: arc!.cy };
    expectClose(patchA, { x2: 90, y2: 0 });
    expectClose(patchB, { x1: 100, y1: 10 });
    expect(arc!.cx).toBeCloseTo(90, 9);
    expect(arc!.cy).toBeCloseTo(10, 9);
    expect(arcSweep(arc!)).toBeCloseTo(90, 6);
    // Tangence : le centre est à r des deux droites et les extrémités de l'arc sont les points de raccord.
    expect(Math.abs(distToLine(h, c) - 10)).toBeLessThan(1e-6);
    expect(Math.abs(distToLine(v, c) - 10)).toBeLessThan(1e-6);
    const ends = [arcPointAt(arc!, arc!.start), arcPointAt(arc!, arc!.end)];
    const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;
    expect(ends.some(p => near(p, { x: 90, y: 0 }))).toBe(true);
    expect(ends.some(p => near(p, { x: 100, y: 10 }))).toBe(true);
  });

  it('tient la tangence sur un angle quelconque et des lignes qui se croisent', () => {
    const a = line('A', -50, 0, 200, 0);
    const b = line('B', 0, -50, 150, 100); // 45°, coupe A en (50, 0)
    const out = filletLines(a, { x: 150, y: 0 }, b, { x: 120, y: 70 }, 15);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const { patchA, patchB, arc } = out.result;
    const c = { x: arc!.cx, y: arc!.cy };
    expect(Math.abs(distToLine(a, c) - 15)).toBeLessThan(1e-6);
    expect(Math.abs(distToLine(b, c) - 15)).toBeLessThan(1e-6);
    // Les bouts du côté non désigné (avant l'intersection) disparaissent.
    expect('x1' in patchA).toBe(true);
    expect('x1' in patchB).toBe(true);
    expect(arcSweep(arc!)).toBeCloseTo(135, 6);
  });

  it('prolonge deux lignes qui ne se touchent pas jusqu’au raccord', () => {
    const a = line('A', 0, 0, 80, 0);
    const b = line('B', 100, 20, 100, 100);
    const out = filletLines(a, { x: 10, y: 0 }, b, { x: 100, y: 90 }, 5);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expectClose(out.result.patchA, { x2: 95, y2: 0 });
    expectClose(out.result.patchB, { x1: 100, y1: 5 });
  });

  it('rayon nul : coin vif à l’intersection', () => {
    const out = filletLines(line('A', 0, 0, 80, 0), { x: 10, y: 0 }, line('B', 100, 20, 100, 100), { x: 100, y: 90 }, 0);
    expect(out.ok && out.result).toEqual({ patchA: { x2: 100, y2: 0 }, patchB: { x1: 100, y1: 0 } });
  });

  it('refuse un rayon trop grand avec un message', () => {
    const out = filletLines(h, { x: 20, y: 0 }, v, { x: 100, y: 80 }, 150);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/Rayon trop grand/);
    expect(out.error).toMatch(/au plus 100 mm/);
  });

  it('refuse des lignes parallèles', () => {
    const out = filletLines(h, { x: 0, y: 0 }, line('P', 0, 10, 100, 10), { x: 0, y: 10 }, 5);
    expect(out).toEqual({ ok: false, error: expect.stringMatching(/parallèles/) });
  });

  it('refuse une même ligne désignée deux fois', () => {
    expect(filletLines(h, { x: 0, y: 0 }, h, { x: 50, y: 0 }, 5).ok).toBe(false);
  });
});

describe('chanfrein', () => {
  const h = line('H', 0, 0, 100, 0);
  const v = line('V', 100, 0, 100, 100);

  it('coupe le coin à des distances différentes sur chaque ligne', () => {
    const out = chamferLines(h, { x: 20, y: 0 }, v, { x: 100, y: 80 }, 10, 20);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expectClose(out.result.patchA, { x2: 90, y2: 0 });
    expectClose(out.result.patchB, { x1: 100, y1: 20 });
    expectClose(out.result.line, { x1: 90, y1: 0, x2: 100, y2: 20 });
  });

  it('refuse une distance trop grande', () => {
    const out = chamferLines(h, { x: 20, y: 0 }, v, { x: 100, y: 80 }, 120, 10);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/première ligne/);
  });

  it('refuse une seule distance nulle', () => {
    expect(chamferLines(h, { x: 20, y: 0 }, v, { x: 100, y: 80 }, 0, 10).ok).toBe(false);
  });
});
