import { describe, expect, it } from 'vitest';
import type { WallObj } from '@/types/cad';
import { areaM2, centroid, detectRoom, roomFaces } from './rooms';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'm' };
let n = 0;
const wall = (x1: number, y1: number, x2: number, y2: number, thickness = 200): WallObj =>
  ({ ...base, id: `W${++n}`, kind: 'wall', x1, y1, x2, y2, thickness, justification: 'axe' });
/** Rectangle de murs (axes) de largeur a et profondeur b. */
const box = (x: number, y: number, a: number, b: number, t = 200) => [wall(x, y, x + a, y, t), wall(x + a, y, x + a, y + b, t), wall(x + a, y + b, x, y + b, t), wall(x, y + b, x, y, t)];

describe('pièces et surfaces', () => {
  it('pièce rectangulaire : intérieur 5,00 × 4,00 m = 20,00 m²', () => {
    const room = detectRoom(box(0, 0, 5200, 4200), { x: 2600, y: 2100 })!;
    expect(room).not.toBeNull();
    expect(areaM2(room)).toBeCloseTo(20, 2);
    expect(centroid(room).x).toBeCloseTo(2600, 6);
  });

  it('un point dans l’épaisseur d’un mur ou hors du bâtiment : pas de pièce', () => {
    const walls = box(0, 0, 5200, 4200);
    expect(detectRoom(walls, { x: 0, y: 2000 })).toBeNull();
    expect(detectRoom(walls, { x: -1000, y: 2000 })).toBeNull();
  });

  it('un refend en T partage la pièce en deux surfaces exactes', () => {
    const walls = [...box(0, 0, 8200, 4200), wall(3100, 0, 3100, 4200, 100)];
    const left = detectRoom(walls, { x: 1000, y: 2000 })!, right = detectRoom(walls, { x: 6000, y: 2000 })!;
    // Gauche : de 100 à 3050 (2,95 m) × 4,00 m ; droite : de 3150 à 8100 (4,95 m) × 4,00 m.
    expect(areaM2(left)).toBeCloseTo(11.8, 2);
    expect(areaM2(right)).toBeCloseTo(19.8, 2);
    expect(roomFaces(walls)).toHaveLength(2);
  });

  it('pièce en L : surface de référence', () => {
    // Axes : (0,0) (6200,0) (6200,3200) (3200,3200) (3200,5200) (0,5200), murs de 200.
    const pts = [[0, 0], [6200, 0], [6200, 3200], [3200, 3200], [3200, 5200], [0, 5200]];
    const walls = pts.map((p, i) => wall(p[0], p[1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]));
    const room = detectRoom(walls, { x: 1000, y: 1000 })!;
    // Intérieur : 6000 × 3000 + 3000 × 2000 (de y = 3100 à 5100, x de 100 à 3100) = 18 + 6 = 24 m².
    expect(areaM2(room)).toBeCloseTo(24, 2);
  });

  it('une porte ne coupe pas le contour de la pièce', () => {
    // La détection ignore les ouvertures (les faces sont prises sans baies).
    const room = detectRoom(box(0, 0, 4200, 3200), { x: 2000, y: 1500 })!;
    expect(areaM2(room)).toBeCloseTo(12, 2);
  });

  it('pièce ouverte (mur manquant) : non fermée', () => {
    const walls = box(0, 0, 4200, 3200).slice(0, 3);
    expect(detectRoom(walls, { x: 2000, y: 1500 })).toBeNull();
  });
});

describe('pièces : murs non joints', () => {
  it('mur décalé de 100 mm (angles non raccordés) : la pièce reste fermée et exacte', () => {
    const walls = [wall(0, 0, 5200, 0), wall(5300, 0, 5300, 4200), wall(5200, 4200, 0, 4200), wall(0, 4200, 0, 0)];
    // Intérieur : de x = 100 à 5200 (face gauche du mur est), de y = 100 à 4100 → 5,10 × 4,00 m.
    expect(areaM2(detectRoom(walls, { x: 2600, y: 2100 })!)).toBeCloseTo(20.4, 2);
  });
});
