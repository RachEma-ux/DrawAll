// Spline native en DXF (lot 10.2) : SPLINE écrit avec nœuds, poids et points de contrôle, relu à
// l'identique ; repère symétrique ; vérification géométrique externe par ezdxf (scripts/check-dxf.py).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Layer, SplineObj } from '@/types/cad';
import { exportDxf, exportToDxf, parseDxf } from './dxf';
import { splineDomain, splinePointAt } from './spline';

const layers: Layer[] = [{ id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false }];
const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const options = { objectStart: 0, layerStart: 0, createdSeq: 0, existingLayers: layers };
const sp = (id: string, p: Partial<SplineObj>): SplineObj => ({ ...base, id, name: id, kind: 'spline', points: [], degree: 3, ...p });

const shapes: SplineObj[] = [
  sp('OBJ-0001', { points: [0, 0, 100, -200, 200, 200, 300, 0, 400, -150, 500, 0] }),
  // NURBS : quart de cercle de rayon 50 centré en (600 ; 0), nœuds et poids explicites.
  sp('OBJ-0002', { points: [650, 0, 650, -50, 600, -50], degree: 2, weights: [1, Math.SQRT1_2, 1], knots: [0, 0, 0, 1, 1, 1] }),
];

function entity(content: string, type: string, nth = 0): [number, string][] {
  const l = content.split('\n');
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < l.length; i += 2) pairs.push([Number(l[i]), l[i + 1]]);
  const starts = pairs.flatMap(([c, v], i) => (c === 0 && v === type ? [i] : []));
  const s = starts[nth], e = pairs.findIndex(([c], i) => i > s && c === 0);
  return pairs.slice(s + 1, e);
}
const values = (pairs: [number, string][], code: number) => pairs.filter(([c]) => c === code).map(([, v]) => Number(v));

describe('spline DXF (lot 10.2)', () => {
  it('écrit SPLINE : degré, nœuds, points de contrôle ; poids et drapeau rationnel si besoin', () => {
    const dxf = exportToDxf(shapes, layers, []);
    const a = entity(dxf, 'SPLINE', 0);
    expect(values(a, 71)).toEqual([3]);
    expect(values(a, 72)).toEqual([10]);
    expect(values(a, 73)).toEqual([6]);
    expect(values(a, 70)).toEqual([8]);
    expect(values(a, 40)).toEqual([0, 0, 0, 0, 1 / 3, 2 / 3, 1, 1, 1, 1].map(v => Number(v.toFixed(12))));
    expect(values(a, 20)).toEqual([0, 200, -200, 0, 150, 0]);
    expect(values(a, 41)).toEqual([]);
    const b = entity(dxf, 'SPLINE', 1);
    expect(values(b, 70)).toEqual([12]);
    expect(values(b, 41).map(v => Math.round(v * 1e12) / 1e12)).toEqual([1, Number(Math.SQRT1_2.toFixed(12)), 1]);

    const dir = process.env.DXF_FIXTURES_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'splines.dxf'), dxf);
      const expect_ = shapes.map((s, index) => {
        const [u0, u1] = splineDomain(s);
        return { type: 'SPLINE', index, points: [0, 0.21, 0.5, 0.83, 1].map(f => splinePointAt(s, u0 + (u1 - u0) * f)).map(p => [p.x, -p.y]) };
      });
      writeFileSync(join(dir, 'splines.dxf.points.json'), JSON.stringify(expect_));
    }
  });

  it('rapport d’export : splines et ellipses annoncées conservées', () => {
    const el = { ...base, id: 'OBJ-0009', name: 'E', kind: 'ellipse' as const, cx: 0, cy: 0, rx: 20, ry: 10, rotation: 0 };
    const r = exportDxf([...shapes, el], layers, []);
    expect(r.report.kept.join(' ')).toContain('Splines : 2 (SPLINE natif');
    expect(r.report.kept.join(' ')).toContain('Ellipses : 1 (ELLIPSE natif)');
  });

  it('aller-retour : mêmes points de contrôle, nœuds et poids ; courbe identique (10⁻⁶ mm)', () => {
    const r = parseDxf(exportToDxf(shapes, layers, []), options);
    expect(r.objects.map(o => o.kind)).toEqual(['spline', 'spline']);
    shapes.forEach((s, i) => {
      const back = r.objects[i] as SplineObj;
      expect(back.degree).toBe(s.degree);
      expect(back.points).toEqual(s.points.map(v => v + 0));
      const [u0, u1] = splineDomain(s), [v0, v1] = splineDomain(back);
      for (const f of [0, 0.3, 0.7, 1]) {
        const p = splinePointAt(s, u0 + (u1 - u0) * f), q = splinePointAt(back, v0 + (v1 - v0) * f);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-6);
      }
    });
    expect(r.report.kept.join(' ')).toContain('Splines : 2 (SPLINE natif');
  });

  it('repère symétrique (extrusion 0, 0, −1) : points de contrôle replacés, X opposé', () => {
    const e = ['0', 'SPLINE', '8', '0', '210', '0', '220', '0', '230', '-1', '70', '8', '71', '1', '72', '4', '73', '2', '40', '0', '40', '0', '40', '1', '40', '1',
      '10', '10', '20', '5', '30', '0', '10', '30', '20', '5', '30', '0'];
    const r = parseDxf(['0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC', '0', 'EOF'].join('\n'), options);
    expect(r.objects[0]).toMatchObject({ kind: 'spline', degree: 1, points: [-10, -5, -30, -5] });
  });
});
