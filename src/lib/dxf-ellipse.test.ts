// Ellipse native en DXF (lot 10.1) : ELLIPSE écrit sans approximation, relu à l'identique ;
// repère symétrique ; vérification géométrique externe par ezdxf (scripts/check-dxf.py).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, EllipseObj, Layer } from '@/types/cad';
import { exportToDxf, parseDxf } from './dxf';
import { ellipsePointAt } from './ellipse';

const layers: Layer[] = [{ id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false }];
const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const options = { objectStart: 0, layerStart: 0, createdSeq: 0, existingLayers: layers };
const el = (id: string, p: Partial<EllipseObj>): EllipseObj => ({ ...base, id, name: id, kind: 'ellipse', cx: 0, cy: 0, rx: 20, ry: 10, rotation: 0, ...p });

const shapes: EllipseObj[] = [
  el('OBJ-0001', { cx: 100, cy: -50, rx: 40, ry: 15, rotation: 30 }),
  // Second demi-axe plus grand : le grand axe DXF est porté par la direction perpendiculaire.
  el('OBJ-0002', { cx: 0, cy: 0, rx: 10, ry: 25, rotation: 0, start: 20, end: 250 }),
  el('OBJ-0003', { cx: -30, cy: 40, rx: 12, ry: 8, rotation: 135, start: 300, end: 60 }),
];

/** Paires d'une entité (n-ième occurrence). */
function entity(content: string, type: string, nth = 0): Map<number, string> {
  const l = content.split('\n');
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < l.length; i += 2) pairs.push([Number(l[i]), l[i + 1]]);
  const starts = pairs.flatMap(([c, v], i) => (c === 0 && v === type ? [i] : []));
  const s = starts[nth], e = pairs.findIndex(([c], i) => i > s && c === 0);
  return new Map(pairs.slice(s + 1, e));
}

/** Points de contrôle (repère DXF) attendus sur chaque ellipse, pour la relecture par ezdxf. */
function expectations(objects: EllipseObj[]) {
  return objects.map((o, index) => {
    const span = o.start === undefined ? 360 : ((((o.end! - o.start) % 360) + 360) % 360 || 360);
    const t0 = o.start ?? 0;
    const points = [0, 0.13, 0.5, 0.77, 1].map(f => ellipsePointAt(o, t0 + span * f)).map(p => [p.x, -p.y]);
    return { type: 'ELLIPSE', index, points, length: undefined };
  });
}

describe('ellipse DXF (lot 10.1)', () => {
  it('écrit ELLIPSE : centre, grand axe relatif, rapport, paramètres en radians', () => {
    const dxf = exportToDxf(shapes, layers, []);
    const a = entity(dxf, 'ELLIPSE', 0);
    expect(a.get(100)).toBe('AcDbEllipse');
    expect(Number(a.get(10))).toBe(100);
    expect(Number(a.get(20))).toBe(50);
    expect(Number(a.get(11))).toBeCloseTo(40 * Math.cos(Math.PI / 6), 6);
    expect(Number(a.get(21))).toBeCloseTo(40 * Math.sin(Math.PI / 6), 6);
    expect(Number(a.get(40))).toBeCloseTo(15 / 40, 9);
    expect([Number(a.get(41)), Number(a.get(42))]).toEqual([0, Number((2 * Math.PI).toFixed(6))].map(v => expect.closeTo(v, 5)));
    const b = entity(dxf, 'ELLIPSE', 1);
    // ry > rx : grand axe à 90°, rapport 10/25, paramètres décalés de −90°.
    expect(Number(b.get(11))).toBeCloseTo(0, 9);
    expect(Number(b.get(21))).toBeCloseTo(25, 9);
    expect(Number(b.get(40))).toBeCloseTo(0.4, 9);
    expect(Number(b.get(41))).toBeCloseTo(((20 - 90 + 360) * Math.PI) / 180, 5);
    expect(Number(b.get(42))).toBeCloseTo(((250 - 90) * Math.PI) / 180, 5);

    const dir = process.env.DXF_FIXTURES_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'ellipses.dxf'), dxf);
      writeFileSync(join(dir, 'ellipses.dxf.points.json'), JSON.stringify(expectations(shapes)));
    }
  });

  it('aller-retour : la courbe relue passe par les mêmes points (10⁻⁵ mm)', () => {
    const r = parseDxf(exportToDxf(shapes, layers, []), options);
    expect(r.objects.map(o => o.kind)).toEqual(['ellipse', 'ellipse', 'ellipse']);
    shapes.forEach((o, i) => {
      const back = r.objects[i] as EllipseObj;
      // Le grand axe peut changer de nom (rx ↔ ry) : on compare des points de la courbe, extrémités comprises.
      const span = o.start === undefined ? 360 : ((((o.end! - o.start) % 360) + 360) % 360 || 360);
      const spanBack = back.start === undefined ? 360 : ((((back.end! - back.start) % 360) + 360) % 360 || 360);
      expect(spanBack).toBeCloseTo(span, 5);
      for (const f of [0, 0.3, 0.6, 1]) {
        const p = ellipsePointAt(o, (o.start ?? 0) + span * f);
        const q = ellipsePointAt(back, (back.start ?? 0) + spanBack * f);
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-5);
      }
    });
  });

  it('repère symétrique (extrusion 0, 0, −1) : ellipse replacée dans le repère général', () => {
    const entities = ['0', 'ELLIPSE', '8', '0', '10', '10', '20', '0', '30', '0', '11', '20', '21', '0', '31', '0', '210', '0', '220', '0', '230', '-1', '40', '0.5', '41', '0', '42', String(Math.PI / 2)];
    const text = ['0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\n');
    const r = parseDxf(text, options);
    const o = r.objects[0] as CadObject;
    if (o.kind !== 'ellipse') throw new Error('ellipse attendue');
    // En repère symétrique, X est opposé : centre (−10 ; 0), quart d'ellipse de (−30 ; 0) à (−10 ; 10) (repère DXF).
    const ends = [ellipsePointAt(o, o.start!), ellipsePointAt(o, o.end!)].map(p => [Math.round(p.x * 1e6) / 1e6, Math.round(-p.y * 1e6) / 1e6]);
    expect(ends.sort()).toEqual([[-30, 0], [-10, 10]].sort());
  });
});
