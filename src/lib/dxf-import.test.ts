import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, EllipseObj, Layer } from '@/types/cad';
import { distanceToEllipse, ellipsePointAt } from './ellipse';
import { parseDxf } from './dxf';

// Jeu de fichiers de référence (scripts/make-dxf-fixtures.py, écrits par ezdxf).
const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', 'dxf', name), 'utf8');
const layers: Layer[] = [{ id: 'LAY-0001', name: '0', color: '#ffffff', visible: true, locked: false }];
const read = (name: string) => parseDxf(fixture(name), { objectStart: 0, layerStart: 1, createdSeq: 0, existingLayers: layers, blockStart: 0 });
const kinds = (objs: CadObject[]) => objs.reduce<Record<string, number>>((m, o) => ({ ...m, [o.kind]: (m[o.kind] ?? 0) + 1 }), {});

describe('import DXF complet (lot 6.1) — jeu de référence', () => {
  it('blocs : occurrence simple conservée comme bloc, tournée ou imbriquée éclatée', () => {
    const r = read('blocs.dxf');
    // VIS_M8 ×1 et ×2 (échelle uniforme) : blocs conservés ; tournée à 90° : éclatée ; PLAQUE (bloc imbriqué + texte) : éclatée.
    expect(r.blocks.map(b => b.name)).toEqual(['VIS_M8']);
    const refs = r.objects.filter(o => o.kind === 'blockRef');
    expect(refs.map(o => o.kind === 'blockRef' && [o.x, o.y, o.scale])).toEqual([[10, -10, 1], [50, -10, 2]]);
    // Vis tournée : cercle centré sur le point d'insertion, ligne devenue verticale.
    const turned = r.objects.filter(o => o.kind === 'line' && Math.abs(o.x1 - 100) < 1e-9 && Math.abs(o.x2 - 100) < 1e-9);
    expect(turned).toHaveLength(1);
    // Plaque : contour, vis imbriquée (cercle + ligne) et texte, placés à l'insertion (0, 100).
    const text = r.objects.find(o => o.kind === 'text');
    expect(text).toMatchObject({ content: 'P1', x: 40, y: -130 });
    expect(r.objects.some(o => o.kind === 'circle' && o.cx === 20 && o.cy === -130 && o.r === 4)).toBe(true);
    expect(r.report.kept.join(' ')).toMatch(/Blocs : 2 occurrence\(s\) conservée\(s\)/);
    expect(r.report.transformed.join(' ')).toMatch(/Blocs : 2 occurrence\(s\) éclatée\(s\)/);
  });

  it('cotes DIMENSION : géométrie dessinée (traits, texte), non associative', () => {
    const r = read('cotes.dxf');
    const k = kinds(r.objects);
    expect(k.line).toBeGreaterThanOrEqual(3);
    expect(r.objects.some(o => o.kind === 'text' && o.content.includes('100'))).toBe(true);
    expect(r.report.transformed.join(' ')).toMatch(/Cotes DIMENSION : 1/);
  });

  it('hachures : aplat avec îlot circulaire, motif ANSI31 sur contour par arêtes (ligne + arc)', () => {
    const r = read('hachures.dxf');
    const solid = r.objects.find(o => o.hatch === 'solid')!;
    expect(solid.kind).toBe('polyline');
    expect(solid.holes).toHaveLength(1);
    const island = r.objects.find(o => o.id === solid.holes![0])!;
    // Îlot : cercle de rayon 10 approché, sommets sur le cercle.
    if (island.kind !== 'polyline') throw new Error('îlot attendu');
    for (let i = 0; i + 1 < island.points.length; i += 2) expect(Math.hypot(island.points[i] - 50, island.points[i + 1] + 30)).toBeCloseTo(10, 6);
    const ansi = r.objects.find(o => o.hatch === 'diagonal')!;
    expect(ansi.hatchParams).toMatchObject({ angle: 45, unit: 'modele' });
    expect(ansi.hatchParams!.spacing).toBeCloseTo(3.175 * 2, 6);
    if (ansi.kind !== 'polyline') throw new Error('contour attendu');
    // Contour : le demi-cercle atteint x = 330.
    expect(Math.max(...ansi.points.filter((_, i) => i % 2 === 0))).toBeCloseTo(330, 6);
  });

  it('arêtes de hachure : arc et ellipse parcourus dans le sens horaire, spline rationnelle', () => {
    const r = read('hachures-aretes.dxf');
    const loops = r.objects.filter((o): o is Extract<CadObject, { kind: 'polyline' }> => o.kind === 'polyline');
    expect(loops).toHaveLength(3);
    const area = (pts: number[]) => { let a = 0; for (let i = 0; i + 3 < pts.length; i += 2) a += pts[i] * pts[i + 3] - pts[i + 2] * pts[i + 1]; return Math.abs(a) / 2; };
    const near = (a: number, b: number) => expect(Math.abs(a - b) / b).toBeLessThan(0.01);
    const gapMax = (pts: number[]) => { let g = 0; for (let i = 0; i + 3 < pts.length; i += 2) g = Math.max(g, Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1])); return g; };
    // Quart de disque de rayon 10 : contour continu (angles complémentaires lus comme AutoCAD).
    near(area(loops[0].points), (Math.PI * 100) / 4);
    expect(gapMax(loops[0].points)).toBeLessThan(10.01);
    // Quart d'ellipse 20 × 10.
    near(area(loops[1].points), (Math.PI * 200) / 4);
    // Spline rationnelle : quart de cercle exact de rayon 30 (sommets sur le cercle).
    const arc = loops[2].points;
    const onCircle = [];
    for (let i = 0; i + 1 < arc.length; i += 2) if (arc[i] > 200 + 1e-9 && arc[i + 1] < -1e-9) onCircle.push(Math.hypot(arc[i] - 200, arc[i + 1]));
    expect(onCircle.length).toBeGreaterThan(3);
    for (const d of onCircle) expect(d).toBeCloseTo(30, 5);
    near(area(arc), (Math.PI * 900) / 4);
  });

  it('blocs éclatés : le motif de hachure suit la rotation et l’échelle ; un bloc à trait propre est éclaté', () => {
    const r = read('blocs-eclates.dxf');
    // Bloc à style propre éclaté (aucun bloc conservé), couleur du trait gardée.
    expect(r.blocks.map(b => b.name)).not.toContain('STYLE');
    expect(r.objects.filter(o => o.kind === 'line').map(o => o.color ?? null)).toContainEqual(expect.stringMatching(/^#/));
    const hatch = r.objects.find(o => o.hatch === 'diagonal')!;
    // ANSI31 (45°) tourné de 90° : 135° ; pas 3,175 mm × échelle 2.
    expect(hatch.hatchParams).toMatchObject({ angle: 135, unit: 'modele' });
    expect(hatch.hatchParams!.spacing).toBeCloseTo(6.35, 6);
  });

  it('courbes : spline (lot 10.2) et ellipses (lot 10.1) natives, ellipse circulaire exacte', () => {
    const r = read('courbes.dxf');
    expect(kinds(r.objects)).toEqual({ spline: 1, ellipse: 2, circle: 1 });
    // Spline ouverte de degré 3 par quatre points de contrôle (nœuds bornés écrits par ezdxf).
    expect(r.objects[0]).toMatchObject({ kind: 'spline', degree: 3, points: [0, 0, 10, -20, 20, 20, 30, 0] });
    expect(r.objects[1]).toMatchObject({ kind: 'ellipse', cx: 100, cy: 0, rx: 20, ry: 10, rotation: 0 });
    expect(r.objects[1]).not.toHaveProperty('start');
    expect(r.objects[2]).toMatchObject({ kind: 'ellipse', cx: 150, cy: 0, rx: 15, ry: 6, rotation: 90, start: 0, end: 180 });
    expect(r.objects[3]).toMatchObject({ kind: 'circle', cx: 200, cy: 0, r: 10 });
    expect(r.report.kept.join(' ')).toContain('Ellipses : 2 (ELLIPSE natif, sans approximation).');
    expect(r.report.kept.join(' ')).toContain('Splines : 1 (SPLINE natif');
    expect(r.report.transformed.join(' ')).not.toMatch(/spline\(s\)/);
  });

  it('ellipses dans des blocs : point de base, rotation, échelle, symétrie, échelle non uniforme (référence ezdxf)', () => {
    const r = read('blocs-ellipses.dxf');
    // Ellipses du monde : celles des blocs conservés replacées à l'insertion, puis les éclatées.
    const world: EllipseObj[] = [];
    for (const o of r.objects) {
      if (o.kind === 'ellipse') world.push(o);
      if (o.kind === 'blockRef') {
        for (const p of r.blocks.find(b => b.id === o.blockId)!.primitives) {
          if (p.kind === 'ellipse') world.push({ ...p, cx: o.x + p.cx * o.scale, cy: o.y + p.cy * o.scale, rx: p.rx * o.scale, ry: p.ry * o.scale } as EllipseObj);
        }
      }
    }
    expect(world).toHaveLength(8);
    // Référence indépendante : points des ellipses transformées par ezdxf (virtual_entities), repère DXF.
    const ref: number[][][] = JSON.parse(fixture('blocs-ellipses.points.json'));
    for (const pts of ref) {
      const model = pts.map(([x, y]) => ({ x, y: -y }));
      const match = world.find(e => model.every(p => distanceToEllipse(e, p) < 1e-5)
        && (e.start === undefined || [ellipsePointAt(e, e.start), ellipsePointAt(e, e.end!)].every(q => model.slice(3).some(p => Math.hypot(p.x - q.x, p.y - q.y) < 1e-5))));
      expect(match, JSON.stringify(pts)).toBeDefined();
    }
  });

  it('splines dans des blocs : points de contrôle transformés comme par ezdxf (lot 10.2)', () => {
    const r = read('blocs-splines.dxf');
    const splines = r.objects.filter(o => o.kind === 'spline');
    const ref: number[][][] = JSON.parse(fixture('blocs-splines.points.json'));
    expect(splines).toHaveLength(ref.length);
    ref.forEach((pts, i) => {
      const s = splines[i];
      if (s.kind !== 'spline') throw new Error('spline attendue');
      expect(s.points.length).toBe(pts.length * 2);
      pts.forEach(([x, y], j) => {
        expect(s.points[2 * j]).toBeCloseTo(x, 6);
        expect(s.points[2 * j + 1]).toBeCloseTo(-y, 6);
      });
    });
  });

  it('textes : TEXT et MTEXT', () => {
    const r = read('textes.dxf');
    expect(r.objects.map(o => o.kind === 'text' && o.content)).toEqual(['Plan du rez', 'Ligne 1\nLigne 2']);
    expect(r.objects[0]).toMatchObject({ align: 'center' });
  });
});
