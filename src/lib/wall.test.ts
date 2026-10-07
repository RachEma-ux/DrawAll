import { describe, expect, it } from 'vitest';
import type { WallObj } from '@/types/cad';
import { faceOffsets, wallsGeometry, type Pt } from './wall';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'm' };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, thickness = 200, justification: WallObj['justification'] = 'axe'): WallObj =>
  ({ ...base, id, kind: 'wall', x1, y1, x2, y2, thickness, justification });

type Seg = [Pt, Pt];
const segs = (g: ReturnType<typeof wallsGeometry>) => [...g.values()].flatMap(v => v.edges);
const len = (s: Seg[]) => s.reduce((a, [p, q]) => a + Math.hypot(q.x - p.x, q.y - p.y), 0);
/** Un trait passe-t-il par le point (à 10⁻⁶ près) ? */
const covers = (s: Seg[], p: Pt) => s.some(([a, b]) => {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const c = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / l;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (l * l);
  return c < 1e-6 && t > -1e-9 && t < 1 + 1e-9;
});

describe('murs : justification', () => {
  it('axe, nu gauche, nu droit', () => {
    expect(faceOffsets({ thickness: 200, justification: 'axe' })).toEqual({ left: 100, right: 100 });
    expect(faceOffsets({ thickness: 200, justification: 'gauche' })).toEqual({ left: 0, right: 200 });
    expect(faceOffsets({ thickness: 200, justification: 'droite' })).toEqual({ left: 200, right: 0 });
  });

  it('mur seul : deux faces et deux abouts', () => {
    const g = wallsGeometry([wall('A', 0, 0, 1000, 0)]);
    const s = segs(g);
    expect(s).toHaveLength(4);
    expect(len(s)).toBeCloseTo(2 * 1000 + 2 * 200, 9);
    // Face gauche (vers le haut à l'écran) en y = −100.
    expect(covers(s, { x: 500, y: -100 })).toBe(true);
  });
});

describe('murs : jonctions', () => {
  it('L : angle extérieur fermé, angle intérieur net, pas de trait dans la jonction', () => {
    const s = segs(wallsGeometry([wall('A', 0, 0, 5000, 0), wall('B', 5000, 0, 5000, 3000)]));
    // Angle extérieur en (5100 ; −100), angle intérieur en (4900 ; 100).
    expect(covers(s, { x: 5100, y: -100 })).toBe(true);
    expect(covers(s, { x: 4900, y: 100 })).toBe(true);
    // Aucun trait à l'intérieur du carré de jonction.
    expect(covers(s, { x: 5000, y: 0 })).toBe(false);
    expect(covers(s, { x: 5000, y: 50 })).toBe(false);
    // Longueur visible : faces extérieures 5100 + 3100, intérieures 4900 + 2900, abouts libres 200 + 200.
    expect(len(s)).toBeCloseTo(5100 + 3100 + 4900 + 2900 + 400, 6);
  });

  it('L à angle quelconque : faces prolongées jusqu’à leur intersection', () => {
    const s = segs(wallsGeometry([wall('A', 0, 0, 3000, 0), wall('B', 3000, 0, 4000, -2000)]));
    expect(covers(s, { x: 3000, y: 0 })).toBe(false);
    // A tourne à gauche vers B : angle extérieur du côté droit (y = 100), intérieur du côté gauche (y = −100).
    // Intersections des faces : (3000 + 100·(2 − √5)/… ) calculées ici à partir des droites des faces.
    const n = Math.hypot(1000, 2000), u = { x: 1000 / n, y: -2000 / n }, l = { x: u.y, y: -u.x };
    const onFace = (side: 1 | -1, y: number) => {
      const p = { x: 3000 + side * 100 * l.x, y: side * 100 * l.y };
      const t = (y - p.y) / u.y;
      return { x: p.x + t * u.x, y };
    };
    expect(covers(s, onFace(-1, 100))).toBe(true);   // angle extérieur
    expect(covers(s, onFace(1, -100))).toBe(true);   // angle intérieur
    expect(covers(s, { x: 3000, y: 50 })).toBe(false);
  });

  it('T : le mur en attente s’arrête sur la face du mur porteur, qui reste ouverte en face de lui', () => {
    const s = segs(wallsGeometry([wall('H', 0, 0, 6000, 0), wall('S', 3000, 0, 3000, 2500)]));
    // Face basse du porteur (y = 100) coupée entre x = 2900 et 3100.
    expect(covers(s, { x: 3000, y: 100 })).toBe(false);
    expect(covers(s, { x: 2000, y: 100 })).toBe(true);
    // Face haute du porteur (y = −100) continue.
    expect(covers(s, { x: 3000, y: -100 })).toBe(true);
    // Les faces du mur en attente démarrent à la face du porteur.
    expect(covers(s, { x: 2900, y: 100.5 })).toBe(true);
    expect(covers(s, { x: 2900, y: 50 })).toBe(false);
  });

  it('T avec extrémité tracée sur la face (et non sur l’axe) : même résultat', () => {
    const s = segs(wallsGeometry([wall('H', 0, 0, 6000, 0), wall('S', 3000, 100, 3000, 2500)]));
    expect(covers(s, { x: 3000, y: 100 })).toBe(false);
    expect(covers(s, { x: 2900, y: 50 })).toBe(false);
  });

  it('croix : aucune face ne traverse le carrefour', () => {
    const s = segs(wallsGeometry([wall('H', 0, 0, 4000, 0), wall('V', 2000, -2000, 2000, 2000)]));
    expect(covers(s, { x: 2000, y: 100 })).toBe(false);
    expect(covers(s, { x: 2000, y: -100 })).toBe(false);
    expect(covers(s, { x: 2100, y: 0 })).toBe(false);
    expect(covers(s, { x: 1900, y: 0 })).toBe(false);
    // Les quatre angles du carrefour sont des extrémités de traits.
    for (const p of [{ x: 1900, y: -100 }, { x: 2100, y: -100 }, { x: 1900, y: 100 }, { x: 2100, y: 100 }]) expect(covers(s, p)).toBe(true);
  });

  it('nœud de trois murs : aucun trait à l’intérieur des murs', () => {
    const s = segs(wallsGeometry([wall('A', 0, 0, 3000, 0), wall('B', 3000, 0, 3000, 2000), wall('C', 3000, 0, 5000, -1500)]));
    // Le centre du nœud et l'intérieur de chaque mur près du nœud restent vides.
    expect(covers(s, { x: 3000, y: 0 })).toBe(false);
    expect(covers(s, { x: 2950, y: 0 })).toBe(false);
    expect(covers(s, { x: 3000, y: 50 })).toBe(false);
  });

  it('continuation dans l’alignement : pas d’about entre les deux murs', () => {
    const s = segs(wallsGeometry([wall('A', 0, 0, 2000, 0), wall('B', 2000, 0, 5000, 0)]));
    expect(covers(s, { x: 2000, y: 0 })).toBe(false);
    expect(len(s)).toBeCloseTo(2 * 5000 + 2 * 200, 6);
  });

  it('justification au nu : L entre deux murs tracés sur leur face intérieure', () => {
    // Tracé sur les faces intérieures (sens horaire) : le mur s'étend à gauche du tracé.
    const s = segs(wallsGeometry([wall('A', 0, 0, 5000, 0, 200, 'droite'), wall('B', 5000, 0, 5000, 3000, 200, 'droite')]));
    expect(covers(s, { x: 5000, y: 0 })).toBe(true);        // angle intérieur sur le tracé
    expect(covers(s, { x: 5200, y: -200 })).toBe(true);     // angle extérieur
  });
});
