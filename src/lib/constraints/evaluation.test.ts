// Essai P0 du solveur de contraintes (lot 11.1) : deux candidats sur le même corpus.
// A : solveur écrit pour DrawAll (src/lib/constraints/solver.ts). B : planegcs (FreeCAD, LGPL).
// Avec P0_REPORT=<fichier>, les mesures sont écrites (docs/p0/11.1-solveur-mesures.json).
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CORPUS, chain, chainSolved } from './corpus';
import { measureResidual, solveSketch } from './solver';
import { createPlanegcs } from './planegcs';
import type { Sketch, SolveReport } from './sketch';

const rows: Record<string, unknown>[] = [];
const time = <T>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, Math.round((performance.now() - t) * 10) / 10]; };
const summary = (r: SolveReport, ms: number) => ({ solved: r.solved, residual: Number(measureResidual(r.sketch).toExponential(2)), dof: r.dof, redundant: r.redundant, conflicting: r.conflicting, ms });
const warm = (n: number): Sketch => { const s = chainSolved(n); return { ...s, constraints: s.constraints.map(c => (c.id === 'len3' && c.type === 'length' ? { ...c, value: 10.1 } : c)) }; };

describe('essai P0 — solveur de contraintes (lot 11.1)', async () => {
  const pg = await createPlanegcs();

  for (const c of CORPUS) {
    it(c.name, () => {
      const [a, ta] = time(() => solveSketch(c.sketch));
      const [b, tb] = time(() => pg.solve(c.sketch));
      rows.push({ cas: c.name, A: { ...summary(a, ta), verification: c.check?.(a.sketch) }, B: { ...summary(b, tb), verification: c.check?.(b.sketch) } });
      for (const r of [a, b]) {
        expect(r.solved).toBe(c.expect.solved);
        if (c.expect.dof !== undefined) expect(r.dof).toBe(c.expect.dof);
        if (c.expect.redundant) expect(r.redundant).toEqual(c.expect.redundant);
        if (c.expect.solved) expect(measureResidual(r.sketch)).toBeLessThan(1e-6);
        else expect(r.conflicting).toContain('w2');
        if (c.check && c.expect.solved) expect(c.check(r.sketch)).toBe(true);
      }
    });
  }

  it('chaîne de 20 segments à froid ; chaînes de 50 à 200 segments re-résolues à chaud', () => {
    const [a, ta] = time(() => solveSketch(chain(20)));
    const [b, tb] = time(() => pg.solve(chain(20)));
    rows.push({ cas: 'chaîne 20, à froid', A: summary(a, ta), B: summary(b, tb) });
    expect(a.solved && b.solved).toBe(true);
    for (const n of [50, 100, 200]) {
      const [aw, taw] = time(() => solveSketch(warm(n)));
      const [bw, tbw] = time(() => pg.solve(warm(n)));
      rows.push({ cas: `chaîne ${n}, à chaud (une longueur +1 %)`, A: summary(aw, taw), B: summary(bw, tbw) });
      expect(aw.solved).toBe(true);
      expect(bw.solved).toBe(true);
    }
  });

  it('rapport', () => {
    const out = process.env.P0_REPORT;
    if (out) writeFileSync(out, JSON.stringify({ moteur: `Node ${process.version}`, date: new Date().toISOString().slice(0, 10), mesures: rows }, null, 2) + '\n');
    expect(rows.length).toBe(CORPUS.length + 4);
  });
});
