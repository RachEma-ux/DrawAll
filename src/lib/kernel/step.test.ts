// Essai P0 — import STEP de référence (lot 11.4) : solides, assemblages, unités, pertes signalées.
// Corpus : src/lib/__fixtures__/step/ (écrit par OCCT, voir step-corpus.gen.test.ts).
// Avec P0_REPORT=<fichier>, le compte rendu est écrit (docs/p0/11.4-import-step-mesures.json).
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadKernel, type StepImportReport } from './occt';
import { inventory, parseStepFile, splitArgs, stepRefs } from './step-file';
import type { Vec3 } from './recipe';

const read = (f: string) => readFileSync(`src/lib/__fixtures__/step/${f}`, 'utf8');
const BOX = 100 * 50 * 20, AXE = Math.PI * 25 * 30;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const sameVec = (a: Vec3, b: Vec3) => a.every((v, i) => close(v, b[i]));

describe('lecture du texte STEP (sans noyau)', () => {
  it('arguments : virgules et parenthèses dans les chaînes, apostrophes doublées', () => {
    expect(splitArgs("'a,(b)',#2,(#3,#4),'l''axe'")).toEqual(["'a,(b)'", '#2', '(#3,#4)', "'l''axe'"]);
    expect(stepRefs("('#9 n’est pas une référence',#12)")).toEqual([12]);
  });
  it('entité complexe et unité en pouces ramenée au millimètre', () => {
    const inv = inventory(parseStepFile(read('assemblage-pouce.step')));
    expect(inv.lengthUnits).toEqual([{ name: 'inch', mm: 25.4 }]);
  });
  it('DIMENSIONAL_EXPONENTS (dimension d’une unité) n’est pas une annotation', () => {
    expect(inventory(parseStepFile(read('assemblage-pouce.step'))).notTransferred).toEqual({ 'couleurs et styles': 2 });
  });
  it('fichier tronqué : refusé avec sa raison', () => {
    expect(() => parseStepFile(read('tronque.step'))).toThrow(/incomplet/);
  });
});

interface Case {
  file: string;
  status: StepImportReport['status'];
  schema?: RegExp;
  unit?: { name: string; mm: number };
  products?: string[];
  tree?: unknown;
  volume?: number;
  /** Centres des boîtes englobantes des solides (placements d'assemblage appliqués), en mm. */
  centers?: Vec3[];
  losses?: RegExp[];
  error?: RegExp;
}

const tree = [{ product: 'ensemble', children: [{ product: 'socle', children: [] }, { product: 'axe', children: [] }, { product: 'axe', children: [] }] }];
const centers: Vec3[] = [[50, 25, 10], [20, 25, 35], [80, 25, 35]];

const CASES: Case[] = [
  { file: 'piece-ap203.step', status: 'importé', schema: /^CONFIG_CONTROL_DESIGN/, unit: { name: 'millimètre', mm: 1 }, products: ['socle'], volume: BOX, centers: [[50, 25, 10]] },
  { file: 'piece-ap214.step', status: 'importé', schema: /^AUTOMOTIVE_DESIGN/, unit: { name: 'millimètre', mm: 1 }, products: ['socle'], volume: BOX, centers: [[50, 25, 10]] },
  { file: 'piece-ap242.step', status: 'importé', schema: /^AP242_MANAGED_MODEL_BASED_3D_ENGINEERING/, unit: { name: 'millimètre', mm: 1 }, products: ['socle'], volume: BOX, centers: [[50, 25, 10]] },
  { file: 'assemblage-mm.step', status: 'importé avec pertes', unit: { name: 'millimètre', mm: 1 }, products: ['ensemble', 'socle', 'axe'], tree, volume: BOX + 2 * AXE, centers, losses: [/^couleurs et styles : \d+ entité/] },
  { file: 'assemblage-pouce.step', status: 'importé avec pertes', unit: { name: 'inch', mm: 25.4 }, products: ['ensemble', 'socle', 'axe'], tree, volume: BOX + 2 * AXE, centers, losses: [/^couleurs et styles/] },
  { file: 'entite-manquante.step', status: 'importé avec pertes', tree, volume: BOX, centers: [[50, 25, 10]], losses: [/^couleurs et styles/, /^1 référence\(s\) vers des entités absentes/, /^2 occurrence\(s\) de pièce sur 3 sans solide/] },
  { file: 'tronque.step', status: 'échec', error: /incomplet/ },
];

describe('essai P0 — import STEP par le noyau (lot 11.4)', async () => {
  const kernel = await loadKernel();
  const rows: Record<string, unknown>[] = [];

  for (const c of CASES) {
    it(`${c.file} : ${c.status}`, () => {
      const r = kernel.importStep(read(c.file));
      rows.push({
        fichier: c.file, statut: r.status, erreur: r.error ?? null, schema: r.inventory?.schemas[0] ?? null, unites: r.inventory?.lengthUnits ?? [],
        produits: r.inventory?.products ?? [], occurrencesDePieces: r.inventory?.leafOccurrences ?? null, solides: r.solids.length,
        volumeTotal: r.totalVolume, pertes: r.losses, ms: r.ms,
      });
      expect(r.status).toBe(c.status);
      if (c.error) expect(r.error).toMatch(c.error);
      if (c.schema) expect(r.inventory!.schemas[0]).toMatch(c.schema);
      if (c.unit) expect(r.inventory!.lengthUnits).toEqual([c.unit]);
      if (c.products) expect(r.inventory!.products).toEqual(c.products);
      if (c.tree) expect(r.inventory!.tree).toEqual(c.tree);
      if (c.volume !== undefined) expect(close(r.totalVolume, c.volume)).toBe(true);
      if (c.centers) {
        expect(r.solids.length).toBe(c.centers.length);
        for (const ctr of c.centers) expect(r.solids.some(s => sameVec(s.center, ctr))).toBe(true);
        expect(r.solids.every(s => s.valid)).toBe(true);
      }
      expect(r.losses.length).toBe(c.losses?.length ?? 0);
      for (const l of c.losses ?? []) expect(r.losses.some(x => l.test(x))).toBe(true);
    });
  }

  it('compte rendu', () => {
    expect(rows.length).toBe(CASES.length);
    if (process.env.P0_REPORT) {
      writeFileSync(process.env.P0_REPORT, JSON.stringify({ moteur: `Node ${process.version}`, date: new Date().toISOString().slice(0, 10), noyau: 'replicad-opencascadejs 1.1.0 (OCCT 8.0, STEPControl_Reader)', cas: rows }, null, 2) + '\n');
    }
  });
});
