import { describe, expect, it } from 'vitest';
import { distanceToSymbol, levelMarkGeometry, levelMarkText, northGeometry, roughnessGeometry, sectionGeometry, SYMBOL_PAPER } from './symbols';
import { BUILDING_LIBRARY, libraryBlock } from './library';
import { mirrorObject, rotateObject } from './geometry';
import type { CadObject } from '@/types/cad';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('symboles (lot 4.5)', () => {
  it('nord : flèche vers le haut de l’écran, tournée dans le sens antihoraire', () => {
    const g = northGeometry({ x: 100, y: 100, rotation: 0 }, 50);
    const tip = g.fills[0][0];
    close(tip.x, 100); close(tip.y, 100 - SYMBOL_PAPER.northRadius * 50);
    expect(g.circles[0].r).toBe(300);              // 6 mm papier au 1:50
    expect(g.texts[0].text).toBe('N');
    const g90 = northGeometry({ x: 0, y: 0, rotation: 90 }, 1);
    close(g90.fills[0][0].x, -6); close(g90.fills[0][0].y, 0); // nord à gauche
  });

  it('repère de coupe : flèches du côté de la vue, inversées par « flip », repère à chaque extrémité', () => {
    const g = sectionGeometry({ x1: 0, y1: 0, x2: 1000, y2: 0, label: 'B' }, 1)!;
    // Trait vers +X : la gauche à l'écran est vers le haut (Y négatif).
    expect(g.fills.every(f => f[0].y < 0)).toBe(true);
    expect(g.texts.map(t => t.text)).toEqual(['B', 'B']);
    expect(g.lines.filter(l => l.dash)).toHaveLength(1);
    expect(g.lines.filter(l => l.weight === 'fort').length).toBeGreaterThanOrEqual(2);
    const f = sectionGeometry({ x1: 0, y1: 0, x2: 1000, y2: 0, label: 'B', flip: true }, 1)!;
    expect(f.fills.every(p => p[0].y > 0)).toBe(true);
    expect(sectionGeometry({ x1: 5, y1: 5, x2: 5, y2: 5, label: 'A' }, 1)).toBeNull();
  });

  it('cote de niveau : valeur signée en mètres, pointe sur le point', () => {
    expect(levelMarkText(2800)).toBe('+2,80');
    expect(levelMarkText(0)).toBe('±0,00');
    expect(levelMarkText(-450)).toBe('−0,45');
    const g = levelMarkGeometry({ x: 10, y: 20, elevation: 2800 }, 100);
    expect(g.fills[0][0]).toEqual({ x: 10, y: 20 });
    expect(g.texts[0].height).toBe(250);
  });

  it('distance au symbole pour la désignation', () => {
    const g = sectionGeometry({ x1: 0, y1: 0, x2: 1000, y2: 0, label: 'A' }, 1)!;
    expect(distanceToSymbol(g, { x: 500, y: 0 })).toBe(0);
    expect(distanceToSymbol(g, { x: 500, y: 50 })).toBeGreaterThan(40);
  });

  it('rotation et symétrie : le nord tourne, la coupe change de côté', () => {
    const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'n' };
    const north: CadObject = { ...base, id: 'OBJ-0001', kind: 'north', x: 0, y: 0, rotation: 0 };
    expect(rotateObject(north, 0, 0, 90)).toMatchObject({ rotation: -90 });
    expect(mirrorObject(north, 'y', 0)).toMatchObject({ rotation: 180 });
    const section: CadObject = { ...base, id: 'OBJ-0002', kind: 'section', x1: 0, y1: 0, x2: 10, y2: 0, label: 'A' };
    expect(mirrorObject(section, 'x', 5)).toMatchObject({ x1: 10, x2: 0, flip: true });
  });
});

describe('bibliothèque bâtiment (lot 4.5)', () => {
  it('gabarits : primitives valides, identifiants du bloc, source indiquée', () => {
    expect(BUILDING_LIBRARY.length).toBeGreaterThanOrEqual(6);
    for (const it of BUILDING_LIBRARY) {
      const b = libraryBlock(it, 'BLQ-0009', 'LAY-0004');
      expect(b.libraryKey).toBe(it.key);
      expect(b.description).toMatch(/non normatifs/);
      expect(b.primitives.length).toBeGreaterThan(0);
      expect(new Set(b.primitives.map(p => p.id)).size).toBe(b.primitives.length);
      expect(b.primitives.every(p => p.layerId === 'LAY-0004' && p.id.startsWith('BLQ-0009-P'))).toBe(true);
    }
  });
});

describe('état de surface (lot 5.1)', () => {
  it('pointe sur la surface, traits à 60°, barre ou cercle selon le procédé, Ra sous le trait d’appui', () => {
    const g = roughnessGeometry({ x: 0, y: 0, rotation: 0, process: 'enlevement', ra: 3.2 }, 1);
    const [short, long] = g.lines;
    expect(short.a).toEqual({ x: 0, y: 0 });
    close(Math.atan2(-short.b.y, -short.b.x) * 180 / Math.PI, 60);
    close(Math.atan2(-long.b.y, long.b.x) * 180 / Math.PI, 60);
    close(-short.b.y, SYMBOL_PAPER.roughH1);
    close(-long.b.y, SYMBOL_PAPER.roughH2);
    // Barre horizontale fermant le trait court ; trait d'appui ; texte « Ra 3,2 » sous ce trait.
    close(g.lines[2].a.y, g.lines[2].b.y);
    expect(g.texts[0].text).toBe('Ra 3,2');
    expect(g.texts[0].at.y).toBeGreaterThan(-SYMBOL_PAPER.roughH2);
    const none = roughnessGeometry({ x: 0, y: 0, rotation: 0, process: 'sans-enlevement' }, 1);
    expect(none.circles).toHaveLength(1);
    expect(none.texts).toHaveLength(0);
    expect(roughnessGeometry({ x: 0, y: 0, rotation: 0, process: 'quelconque' }, 1).lines).toHaveLength(2);
  });
});
