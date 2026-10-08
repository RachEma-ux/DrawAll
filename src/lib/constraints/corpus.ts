// Corpus de l'essai P0 du solveur (lot 11.1) : cas bien, sous- et sur-contraints, cas difficiles.
// Chaque cas porte le résultat attendu (soluble, degrés de liberté, contraintes en cause).
import type { Constraint, Sketch } from './sketch';

export interface Case {
  name: string;
  sketch: Sketch;
  expect: { solved: boolean; dof?: number; redundant?: string[]; conflicting?: string[] };
  /** Vérification géométrique propre au cas (indépendante des solveurs). */
  check?: (s: Sketch) => boolean;
}

const P = (id: string, x: number, y: number, fixed = false) => ({ id, x, y, ...(fixed ? { fixed } : {}) });
const L = (id: string, p1: string, p2: string) => ({ id, p1, p2 });
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const pt = (s: Sketch, id: string) => s.points.find(p => p.id === id)!;

/** Rectangle esquissé de travers : quatre segments raccordés. */
function rectangle(extra: Constraint[], fixedOrigin = true): Sketch {
  return {
    points: [P('a', 0, 0, fixedOrigin), P('b', 97, 4), P('c', 103, 58), P('d', -3, 52)],
    lines: [L('ab', 'a', 'b'), L('bc', 'b', 'c'), L('cd', 'c', 'd'), L('da', 'd', 'a')],
    circles: [],
    constraints: [
      { id: 'h1', type: 'horizontal', line: 'ab' },
      { id: 'v1', type: 'vertical', line: 'bc' },
      { id: 'h2', type: 'horizontal', line: 'cd' },
      { id: 'v2', type: 'vertical', line: 'da' },
      ...extra,
    ],
  };
}

export const CORPUS: Case[] = [
  {
    name: 'rectangle entièrement contraint (origine fixe, 100 × 60)',
    sketch: rectangle([{ id: 'w', type: 'length', line: 'ab', value: 100 }, { id: 'h', type: 'length', line: 'bc', value: 60 }]),
    expect: { solved: true, dof: 0, redundant: [], conflicting: [] },
    check: s => near(pt(s, 'c').x, 100) && near(Math.abs(pt(s, 'c').y), 60),
  },
  {
    name: 'rectangle sous-contraint (largeur seule) : 1 degré de liberté',
    sketch: rectangle([{ id: 'w', type: 'length', line: 'ab', value: 100 }]),
    expect: { solved: true, dof: 1, redundant: [], conflicting: [] },
  },
  {
    name: 'rectangle sur-contraint cohérent (largeur répétée par une égalité) : redondance',
    sketch: rectangle([
      { id: 'w', type: 'length', line: 'ab', value: 100 }, { id: 'h', type: 'length', line: 'bc', value: 60 },
      { id: 'w2', type: 'length', line: 'cd', value: 100 },
    ]),
    expect: { solved: true, dof: 0, redundant: ['w2'], conflicting: [] },
  },
  {
    name: 'rectangle en conflit (largeur 100 et longueur opposée 120)',
    sketch: rectangle([
      { id: 'w', type: 'length', line: 'ab', value: 100 }, { id: 'h', type: 'length', line: 'bc', value: 60 },
      { id: 'w2', type: 'length', line: 'cd', value: 120 },
    ]),
    expect: { solved: false },
  },
  {
    name: 'droite tangente à un cercle de rayon 25 (centre fixe), perpendiculaire à un axe fixe',
    sketch: {
      points: [P('o', 0, 0, true), P('p', -50, 30), P('q', 50, 33), P('u', 0, 0, true), P('v', 0, 100, true)],
      lines: [L('t', 'p', 'q'), L('axe', 'u', 'v')],
      circles: [{ id: 'c', c: 'o', r: 20 }],
      constraints: [
        { id: 'r', type: 'radius', circle: 'c', value: 25 },
        { id: 'tg', type: 'tangent', line: 't', circle: 'c' },
        { id: 'pp', type: 'perpendicular', l1: 't', l2: 'axe' },
        { id: 'len', type: 'length', line: 't', value: 100 },
        { id: 'sym', type: 'pointOnLine', point: 'p', line: 'axe' },
      ],
    },
    expect: { solved: true, dof: 0 },
    check: s => near(Math.abs(pt(s, 'p').y), 25) && near(Math.abs(pt(s, 'q').y), 25) && near(s.circles[0].r, 25),
  },
  {
    name: 'angle de 30° entre deux segments de longueur imposée',
    sketch: {
      points: [P('a', 0, 0, true), P('b', 100, 0, true), P('c', 80, 40)],
      lines: [L('ab', 'a', 'b'), L('ac', 'a', 'c')],
      circles: [],
      constraints: [{ id: 'ang', type: 'angle', l1: 'ab', l2: 'ac', value: 30 }, { id: 'len', type: 'length', line: 'ac', value: 50 }],
    },
    expect: { solved: true, dof: 0 },
    check: s => near(pt(s, 'c').x, 50 * Math.cos(Math.PI / 6), 1e-5) && near(Math.abs(pt(s, 'c').y), 25, 1e-5),
  },
];

/** Grande esquisse : chaîne de n segments (longueurs et angles imposés), pour mesurer le temps. */
export function chain(n: number): Sketch {
  const points = [P('p0', 0, 0, true), ...Array.from({ length: n }, (_, i) => P(`p${i + 1}`, (i + 1) * 9.7, (i % 2) * 3))];
  const lines = Array.from({ length: n }, (_, i) => L(`s${i}`, `p${i}`, `p${i + 1}`));
  const constraints: Constraint[] = [
    { id: 'h0', type: 'horizontal', line: 's0' },
    ...lines.map((l, i) => ({ id: `len${i}`, type: 'length' as const, line: l.id, value: 10 })),
    ...lines.slice(1).map((l, i) => ({ id: `ang${i}`, type: 'angle' as const, l1: lines[i].id, l2: l.id, value: 5 })),
  ];
  return { points, lines, circles: [], constraints };
}

/** Chaîne déjà résolue (positions exactes) : point de départ d'une re-résolution « à chaud ». */
export function chainSolved(n: number): Sketch {
  const s = chain(n);
  let x = 0, y = 0, theta = 0;
  s.points[0] = { ...s.points[0], x: 0, y: 0 };
  for (let i = 1; i <= n; i++) {
    if (i > 1) theta += (5 * Math.PI) / 180; // angle orienté de 5° entre segments successifs
    x += 10 * Math.cos(theta); y += 10 * Math.sin(theta);
    s.points[i] = { ...s.points[i], x, y };
  }
  return s;
}
