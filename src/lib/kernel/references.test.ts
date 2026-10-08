// Essai P0 — références topologiques (lot 11.3). Une opération qui vise une arête ou une face
// (congé, coque ouverte) est rejouée après une modification amont : la référence est conservée
// (et l'opération porte sur le bon élément : position et volume vérifiés indépendamment) ou signalée
// « à réparer » ; jamais réattribuée en silence.
// Avec P0_REPORT=<fichier>, le compte rendu est écrit (docs/p0/11.3-references-mesures.json).
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadKernel, UnresolvedReferenceError } from './occt';
import type { EdgeRef, FaceRef, SolidRecipe, Vec3 } from './recipe';
import { featureSupports, pointOnSupport, supportOf } from './references';

const B = (x = 100, y = 50, z = 20): SolidRecipe => ({ op: 'box', name: 'B', x, y, z });
const face = (feature: string, role: string): FaceRef => ({ feature, role });
const edge = (a: FaceRef, b: FaceRef): EdgeRef => ({ faces: [a, b] });
const fillet = (of: SolidRecipe, r: number, ...edges: EdgeRef[]): SolidRecipe => ({ op: 'fillet', of, r, edges });
const cut = (a: SolidRecipe, b: SolidRecipe): SolidRecipe => ({ op: 'cut', a, b });
const slab = (x: number, y: number, z: number, at: Vec3): SolidRecipe => ({ op: 'box', name: 'R', x, y, z, at });
const hole = (r = 10): SolidRecipe => ({ op: 'cylinder', name: 'H', r, h: 40, at: [50, 25, -10] });

/** Matière retirée (arête saillante) ou ajoutée (arête rentrante) par un congé de rayon r, par mm d'arête droite. */
const k = (r: number) => r * r * (1 - Math.PI / 4);
/** Congé r sur le bord d'un trou de rayon R (théorème de Pappus sur la section retirée). */
const rimFillet = (r: number, R: number) => k(r) * 2 * Math.PI * (R + (r * (5 / 6 - Math.PI / 4)) / (1 - Math.PI / 4));

const TOP_RIGHT = edge(face('B', 'zmax'), face('B', 'xmax'));
const L = [[0, 0], [60, 0], [60, 10], [10, 10], [10, 40], [0, 40]] as [number, number][];
const extrude = (profile: [number, number][], segmentIds?: string[]): SolidRecipe => ({ op: 'extrude', name: 'P', profile, height: 25, ...(segmentIds ? { segmentIds } : {}) });
const INNER = edge(face('P', 'side:s2'), face('P', 'side:s3'));
const lArea = (60 * 10 + 10 * 30) * 25;

interface Case {
  name: string;
  /** Modification amont rejouée (vide : état de départ). */
  change: string;
  recipe: SolidRecipe;
  expect: 'conservée' | 'à réparer';
  /** Conservée : position attendue de l'élément visé (milieu d'arête, centre de face) et volume attendu. */
  at?: Vec3;
  volume?: number;
  /** Conservée, arête courbe : contrôle de la position de son milieu. */
  check?: (p: Vec3) => boolean;
  /** À réparer : début de la raison attendue. */
  reason?: string;
  /** Série (même référence avant et après modification) pour comparer le rang du noyau. */
  series?: string;
}

const CASES: Case[] = [
  { series: 'pavé', name: 'congé R 5 sur l’arête dessus ∩ droite', change: '—', recipe: fillet(B(), 5, TOP_RIGHT), expect: 'conservée', at: [100, 25, 20], volume: 100000 - k(5) * 50 },
  { series: 'pavé', name: 'même congé', change: 'pavé redimensionné en 120 × 60 × 30', recipe: fillet(B(120, 60, 30), 5, TOP_RIGHT), expect: 'conservée', at: [120, 30, 30], volume: 120 * 60 * 30 - k(5) * 60 },
  { series: 'pavé', name: 'même congé', change: 'perçage Ø 20 ajouté en amont', recipe: fillet(cut(B(), hole()), 5, TOP_RIGHT), expect: 'conservée', at: [100, 25, 20], volume: 100000 - Math.PI * 100 * 20 - k(5) * 50 },
  { series: 'pavé', name: 'même congé', change: 'rainure selon Y : le dessus est coupé en deux, l’arête reste entière', recipe: fillet(cut(B(), slab(20, 70, 20, [40, -10, 10])), 5, TOP_RIGHT), expect: 'conservée', at: [100, 25, 20], volume: 100000 - 20 * 50 * 10 - k(5) * 50 },
  { name: 'même congé', change: 'rainure selon X : l’arête est coupée en deux', recipe: fillet(cut(B(), slab(120, 10, 20, [-10, 20, 10])), 5, TOP_RIGHT), expect: 'à réparer', reason: 'arête partagée en 2 morceaux' },
  { name: 'même congé', change: 'coin enlevé : dessus et droite ne se touchent plus', recipe: fillet(cut(B(), slab(20, 70, 10, [90, -10, 15])), 5, TOP_RIGHT), expect: 'à réparer', reason: 'les deux faces ne se touchent plus' },
  { name: 'même congé', change: 'fonction renommée (B → C)', recipe: fillet({ op: 'box', name: 'C', x: 100, y: 50, z: 20 }, 5, TOP_RIGHT), expect: 'à réparer', reason: 'fonction « B » absente' },
  { name: 'congé sur l’arête dessus ∩ gauche', change: 'pavé accolé à droite (union) : le dessus fusionne avec celui du voisin', recipe: fillet({ op: 'union', a: B(), b: { op: 'box', name: 'D', x: 100, y: 50, z: 20, at: [100, 0, 0] } }, 5, edge(face('B', 'zmax'), face('B', 'xmin'))), expect: 'à réparer', reason: 'face disparue' },
  { series: 'trou', name: 'congé R 2 sur le bord supérieur du perçage', change: '—', recipe: fillet(cut(B(), hole()), 2, edge(face('B', 'zmax'), face('H', 'wall'))), expect: 'conservée', check: (p: Vec3) => Math.abs(p[2] - 20) < 1e-6 && Math.abs(Math.hypot(p[0] - 50, p[1] - 25) - 10) < 1e-6, volume: 100000 - Math.PI * 100 * 20 - rimFillet(2, 10) },
  { series: 'trou', name: 'même congé', change: 'perçage agrandi à Ø 30', recipe: fillet(cut(B(), hole(15)), 2, edge(face('B', 'zmax'), face('H', 'wall'))), expect: 'conservée', check: (p: Vec3) => Math.abs(p[2] - 20) < 1e-6 && Math.abs(Math.hypot(p[0] - 50, p[1] - 25) - 15) < 1e-6, volume: 100000 - Math.PI * 225 * 20 - rimFillet(2, 15) },
  { series: 'L', name: 'congé R 3 sur l’arête rentrante d’un profil en L', change: '—', recipe: fillet(extrude(L), 3, INNER), expect: 'conservée', at: [10, 10, 12.5], volume: lArea + k(3) * 25 },
  { series: 'L', name: 'même congé', change: 'profil redimensionné', recipe: fillet(extrude([[0, 0], [80, 0], [80, 15], [15, 15], [15, 50], [0, 50]]), 3, INNER), expect: 'conservée', at: [15, 15, 12.5], volume: (80 * 15 + 15 * 35) * 25 + k(3) * 25 },
  { series: 'L', name: 'même congé', change: 'sommet inséré dans un autre segment (rangs décalés)', recipe: fillet(extrude([[0, 0], [30, 0], [60, 0], [60, 10], [10, 10], [10, 40], [0, 40]], ['s0', 's0b', 's1', 's2', 's3', 's4', 's5']), 3, INNER), expect: 'conservée', at: [10, 10, 12.5], volume: lArea + k(3) * 25 },
  { series: 'L', name: 'même congé', change: 'contour commencé à un autre sommet', recipe: fillet(extrude([...L.slice(3), ...L.slice(0, 3)], ['s3', 's4', 's5', 's0', 's1', 's2']), 3, INNER), expect: 'conservée', at: [10, 10, 12.5], volume: lArea + k(3) * 25 },
  { name: 'même congé', change: 'segment visé coupé en deux : le coin appartient au nouveau morceau', recipe: fillet(extrude([[0, 0], [60, 0], [60, 10], [35, 10], [10, 10], [10, 40], [0, 40]], ['s0', 's1', 's2', 's2b', 's3', 's4', 's5']), 3, INNER), expect: 'à réparer', reason: 'les deux faces ne se touchent plus' },
  { series: 'coque', name: 'coque de 2 mm ouverte sur la face avant (Y min)', change: '—', recipe: { op: 'shell', of: B(), thickness: 2, open: face('B', 'ymin') }, expect: 'conservée', at: [50, 0, 10], volume: 100000 - 96 * 48 * 16 },
  { series: 'coque', name: 'même coque', change: 'pavé redimensionné en 120 × 60 × 30', recipe: { op: 'shell', of: B(120, 60, 30), thickness: 2, open: face('B', 'ymin') }, expect: 'conservée', at: [60, 0, 15], volume: 120 * 60 * 30 - 116 * 58 * 26 },
  { name: 'coque ouverte sur la base du cylindre soustrait', change: 'cylindre écarté du pavé : sa base a disparu, la face coplanaire du pavé n’est pas reprise', recipe: { op: 'shell', of: cut({ op: 'box', name: 'B', x: 1, y: 1, z: 1, at: [8, 8, 0] }, { op: 'cylinder', name: 'C', r: 10, h: 5 }), thickness: 0.1, open: face('C', 'base') }, expect: 'à réparer', reason: 'face disparue' },
  { name: 'coque ouverte sur le dessus', change: 'rainure selon X : le dessus est coupé en deux', recipe: { op: 'shell', of: cut(B(), slab(120, 10, 20, [-10, 20, 10])), thickness: 2, open: face('B', 'zmax') }, expect: 'à réparer', reason: 'face partagée en 2 morceaux' },
];

describe('références topologiques — supports (sans noyau)', () => {
  it('faces du pavé et segments d’extrusion nommés par leur identifiant', () => {
    const s = featureSupports({ op: 'union', a: B(), b: extrude(L, ['a', 'b', 'c', 'd', 'e', 'f']) });
    const zmax = supportOf(s, face('B', 'zmax'));
    expect('support' in zmax && pointOnSupport(zmax.support, [100, 50, 20])).toBe(true);
    expect('support' in zmax && pointOnSupport(zmax.support, [100.01, 50, 20])).toBe(false);
    const c = supportOf(s, face('P', 'side:c'));
    expect('support' in c && pointOnSupport(c.support, [35, 10, 25])).toBe(true);
    expect('support' in c && pointOnSupport(c.support, [5, 10, 25])).toBe(false);
    expect(supportOf(s, face('P', 'side:s2'))).toEqual({ reason: 'rôle « side:s2 » absent de la fonction « P »' });
  });
  it('nom de fonction en double : toute référence qui le vise est à réparer', () => {
    const s = featureSupports({ op: 'union', a: B(), b: { op: 'box', name: 'B', x: 1, y: 1, z: 1 } });
    expect(supportOf(s, face('B', 'zmax'))).toEqual({ reason: 'nom en double dans la recette (B.zmax)' });
  });
  it('base de cylindre : disque, pas carré englobant', () => {
    const s = featureSupports({ op: 'cylinder', name: 'C', r: 10, h: 5 });
    const b = supportOf(s, face('C', 'base'));
    expect('support' in b && pointOnSupport(b.support, [7, 7, 0])).toBe(true);
    expect('support' in b && pointOnSupport(b.support, [8, 8, 0])).toBe(false);
  });
  it('paroi de cylindre d’axe quelconque', () => {
    const s = featureSupports({ op: 'cylinder', name: 'H', r: 5, h: 10, at: [1, 2, 3], dir: [1, 0, 0] });
    const w = supportOf(s, face('H', 'wall'));
    expect('support' in w && pointOnSupport(w.support, [6, 2, 8])).toBe(true);
    expect('support' in w && pointOnSupport(w.support, [12, 2, 8])).toBe(false);
  });
});

describe('essai P0 — références topologiques sur le noyau (lot 11.3)', async () => {
  const kernel = await loadKernel();
  const rows: Record<string, unknown>[] = [];

  for (const c of CASES) {
    it(`${c.name} — ${c.change} : ${c.expect}`, () => {
      const [rep] = kernel.references(c.recipe);
      rows.push({ cas: c.name, modification: c.change, statut: rep.status, raison: rep.reason ?? null, candidats: rep.candidates, rangNoyau: rep.index ?? null, serie: c.series ?? null });
      expect(rep.status).toBe(c.expect);
      if (c.expect === 'conservée') {
        if (c.at) rep.at!.forEach((v, i) => expect(v).toBeCloseTo(c.at![i], 6));
        if (c.check) expect(c.check(rep.at!)).toBe(true);
        // Le volume prouve que l'opération porte sur l'élément visé, et sur lui seul.
        expect(Math.abs(kernel.volume(c.recipe) - c.volume!) / c.volume!).toBeLessThan(1e-6);
      } else {
        expect(rep.reason).toMatch(new RegExp(`^${c.reason}`));
        // En mode strict, l'opération est refusée : rien n'est appliqué à un autre élément.
        expect(() => kernel.volume(c.recipe)).toThrow(UnresolvedReferenceError);
      }
    });
  }

  it('le rang du noyau change d’une modification à l’autre : il ne peut servir de référence', () => {
    const bySeries = new Map<string, Set<unknown>>();
    for (const r of rows) if (r.serie && r.statut === 'conservée') (bySeries.get(r.serie as string) ?? bySeries.set(r.serie as string, new Set()).get(r.serie as string)!).add(r.rangNoyau);
    expect([...bySeries.values()].some(s => s.size > 1)).toBe(true);
    if (process.env.P0_REPORT) {
      writeFileSync(process.env.P0_REPORT, JSON.stringify({ moteur: `Node ${process.version}`, date: new Date().toISOString().slice(0, 10), noyau: 'replicad-opencascadejs 1.1.0 + replicad 1.1.0', cas: rows }, null, 2) + '\n');
    }
  });
});
