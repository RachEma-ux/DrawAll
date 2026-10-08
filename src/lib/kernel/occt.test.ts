// Essai P0 du noyau OCCT (lot 11.2) : volumes de référence à 10⁻⁶ près, cas difficiles,
// maillage contrôlé par un calcul indépendant, chargement et mémoire mesurés.
// Avec P0_REPORT=<fichier>, les mesures sont écrites (docs/p0/11.2-noyau-mesures.json).
import { statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadKernel } from './occt';
import { meshVolume, type SolidRecipe } from './recipe';

const rows: Record<string, unknown>[] = [];
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
const box = (x: number, y: number, z: number, at?: [number, number, number]): SolidRecipe => ({ op: 'box', x, y, z, ...(at ? { at } : {}) });

const CASES: { name: string; recipe: SolidRecipe; volume: number; tol?: number; difficile?: boolean }[] = [
  { name: 'pavé 100 × 50 × 20', recipe: box(100, 50, 20), volume: 100000 },
  { name: 'cylindre R 10, h 30', recipe: { op: 'cylinder', r: 10, h: 30 }, volume: Math.PI * 100 * 30 },
  { name: 'pavé percé de part en part (Ø 20)', recipe: { op: 'cut', a: box(100, 50, 20), b: { op: 'cylinder', r: 10, h: 40, at: [50, 25, -10] } }, volume: 100000 - Math.PI * 100 * 20 },
  { name: 'extrusion d’un profil en L', recipe: { op: 'extrude', profile: [[0, 0], [60, 0], [60, 10], [10, 10], [10, 40], [0, 40]], height: 25 }, volume: (60 * 10 + 10 * 30) * 25 },
  { name: 'révolution d’un rectangle (tube R 10 à 20, h 30)', recipe: { op: 'revolve', profile: [[10, 0], [20, 0], [20, 30], [10, 30]], angle: 360 }, volume: Math.PI * (400 - 100) * 30 },
  { name: 'union à face commune (deux pavés accolés)', recipe: { op: 'union', a: box(50, 50, 20), b: box(50, 50, 20, [50, 0, 0]) }, volume: 100000, difficile: true },
  { name: 'paroi mince de 0,1 mm', recipe: { op: 'cut', a: box(100, 100, 50), b: box(99.8, 99.8, 50, [0.1, 0.1, 0.1]) }, volume: 100 * 100 * 50 - 99.8 * 99.8 * 49.9, difficile: true },
  { name: 'cylindre tangent à une face (contact sur une génératrice)', recipe: { op: 'union', a: box(100, 50, 20), b: { op: 'cylinder', r: 10, h: 20, at: [50, 60, 0] } }, volume: 100000 + Math.PI * 100 * 20, difficile: true },
  { name: 'intersection de deux cylindres orthogonaux (Steinmetz, R 10)', recipe: { op: 'intersect', a: { op: 'cylinder', r: 10, h: 40, at: [0, 0, -20] }, b: { op: 'cylinder', r: 10, h: 40, at: [-20, 0, 0], dir: [1, 0, 0] } }, volume: (16 / 3) * 1000, difficile: true },
  // Pavé arrondi = somme de Minkowski du pavé réduit (a − 2r…) et d'une sphère de rayon r.
  { name: 'congé R 5 sur toutes les arêtes d’un pavé 100 × 50 × 20', recipe: { op: 'fillet', of: box(100, 50, 20), r: 5 },
    volume: (() => { const [a, b, c, r] = [90, 40, 10, 5]; return a * b * c + 2 * r * (a * b + b * c + a * c) + Math.PI * r * r * (a + b + c) + (4 / 3) * Math.PI * r ** 3; })(), difficile: true },
  { name: 'coque de 2 mm ouverte en haut (pavé 100 × 50 × 20)', recipe: { op: 'shell', of: box(100, 50, 20), thickness: 2 }, volume: 100 * 50 * 20 - 96 * 46 * 18, difficile: true },
];

describe('essai P0 — noyau OCCT (lot 11.2)', async () => {
  const before = process.memoryUsage();
  const kernel = await loadKernel();
  const after = process.memoryUsage();
  const require = createRequire(import.meta.url);
  const wasm = require.resolve('replicad-opencascadejs/wasm');

  for (const c of CASES) {
    it(`${c.name} : volume à 10⁻⁶ près`, () => {
      const t = performance.now();
      const v = kernel.volume(c.recipe);
      const ms = performance.now() - t;
      rows.push({ cas: c.name, difficile: !!c.difficile, attendu: c.volume, obtenu: v, ecartRelatif: Number(rel(v, c.volume).toExponential(2)), ms: Math.round(ms * 10) / 10 });
      expect(rel(v, c.volume)).toBeLessThan(c.tol ?? 1e-6);
    });
  }

  it('coque : sommet trouvé sur le solide construit, quelle que soit la recette (ici une union)', () => {
    const stacked: SolidRecipe = { op: 'union', a: box(100, 50, 10), b: box(100, 50, 10, [0, 0, 10]) };
    expect(rel(kernel.volume({ op: 'shell', of: stacked, thickness: 2 }), 100 * 50 * 20 - 96 * 46 * 18)).toBeLessThan(1e-6);
  });

  it('coque : sommet courbe (cylindre couché) refusé en clair', () => {
    expect(() => kernel.volume({ op: 'shell', of: { op: 'cylinder', r: 10, h: 40, dir: [1, 0, 0] }, thickness: 1 })).toThrow('aucune face plane horizontale');
  });

  it('maillage : volume du maillage fermé (divergence) = volume du noyau', () => {
    for (const r of [CASES[0].recipe, CASES[2].recipe, CASES[9].recipe]) {
      const m = kernel.mesh(r, 0.01);
      expect(m.triangles.length).toBeGreaterThan(0);
      expect(rel(meshVolume(m), kernel.volume(r))).toBeLessThan(2e-3);
    }
  });

  it('chargement et mémoire consignés', () => {
    const report = {
      moteur: `Node ${process.version}`, date: new Date().toISOString().slice(0, 10),
      paquet: 'replicad-opencascadejs 1.1.0 (OCCT, LGPL-2.1) + replicad 1.1.0 (MIT)',
      fichierWasmOctets: statSync(wasm).size,
      chargementMs: Math.round(kernel.loadMs),
      memoireApresChargementMo: { rss: Math.round((after.rss - before.rss) / 1e5) / 10, arrayBuffers: Math.round(after.arrayBuffers / 1e5) / 10 },
      cas: rows,
    };
    if (process.env.P0_REPORT) writeFileSync(process.env.P0_REPORT, JSON.stringify(report, null, 2) + '\n');
    expect(kernel.loadMs).toBeGreaterThan(0);
  });
});
