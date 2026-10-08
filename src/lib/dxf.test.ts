import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, Layer } from '@/types/cad';
import { ARC_TOLERANCE_MM, bulgeArc, decodeDxfString, encodeDxfString, exportDxf, exportToDxf, parseDxf } from './dxf';

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
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]), decodeDxfString(lines[i + 1])]);
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
    expect(content.match(/\n2\n_USER\n/g)).toHaveLength(2);
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
    expect(entityPairs(content, 'TEXT').find(([c]) => c === 1)?.[1]).toMatch(/^5[\s\u202f]000 mm$/);
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

  it('importe un ARC tel quel, sans approximation (unité appliquée)', () => {
    const parsed = parseDxf(dxf(['0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '1', '50', '0', '51', '90'], 6), options);
    expect(parsed.objects[0]).toMatchObject({ kind: 'arc', cx: 0, cy: 0, r: 1000, start: 0, end: 90 });
    expect(parsed.report.kept.join(' ')).toContain('ARC natif');
    expect(parsed.report.transformed.join(' ')).not.toContain('Courbes');
  });

  it('tient la tolérance sur un demi-cercle de 1 km de rayon (segment courbe)', () => {
    // LWPOLYLINE en kilomètres : (0,0) → (2,0) avec une courbure 1 (demi-cercle de rayon 1 km).
    const parsed = parseDxf(dxf(['0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '0', '10', '0', '20', '0', '42', '1', '10', '2', '20', '0'], 7), options);
    expect(parsed.report.transformed.join(' ')).toContain('Courbes');
    expect(parsed.report.lost.join(' ')).not.toContain('Tolérance');
    const poly = parsed.objects[0];
    if (poly?.kind !== 'polyline') throw new Error('polyligne attendue');
    expect(poly.points.length / 2).toBeGreaterThan(4096);
  });

  it('signale un segment courbe dont la tolérance ne peut pas être tenue', () => {
    // Arc de 359° et de 1 000 km de rayon : au-delà du plafond de segments.
    const theta = (359 * Math.PI) / 180;
    const chord = 2 * 1000 * Math.sin(theta / 2);
    const bulge = Math.tan(theta / 4);
    const parsed = parseDxf(dxf(['0', 'LWPOLYLINE', '8', '0', '90', '2', '70', '0', '10', '0', '20', '0', '42', bulge, '10', chord, '20', '0'], 7), options);
    expect(parsed.warnings.join(' ')).toContain('Tolérance d\'approximation dépassée');
    expect(parsed.report.lost.join(' ')).toContain('Tolérance');
  });

  it('replace un arc en repère symétrique (extrusion 0,0,−1) au bon endroit', () => {
    // Arc OCS centre (10,0), r 5, de 0° à 90°, extrusion -Z → en WCS : centre (-10,0), de 90° à 180°.
    const parsed = parseDxf(dxf(['0', 'ARC', '8', '0', '10', '10', '20', '0', '40', '5', '50', '0', '51', '90', '210', '0', '220', '0', '230', '-1'], 4), options);
    expect(parsed.objects[0]).toMatchObject({ kind: 'arc', cx: -10, cy: 0, r: 5, start: 90, end: 180 });
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

describe('DXF — arcs', () => {
  it('exporte un ARC natif et le relit à l’identique', () => {
    const arc: CadObject = { ...base, id: 'OBJ-0001', name: 'Arc', kind: 'arc', cx: 50, cy: -20, r: 12.5, start: 300, end: 45 };
    const { content, report } = exportDxf([arc], layers, []);
    const pairs = entityPairs(content, 'ARC');
    expect(pairs.find(([c]) => c === 40)?.[1]).toBe('12.5');
    expect(pairs.find(([c]) => c === 50)?.[1]).toBe('300');
    expect(pairs.find(([c]) => c === 51)?.[1]).toBe('45');
    expect(report.kept.join(' ')).toContain('Arcs : 1');
    expect(parseDxf(content, options).objects[0]).toMatchObject({ kind: 'arc', cx: 50, cy: -20, r: 12.5, start: 300, end: 45 });
    keepFixture('arc.dxf', content);
  });
});

describe('DXF — texte', () => {
  const single: CadObject = { ...base, id: 'OBJ-0001', name: 'Séjour', kind: 'text', x: 100, y: -50, content: 'Séjour 24,5 m²', height: 25, rotation: 30, align: 'center' };
  const multi: CadObject = { ...base, id: 'OBJ-0002', name: 'Note', kind: 'text', x: 0, y: 0, content: 'Ligne 1\nLigne {2}', height: 10, rotation: 0, align: 'left' };

  it('exporte une ligne en TEXT et plusieurs lignes en MTEXT', () => {
    const { content, report } = exportDxf([single, multi], layers, []);
    const text = entityPairs(content, 'TEXT');
    expect(text.find(([c]) => c === 1)?.[1]).toBe('Séjour 24,5 m²');
    expect(text.find(([c]) => c === 72)?.[1]).toBe('1');
    expect(text.find(([c]) => c === 50)?.[1]).toBe('30');
    const mtext = entityPairs(content, 'MTEXT');
    expect(mtext.find(([c]) => c === 1)?.[1]).toBe('Ligne 1\\PLigne \\{2\\}');
    expect(report.kept.join(' ')).toContain('Textes sur une ligne : 1');
    expect(report.kept.join(' ')).toContain('plusieurs lignes : 1');
    keepFixture('texte.dxf', content);
  });

  it('relit ses propres textes à l’identique', () => {
    const parsed = parseDxf(exportToDxf([single, multi], layers, []), options);
    expect(parsed.objects).toHaveLength(2);
    expect(parsed.objects[0]).toMatchObject({ kind: 'text', x: 100, y: -50, content: 'Séjour 24,5 m²', height: 25, rotation: 30, align: 'center' });
    const m = parsed.objects[1];
    expect(m).toMatchObject({ kind: 'text', content: 'Ligne 1\nLigne {2}', height: 10, rotation: 0, align: 'left' });
    if (m.kind === 'text') {
      expect(m.x).toBeCloseTo(0, 6);
      expect(m.y).toBeCloseTo(0, 6);
    }
  });

  it('décode les codes de contrôle TEXT et la mise en forme MTEXT', () => {
    const parsed = parseDxf(dxf([
      '0', 'TEXT', '8', '0', '10', '0', '20', '0', '40', '2.5', '1', 'Perçage %%c12,5 %%p0,1',
      '0', 'MTEXT', '8', '0', '10', '0', '20', '100', '40', '5', '71', '1', '3', '{\\fArial|b1;Titre}\\P', '1', 'Sous-titre\\~a',
    ], 4), options);
    expect(parsed.objects.map(o => (o.kind === 'text' ? o.content : ''))).toEqual(['Perçage Ø12,5 ±0,1', 'Titre\nSous-titre a']);
    const mtext = parsed.objects[1];
    // Attache en haut à gauche : la ligne de base est une hauteur sous le point d'attache (y DXF 100 → y écran −95).
    if (mtext.kind === 'text') expect(mtext.y).toBeCloseTo(-95, 6);
  });

  it('écrit les caractères accentués en \\U+XXXX (lisibles par tout lecteur R2000)', () => {
    const content = exportToDxf([single], [{ ...layers[0], name: 'Bâtiment' }], []);
    expect(content).toContain('B\\U+00E2timent');
    expect(content).toContain('S\\U+00E9jour');
    expect(content).not.toMatch(/[\u0080-\uFFFF]/);
    expect(encodeDxfString('Ø 12')).toBe('\\U+00D8 12');
    expect(parseDxf(content, options).layers.concat(layers).some(l => l.name === 'Bâtiment' || l.name === 'Dessin')).toBe(true);
  });

  it('respecte la justification verticale des TEXT (code 73)', () => {
    const t = (h: number, v: number) => ['0', 'TEXT', '8', '0', '10', '999', '20', '999', '40', '10', '1', 'A', '72', String(h), '11', '100', '21', '50', '73', String(v)];
    const parsed = parseDxf(dxf([...t(0, 3), ...t(1, 2), ...t(2, 1), ...t(4, 0), ...t(0, 0)], 4), options);
    const [top, middle, bottom, mid4, base] = parsed.objects.map(o => (o.kind === 'text' ? o : null)!);
    // Haut-gauche : ligne de base une hauteur sous le point d'ancrage (Y DXF 50 → 40 ; Y écran −40).
    expect(top).toMatchObject({ x: 100, y: -40, align: 'left' });
    expect(middle).toMatchObject({ x: 100, y: -45, align: 'center' });
    expect(bottom).toMatchObject({ x: 100, y: -52.5, align: 'right' });
    expect(mid4).toMatchObject({ x: 100, y: -45, align: 'center' });
    // Gauche / ligne de base : le premier point (10/20) fait foi.
    expect(base).toMatchObject({ x: 999, y: -999, align: 'left' });
  });

  it('applique l’unité du fichier à la position et à la hauteur', () => {
    const parsed = parseDxf(dxf(['0', 'TEXT', '8', '0', '10', '1', '20', '2', '40', '0.25', '1', 'A'], 6), options);
    expect(parsed.objects[0]).toMatchObject({ kind: 'text', x: 1000, y: -2000, height: 250 });
  });
});

describe('propriétés de trait (lot 1.9)', () => {
  const styledLayers: Layer[] = [
    { id: 'LAY-0001', name: 'Axes', color: '#ff0000', visible: true, locked: false, lineType: 'mixte', lineWeight: 0.18 },
    { id: 'LAY-0002', name: 'Contours', color: '#22d3ee', visible: true, locked: false, lineWeight: 0.5 },
  ];
  const objects: CadObject[] = [
    { ...base, id: 'OBJ-0001', name: 'Axe', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
    { ...base, id: 'OBJ-0002', name: 'Caché', kind: 'line', layerId: 'LAY-0002', x1: 0, y1: 10, x2: 100, y2: 10, lineType: 'interrompu', lineWeight: 0.35, color: '#00ff00' },
    { ...base, id: 'OBJ-0003', name: 'Fantôme', kind: 'circle', layerId: 'LAY-0002', cx: 0, cy: 0, r: 30, lineType: 'mixte-double' },
  ];

  it('exporte les types ISO, les épaisseurs et les couleurs (calque et objet)', () => {
    const { content, report } = exportDxf(objects, styledLayers, []);
    keepFixture('types-de-trait.dxf', content);
    for (const name of ['CONTINUOUS', 'ACAD_ISO02W100', 'ACAD_ISO04W100', 'ACAD_ISO05W100']) expect(content).toContain(`\n2\n${name}\n`);
    const ltype04 = content.slice(content.indexOf('ACAD_ISO04W100'));
    expect(ltype04).toMatch(/^ACAD_ISO04W100\n70\n0\n3\n[^\n]+\n72\n65\n73\n4\n40\n30.5\n49\n24\n74\n0\n49\n-3\n/);
    // Calque « Axes » : mixte, 0,18 mm.
    const axes = content.slice(content.indexOf('\n2\nAxes\n'));
    expect(axes).toMatch(/\n6\nACAD_ISO04W100\n370\n18\n/);
    // Ligne du calque : rien d'écrit sur l'entité (BYLAYER).
    const first = entityPairs(content, 'LINE');
    expect(first.some(([c]) => c === 6 || c === 370 || c === 420)).toBe(false);
    expect(content).toContain('\n6\nACAD_ISO02W100\n420\n65280\n370\n35\n');
    expect(content).toContain('\n6\nACAD_ISO05W100\n');
    expect(report.kept.join(' ')).toMatch(/Objets à trait propre : 2/);
  });

  it('relit types, épaisseurs et couleurs à l’import', () => {
    const { content } = exportDxf(objects, styledLayers, []);
    const parsed = parseDxf(content, { ...options, existingLayers: [] });
    const axes = parsed.layers.find(l => l.name === 'Axes')!;
    expect(axes).toMatchObject({ color: '#ff0000', lineType: 'mixte', lineWeight: 0.18 });
    const [axis, hidden, phantom] = parsed.objects;
    expect(axis.lineType).toBeUndefined();
    expect(axis.lineWeight).toBeUndefined();
    expect(hidden).toMatchObject({ lineType: 'interrompu', lineWeight: 0.35, color: '#00ff00' });
    expect(phantom).toMatchObject({ lineType: 'mixte-double' });
  });

  it('une couleur noire explicite (420 = 0) survit à l’aller-retour', () => {
    const black: CadObject[] = [{ ...base, id: 'OBJ-0001', name: 'N', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, color: '#000000' }];
    const parsed = parseDxf(exportDxf(black, styledLayers, []).content, { ...options, existingLayers: [] });
    expect(parsed.objects[0].color).toBe('#000000');
  });

  it('les cotes portent aussi leurs propriétés de trait', () => {
    const objs: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { ...base, id: 'OBJ-0002', name: 'C', kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: 10, color: '#ff00ff' },
    ];
    const { content } = exportDxf(objs, styledLayers, []);
    expect(content).toContain('\n420\n16711935\n');
  });

  it('reconnaît les noms usuels et les couleurs ACI de base', () => {
    const parsed = parseDxf(dxf(['0', 'LINE', '8', '0', '6', 'HIDDEN', '62', '1', '370', '50', '10', '0', '20', '0', '11', '1', '21', '0']), options);
    expect(parsed.objects[0]).toMatchObject({ lineType: 'interrompu', color: '#ff0000', lineWeight: 0.5 });
    const bylayer = parseDxf(dxf(['0', 'LINE', '8', '0', '6', 'BYLAYER', '62', '256', '370', '-1', '10', '0', '20', '0', '11', '1', '21', '0']), options);
    expect(bylayer.objects[0].lineType).toBeUndefined();
    expect(bylayer.objects[0].color).toBeUndefined();
    expect(bylayer.objects[0].lineWeight).toBeUndefined();
  });
});

describe('cotes par points (lot 2.6)', () => {
  it('exportées en traits, arcs et textes lisibles par ezdxf', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Série', kind: 'pdim', mode: 'chain', axis: 'horizontal', points: [0, 0, 1200, 0, 3000, 0], offset: 500 },
      { ...base, id: 'OBJ-0002', name: 'Angle', kind: 'pdim', mode: 'angular', axis: 'horizontal', points: [0, 0, 100, 0, 0, -100], offset: 50 },
      { ...base, id: 'OBJ-0003', name: 'Niveau', kind: 'pdim', mode: 'level', axis: 'horizontal', points: [0, -2500], offset: 800, reference: 0 },
    ];
    const { content, report } = exportDxf(objects, layers, []);
    keepFixture('cotes-par-points.dxf', content);
    expect(content).toContain('\nARC\n');
    expect(content.match(/\nTEXT\n/g)!.length).toBe(4);
    expect(content).toContain('\n1\n+2,50\n');
    expect(report.transformed.join(' ')).toMatch(/Cotes par points .* : 3/);
    // Flèches de la série (2 par cote élémentaire) et de l'angle (2) en SOLID ; triangle de niveau (3 LINE).
    expect(content.match(/\nSOLID\n/g)!.length).toBe(6);
  });
});

describe('hachures paramétrées (lot 3.2)', () => {
  it('motif _USER à l’angle, au pas et à l’origine de l’objet, avec îlot', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Dalle', kind: 'rect', x: 0, y: 0, w: 4000, h: 3000, hatch: 'cross', hatchParams: { angle: 30, spacing: 200, unit: 'modele' }, holes: ['OBJ-0002'] },
      { ...base, id: 'OBJ-0002', name: 'Trémie', kind: 'circle', cx: 2000, cy: 1500, r: 400 },
      { ...base, id: 'OBJ-0003', name: 'Mur', kind: 'rect', x: 0, y: 4000, w: 4000, h: 200, hatch: 'diagonal' },
    ];
    const { content, report } = exportDxf(objects, layers, [], { hatchPaperScale: 50 });
    keepFixture('hachures-parametrees.dxf', content);
    const hatch = entityPairs(content, 'HATCH');
    const v = (code: number) => hatch.filter(([c]) => c === code).map(([, x]) => x);
    expect(v(2)).toEqual(['_USER']);
    expect(v(91)).toEqual(['2']);          // contour + îlot
    expect(v(77)).toEqual(['1']);          // croisé (double)
    expect(v(53)).toEqual(['30', '120']);
    // Décalage perpendiculaire = pas réel de 200 mm.
    const [ox, oy] = [Number(v(45)[0]), Number(v(46)[0])];
    expect(Math.hypot(ox, oy)).toBeCloseTo(200, 6);
    // Pas papier de 3 mm à l'échelle 1:50 → 150 mm réels pour le mur.
    const lines = content.split('\n');
    const pairs: [number, string][] = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]]);
    const last = pairs.map(([c, x], i) => (c === 0 && x === 'HATCH' ? i : -1)).filter(i => i >= 0).pop()!;
    const end = pairs.findIndex(([c], i) => i > last && c === 0);
    const wall = pairs.slice(last, end);
    const g = (code: number) => Number(wall.find(([c]) => c === code)![1]);
    expect(Math.hypot(g(45), g(46))).toBeCloseTo(150, 6);
    expect(report.transformed.join(' ')).toMatch(/pas papier : 1 → pas réel à l'échelle 1:50/);
  });
});

describe('murs (lot 4.1)', () => {
  it('exportés en traits nettoyés et hachures, lisibles par ezdxf', () => {
    const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CadObject =>
      ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe', hatch: 'diagonal' });
    const { content, report } = exportDxf([wall('OBJ-0001', 0, 0, 5000, 0), wall('OBJ-0002', 5000, 0, 5000, 3000)], layers, []);
    keepFixture('murs.dxf', content);
    // L : 2 faces + 1 about libre par mur = 6 traits ; 2 hachures.
    expect(content.match(/\nLINE\n/g)).toHaveLength(6);
    expect(content.match(/\nHATCH\n/g)).toHaveLength(2);
    expect(report.transformed.join(' ')).toMatch(/Murs : 2/);
  });
});

describe('ouvertures (lot 4.2)', () => {
  it('baie coupée dans le mur, vantail et débattement exportés', () => {
    const objs: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'M', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe', hatch: 'diagonal' },
      { ...base, id: 'OBJ-0002', name: 'P', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 1500, width: 900, hinge: 'debut', side: 'droite' },
      { ...base, id: 'OBJ-0003', name: 'F', kind: 'opening', hostId: 'OBJ-0001', type: 'fenetre', position: 3500, width: 1200, hinge: 'debut', side: 'droite' },
    ];
    const { content, report } = exportDxf(objs, layers, []);
    keepFixture('ouvertures.dxf', content);
    expect(content.match(/\nARC\n/g)).toHaveLength(1);
    // Mur : 2 faces coupées deux fois (3 morceaux chacune) + 2 abouts + 4 tableaux = 12 ; porte : 1 vantail ; fenêtre : 3 traits.
    expect(content.match(/\nLINE\n/g)).toHaveLength(12 + 1 + 3);
    expect(report.transformed.join(' ')).toMatch(/Ouvertures : 2/);
    // Hachure du mur : contour et deux baies (îlots laissés vides).
    const hatch = content.slice(content.indexOf('\nHATCH\n')).split('\n').map(l => l.trim());
    expect(hatch[hatch.indexOf('91') + 1]).toBe('3');
  });
});

describe('pièces (lot 4.3)', () => {
  it('contour et étiquette nom + surface exportés, lisibles par ezdxf', () => {
    const w = (id: string, x1: number, y1: number, x2: number, y2: number): CadObject =>
      ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe' });
    const objs: CadObject[] = [
      w('OBJ-0001', 0, 0, 5200, 0), w('OBJ-0002', 5200, 0, 5200, 4200), w('OBJ-0003', 5200, 4200, 0, 4200), w('OBJ-0004', 0, 4200, 0, 0),
      { ...base, id: 'OBJ-0005', name: 'Séjour', kind: 'room', x: 2600, y: 2100 },
    ];
    const { content, report } = exportDxf(objs, layers, []);
    keepFixture('pieces.dxf', content);
    expect(content).toContain('\nLWPOLYLINE\n');
    expect(decodeDxfString(content)).toContain('Séjour');
    expect(content).toMatch(/\n1\n20,00 m\\U\+00B2\n/);
    expect(report.transformed.join(' ')).toMatch(/Pièces : 1/);
  });
});
