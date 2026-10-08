import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, Layer, MicroVersion, Sheet } from '@/types/cad';
import { MM_TO_PT, arcPath, pdfBytes, pdfString, sheetToPdf, textWidthEm } from './pdf';

const layers: Layer[] = [{ id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false }];
const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
const versions: MicroVersion[] = [{ seq: 0, label: 'v0', time: Date.UTC(2026, 9, 7, 12), objects: [], layers, blocks: [], named: 'Indice A' }];

// Un mur de 5 000 mm au 1:50 doit mesurer 100 mm sur la feuille.
const objects: CadObject[] = [
  { ...base, id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 5000, y2: 0 },
  { ...base, id: 'OBJ-0002', kind: 'rect', x: 0, y: 500, w: 2000, h: 1000, hatch: 'diagonal' },
  { ...base, id: 'OBJ-0003', kind: 'circle', cx: 4000, cy: 1000, r: 250, lineType: 'mixte' },
  { ...base, id: 'OBJ-0004', kind: 'text', x: 0, y: -300, content: 'Séjour 24,5 m²', height: 125, rotation: 0, align: 'left' },
  { ...base, id: 'OBJ-0005', kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: -400 },
];

const sheet: Sheet = {
  id: 'FEU-0001', name: 'Plan', format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 },
  viewports: [{ id: 'FEN-0001', name: 'Plan', x: 20, y: 10, w: 390, h: 245, scale: { paper: 1, model: 50 }, center: { x: 2500, y: 500 }, hiddenLayerIds: [] }],
  titleBlock: { project: 'Logement', title: 'Plan du rez', author: 'R. E.', projection: 'premier-diedre' },
};

const pdf = sheetToPdf({ sheet, objects, layers, blocks: [], versions, pointer: 0, date: new Date(Date.UTC(2026, 9, 7, 12)) });
const dir = process.env.PDF_FIXTURES_DIR;
if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'feuille-a3.pdf'), pdfBytes(pdf)); }

/** Segments « x1 y1 m x2 y2 l S » du flux de contenu. */
function segments(content: string): [number, number, number, number][] {
  const re = /(-?[\d.]+) (-?[\d.]+) m (-?[\d.]+) (-?[\d.]+) l S/g;
  const out: [number, number, number, number][] = [];
  for (let m = re.exec(content); m; m = re.exec(content)) out.push([+m[1], +m[2], +m[3], +m[4]]);
  return out;
}

describe('export PDF calibré', () => {
  it('page aux dimensions exactes de la feuille (A3 paysage, 420 × 297 mm)', () => {
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf)!;
    expect(Number(box[1]) / MM_TO_PT).toBeCloseTo(420, 2);
    expect(Number(box[2]) / MM_TO_PT).toBeCloseTo(297, 2);
  });

  it('un trait de 100 mm papier mesure 100 ± 0,1 mm dans le PDF', () => {
    const lengths = segments(pdf).map(([a, b, c, d]) => Math.hypot(c - a, d - b) / MM_TO_PT);
    expect(lengths.some(l => Math.abs(l - 100) <= 0.1)).toBe(true);
    // Le mur est horizontal et à sa place : (0 ; 0) du modèle au point (20 + 195 − 50 ; 10 + 122,5 − 10) de la feuille.
    const wall = segments(pdf).find(([a, b, c, d]) => Math.abs(Math.hypot(c - a, d - b) / MM_TO_PT - 100) < 0.1)!;
    expect(wall[0] / MM_TO_PT).toBeCloseTo(165, 2);
    expect((842 - wall[1]) / MM_TO_PT).toBeCloseTo(122.5, 0);
  });

  it('fenêtre découpée, épaisseur et motif ISO en millimètres papier', () => {
    expect(pdf).toContain(`${(20 * MM_TO_PT).toFixed(3).replace(/0+$/, '')}`);
    expect(pdf).toMatch(/re W n/);
    // Trait mixte 0,25 mm : 24 d, 3 d, 0,5 d, 3 d → 6 ; 0,75 ; 0,125 ; 0,75 mm.
    const dash = [6, 0.75, 0.125, 0.75].map(v => String(Math.round(v * MM_TO_PT * 1000) / 1000)).join(' ');
    expect(pdf).toContain(`[${dash}] 0 d`);
    expect(pdf).toContain(`${String(Math.round(0.25 * MM_TO_PT * 1000) / 1000)} w`);
  });

  it('textes en WinAnsi, cartouche et cote', () => {
    expect(pdf).toContain(pdfString('Séjour 24,5 m²'));
    expect(pdfString('Séjour 24,5 m²')).toBe('(S\\351jour 24,5 m\\262)');
    expect(pdfString('(a\\b)')).toBe('(\\(a\\\\b\\))');
    expect(pdf).toContain('(Logement)');
    expect(pdf).toContain('(5\\240000 mm)');
  });

  it('structure : table xref aux bons décalages', () => {
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((off, i) => expect(pdf.slice(off, off + 7)).toBe(`${i + 1} 0 obj`));
    const len = Number(/\/Length (\d+) >>\nstream\n/.exec(pdf)![1]);
    const start = pdf.indexOf('stream\n') + 7;
    expect(pdf.slice(start + len, start + len + 10)).toBe('\nendstream');
  });

  it('arc en courbes de Bézier : extrémités exactes', () => {
    const path = arcPath({ x: 0, y: 0 }, 10, 0, 90);
    expect(path.split('\n')[0]).toBe('10 0 m');
    expect(path.split('\n')[1].endsWith('0 10 c')).toBe(true);
    expect(textWidthEm('A')).toBeCloseTo(0.667, 3);
  });
});

describe('cote à trait propre (lot 2.4)', () => {
  it('la ligne de cote garde son type de trait dans le PDF', () => {
    const dashed = objects.map(o => (o.kind === 'dimension' ? { ...o, lineType: 'interrompu' as const } : o));
    const out = sheetToPdf({ sheet, objects: dashed, layers, blocks: [], versions, pointer: 0, date: new Date(Date.UTC(2026, 9, 7, 12)) });
    // Motif ISO 02 à 0,18 mm : 12 × 0,18 = 2,16 mm de trait.
    expect(out).toContain(`[${(2.16 * MM_TO_PT).toFixed(3).replace(/0+$/, '')} `);
  });
});

describe('niveau d’une fenêtre (lot 4.4)', () => {
  it('une fenêtre sans niveau valide montre le premier niveau, comme l’aperçu', () => {
    // Le rez (NIV-0001) a été supprimé : la fenêtre sans niveau montre l'étage restant.
    const upper = objects.map(o => ({ ...o, levelId: 'NIV-0002' }) as CadObject);
    const levels = [{ id: 'NIV-0002', name: 'Étage 1', elevation: 2800 }];
    const out = sheetToPdf({ sheet, objects: upper, levels, layers, blocks: [], versions, pointer: 0, date: new Date(Date.UTC(2026, 9, 7, 12)) });
    expect(out).toContain(pdfString('Séjour 24,5 m²'));
  });
});
