import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, Layer } from '@/types/cad';
import { ARC_TOLERANCE_MM, bulgeArc, exportDxf, exportToDxf, parseDxf } from './dxf';

const layers: Layer[] = [
  { id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false },
];

const base = {
  classification: 'non-classifie' as const,
  layerId: 'LAY-0001',
  hatch: 'none' as const,
  createdSeq: 0,
};

const options = { objectStart: 0, layerStart: 0, createdSeq: 0, existingLayers: layers };

/** DXF minimal : en-tête facultatif ($INSUNITS) + entités fournies en paires code/valeur. */
function dxf(entities: (string | number)[], insunits?: number): string {
  const header = insunits === undefined ? [] : ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', insunits, '0', 'ENDSEC'];
  return [...header, '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

const unitLine = ['0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '1', '21', '0'];

function lineLength(o: CadObject | undefined): number {
  if (o?.kind !== 'line') throw new Error('ligne attendue');
  return Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
}

/** Paires DXF d'une entité donnée (première occurrence) dans un export. */
function entityPairs(content: string, type: string): [number, string][] {
  const lines = content.split('\n');
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]]);
  const start = pairs.findIndex(([c, v]) => c === 0 && v === type);
  if (start < 0) return [];
  const end = pairs.findIndex(([c], i) => i > start && c === 0);
  return pairs.slice(start, end);
}

// Écrit les fichiers exportés pour une vérification externe (ezdxf) quand DXF_FIXTURES_DIR est défini.
function keepFixture(name: string, content: string) {
  const dir = process.env.DXF_FIXTURES_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content);
}

describe('export DXF', () => {
  it('exporte les entités de base en millimètres, au format R2000', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Ligne', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { ...base, id: 'OBJ-0002', name: 'Cercle', kind: 'circle', cx: 50, cy: 50, r: 20 },
    ];
    const content = exportToDxf(objects, layers, []);
    expect(content).toContain('$ACADVER\n1\nAC1015');
    expect(content).toContain('$INSUNITS\n70\n4');
    expect(content).toContain('AcDbLine');
    expect(content).toContain('AcDbCircle');
    expect(content).toContain('Dessin');
    keepFixture('base.dxf', content);
  });

  it('déclare le nombre exact de sommets d\'une polyligne fermée', () => {
    const triangle: CadObject = { ...base, id: 'OBJ-0001', name: 'Triangle', kind: 'polyline', points: [0, 0, 10, 0, 5, 8, 0, 0] };
    const content = exportToDxf([triangle], layers, []);
    const pairs = entityPairs(content, 'LWPOLYLINE');
    expect(pairs.find(([c]) => c === 100 && pairs.some(([, v]) => v === 'AcDbPolyline'))).toBeTruthy();
    expect(pairs.find(([c]) => c === 90)?.[1]).toBe('3');
    expect(pairs.find(([c]) => c === 70)?.[1]).toBe('1');
    expect(pairs.filter(([c]) => c === 10)).toHaveLength(3);
    keepFixture('polyligne-fermee.dxf', content);
  });

  it('exporte les hachures en entités HATCH et le signale dans le rapport', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Mur', kind: 'rect', x: 0, y: 0, w: 200, h: 20, hatch: 'cross' },
      { ...base, id: 'OBJ-0002', name: 'Poteau', kind: 'circle', cx: 300, cy: 10, r: 15, hatch: 'diagonal' },
      { ...base, id: 'OBJ-0003', name: 'Dalle', kind: 'polyline', points: [0, 50, 100, 50, 100, 90, 0, 50], hatch: 'solid' },
    ];
    const { content, report } = exportDxf(objects, layers, []);
    expect(content.match(/\nHATCH\n/g)).toHaveLength(3);
    expect(content).toContain('ANSI37');
    expect(content).toContain('ANSI31');
    expect(content).toContain('SOLID');
    expect(report.kept.join(' ')).toContain('Hachures : 3');
    expect(report.transformed.join(' ')).toContain('Rectangles : 1');
    keepFixture('hachures.dxf', content);
  });

  it('annonce les cotes converties en traits + texte', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Ligne', kind: 'line', x1: 0, y1: 0, x2: 3000, y2: 4000 },
      { ...base, id: 'OBJ-0002', name: 'Cote', kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: 40 },
    ];
    const { content, report } = exportDxf(objects, layers, []);
    expect(content).toMatch(/\n5[\s\u202f]000 mm\n/);
    expect(report.transformed.join(' ')).toContain('association');
    keepFixture('cote.dxf', content);
  });

  it('réimporte un export sans inversion verticale ni perte de sommet', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Profil', kind: 'polyline', points: [0, 0, 100, 0, 100, 50, 0, 0] },
    ];
    const parsed = parseDxf(exportToDxf(objects, layers, []), { objectStart: 10, layerStart: 1, createdSeq: 2, existingLayers: layers });
    expect(parsed.objects).toHaveLength(1);
    expect(parsed.objects[0]).toMatchObject({ kind: 'polyline', layerId: 'LAY-0001' });
    if (parsed.objects[0]?.kind === 'polyline') expect(parsed.objects[0].points).toEqual([0, 0, 100, 0, 100, 50, 0, 0]);
    expect(parsed.unit).toMatchObject({ key: 'mm', source: 'fichier' });
  });

  it('conserve les décimales au millionième de millimètre', () => {
    const objects: CadObject[] = [{ ...base, id: 'OBJ-0001', name: 'Trou', kind: 'circle', cx: 12.345, cy: 0.5, r: 0.4 }];
    const parsed = parseDxf(exportToDxf(objects, layers, []), options);
    expect(parsed.objects[0]).toMatchObject({ kind: 'circle', cx: 12.345, cy: 0.5, r: 0.4 });
  });
});

describe('import DXF — unités', () => {
  it.each([
    [4, 1],
    [6, 1000],
    [1, 25.4],
    [5, 10],
  ])('convertit $INSUNITS=%i vers le millimètre (×%f)', (code, expected) => {
    const parsed = parseDxf(dxf(unitLine, code), options);
    expect(lineLength(parsed.objects[0])).toBeCloseTo(expected, 9);
    expect(parsed.unitMissing).toBe(false);
  });

  it('signale un fichier sans unité et applique l\'unité choisie', () => {
    const missing = parseDxf(dxf(unitLine), options);
    expect(missing.unitMissing).toBe(true);
    expect(missing.unit.source).toBe('défaut');
    expect(missing.warnings.join(' ')).toContain('ne déclare pas d\'unité');

    const chosen = parseDxf(dxf(unitLine), { ...options, sourceUnit: 'm' });
    expect(lineLength(chosen.objects[0])).toBeCloseTo(1000, 9);
    expect(chosen.unit.source).toBe('choix');
    expect(chosen.report.transformed.join(' ')).toContain('mètre');
  });

  it('traite $INSUNITS=0 (sans unité) comme une unité manquante', () => {
    expect(parseDxf(dxf(unitLine, 0), options).unitMissing).toBe(true);
  });
});

describe('import DXF — courbes', () => {
  it('approche un segment courbe (bulge) au lieu de le redresser', () => {
    // Demi-cercle de (0,0) à (10,0), bulge 1 → rayon 5, centre (5,0).
    const parsed = parseDxf(dxf(['0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '0', '10', '0', '20', '0', '42', '1', '10', '10', '20', '0'], 4), options);
    const poly = parsed.objects[0];
    expect(poly?.kind).toBe('polyline');
    if (poly?.kind !== 'polyline') return;
    expect(poly.points.length).toBeGreaterThan(4);
    for (let i = 0; i < poly.points.length; i += 2) {
      expect(Math.hypot(poly.points[i] - 5, poly.points[i + 1])).toBeCloseTo(5, 6);
    }
    // Bulge positif = sens trigonométrique en Y ascendant : l'arc passe par (5,-5) en DXF, soit (5,5) en Y descendant.
    const ys = poly.points.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeCloseTo(5, 6);
    expect(parsed.report.transformed.join(' ')).toContain('segment(s) courbe(s)');
  });

  it('respecte la tolérance de corde sur un grand rayon en mètres', () => {
    // ARC de rayon 1 m déclaré en mètres : écart ≤ 0,05 mm.
    const parsed = parseDxf(dxf(['0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '1', '50', '0', '51', '90'], 6), options);
    const arc = parsed.objects[0];
    if (arc?.kind !== 'polyline') throw new Error('polyligne attendue');
    const pts = arc.points;
    let maxError = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2;
      maxError = Math.max(maxError, 1000 - Math.hypot(mx, my));
    }
    expect(maxError).toBeLessThanOrEqual(ARC_TOLERANCE_MM + 1e-6);
    expect(Math.hypot(pts[0], pts[1])).toBeCloseTo(1000, 6);
  });

  it('tient la tolérance sur un demi-cercle de 1 km de rayon', () => {
    const parsed = parseDxf(dxf(['0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '1', '50', '0', '51', '180'], 7), options);
    expect(parsed.report.transformed.join(' ')).toContain('Courbes');
    expect(parsed.report.lost.join(' ')).not.toContain('Tolérance');
    const arc = parsed.objects[0];
    if (arc?.kind !== 'polyline') throw new Error('polyligne attendue');
    expect(arc.points.length / 2).toBeGreaterThan(4096);
  });

  it('signale un arc dont la tolérance ne peut pas être tenue', () => {
    // Cercle quasi complet de 1 000 km : au-delà du plafond de segments.
    const parsed = parseDxf(dxf(['0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '1000', '50', '0', '51', '359'], 7), options);
    expect(parsed.warnings.join(' ')).toContain('Tolérance d\'approximation dépassée');
    expect(parsed.report.lost.join(' ')).toContain('Tolérance');
  });

  it('replace un arc en repère symétrique (extrusion 0,0,−1) au bon endroit', () => {
    // Arc OCS centre (10,0), r 5, de 0° à 90°, extrusion -Z → en WCS : centre (-10,0), de 90° à 180°.
    const parsed = parseDxf(dxf(['0', 'ARC', '8', '0', '10', '10', '20', '0', '40', '5', '50', '0', '51', '90', '210', '0', '220', '0', '230', '-1'], 4), options);
    const arc = parsed.objects[0];
    if (arc?.kind !== 'polyline') throw new Error('polyligne attendue');
    const xs = arc.points.filter((_, i) => i % 2 === 0);
    const ys = arc.points.filter((_, i) => i % 2 === 1).map(v => -v);
    expect(Math.max(...xs)).toBeCloseTo(-10, 6);
    expect(Math.min(...xs)).toBeCloseTo(-15, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(5, 6);
    expect(parsed.report.transformed.join(' ')).toContain('repère symétrique');
  });

  it('calcule un arc de bulge exact aux extrémités', () => {
    const arc = bulgeArc(0, 0, 10, 0, -0.5);
    expect(arc).not.toBeNull();
    const p = arc!.points;
    expect([p[0], p[1], p[p.length - 2], p[p.length - 1]]).toEqual([0, 0, 10, 0]);
    expect(arc!.error).toBeLessThanOrEqual(ARC_TOLERANCE_MM);
  });

  it('signale les entités non prises en charge', () => {
    const parsed = parseDxf(dxf(['0', 'SPLINE', '8', '0', '10', '0', '20', '0']), options);
    expect(parsed.objects).toHaveLength(0);
    expect(parsed.warnings.join(' ')).toContain('SPLINE');
    expect(parsed.report.lost.join(' ')).toContain('SPLINE');
  });
});
