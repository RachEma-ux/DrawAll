import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CadObject, Layer, MicroVersion, Sheet } from '@/types/cad';
import { sheetToSvg } from '@/components/SheetSvg';
import { profileById } from '@/lib/materials';
import { DEFAULT_LEVEL } from '@/lib/levels';

const layers: Layer[] = [{ id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false }];
const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
const objects: CadObject[] = [
  { ...base, id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 5000, y2: 0 },
  { ...base, id: 'OBJ-0002', kind: 'rect', x: 0, y: 500, w: 2000, h: 1000, hatch: 'diagonal' },
  { ...base, id: 'OBJ-0003', kind: 'text', x: 0, y: -300, content: 'Séjour', height: 125, rotation: 0, align: 'left' },
  { ...base, id: 'OBJ-0004', kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: -400 },
];
const sheet: Sheet = {
  id: 'FEU-0001', name: 'Plan', format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 },
  viewports: [{ id: 'FEN-0001', name: 'Plan', x: 20, y: 10, w: 390, h: 245, scale: { paper: 1, model: 50 }, center: { x: 2500, y: 500 }, hiddenLayerIds: [] }],
  titleBlock: { project: 'Logement', title: 'Plan du rez', author: 'R. E.', projection: 'premier-diedre' },
};
const versions: MicroVersion[] = [{ seq: 0, label: 'v0', time: Date.UTC(2026, 9, 7, 12), objects: [], layers, blocks: [] }];
const svg = sheetToSvg({ sheet, objects, levels: [DEFAULT_LEVEL], layers, blocks: [], profile: profileById(undefined), view: 'batiment', versions, pointer: 0 });
const dir = process.env.SVG_FIXTURES_DIR;
if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'feuille-a3.svg'), svg); }

describe('export SVG (lot 6.4)', () => {
  it('SVG autonome aux dimensions exactes de la feuille (A3 paysage : 420 × 297 mm)', () => {
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297"')).toBe(true);
  });

  it('fenêtre découpée à l’échelle : viewBox du modèle de 19 500 × 12 250 mm au 1:50', () => {
    expect(svg).toContain('data-fenetre="FEN-0001" x="20" y="10" width="390" height="245" viewBox="-7250 -5625 19500 12250"');
  });

  it('dessin, cote, texte et cartouche présents ; monochrome', () => {
    expect(svg).toContain('Séjour');
    expect(svg).toMatch(/5\s000 mm/); // séparateur de milliers : espace fine insécable
    expect(svg).toContain('Plan du rez');
    const colors = [...svg.matchAll(/(?:stroke|fill)="(#[0-9a-fA-F]+)"/g)].map(m => m[1].toLowerCase());
    expect(colors.length).toBeGreaterThan(5);
    expect(colors.every(c => c === '#000000')).toBe(true);
    expect(svg).not.toMatch(/rgba\(/);
    // Papier et fond du cartouche restent blancs.
    expect((svg.match(/fill="white"/g) ?? []).length).toBe(2);
  });

  it('un trait blanc (couleur 7 d’un DXF) est rendu en noir, pas effacé par le papier', () => {
    const white = sheetToSvg({ sheet, objects: [{ ...objects[0], color: '#ffffff' }], levels: [DEFAULT_LEVEL], layers: [{ ...layers[0], color: '#ffffff' }], blocks: [], profile: profileById(undefined), view: 'batiment', versions, pointer: 0 });
    const line = white.match(/<line[^>]*>/)![0];
    expect(line).toContain('stroke="#000000"');
    expect(white).not.toMatch(/(?:stroke|fill)="#fff(?:fff)?"/i);
  });
});
