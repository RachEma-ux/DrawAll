import { describe, expect, it } from 'vitest';
import type { BomObj, CadObject, WallObj } from '@/types/cad';
import { bomAnnotation } from './bom';
import { scheduleTable } from './schedules';

const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, thickness = 200): WallObj => ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness, justification: 'axe' });
const walls = [wall('W1', 0, 0, 5000, 0), wall('W2', 5000, 0, 5000, 4000), wall('W3', 5000, 4000, 0, 4000), wall('W4', 0, 4000, 0, 0), wall('W5', 3000, 0, 3000, 4000, 100)];
const opening = (id: string, type: 'porte' | 'fenetre', width: number) => ({ ...base, id, name: id, kind: 'opening', hostId: 'W1', type, position: 1000, width, hinge: 'debut', side: 'gauche' }) as CadObject;
const model: CadObject[] = [
  ...walls,
  { ...base, id: 'R1', name: 'Séjour', kind: 'room', x: 1500, y: 2000 } as CadObject,
  { ...base, id: 'R2', name: 'Cuisine', kind: 'room', x: 4000, y: 2000 } as CadObject,
  { ...base, id: 'R3', name: 'Cellier', kind: 'room', x: 9000, y: 9000 } as CadObject,
  opening('O1', 'porte', 900), opening('O2', 'fenetre', 1200), opening('O3', 'porte', 900), opening('O4', 'porte', 800),
];

describe('tableaux de quantités (lot 13.5)', () => {
  it('pièces : surfaces au contour intérieur, pièce non fermée non évaluée, total minorant', () => {
    const t = scheduleTable('pieces', model);
    // Refend de 100 mm : séjour 2,85 × 3,80 ; cuisine 1,85 × 3,80.
    expect(t.rows).toEqual([['Séjour', '10,83 m²'], ['Cuisine', '7,03 m²'], ['Cellier', 'non évaluée']]);
    expect(t.total).toEqual(['Total', 'au moins 17,86 m²']);
  });

  it('ouvertures : regroupées par type et largeur, quantités et total', () => {
    const t = scheduleTable('ouvertures', model);
    expect(t.rows).toEqual([['Porte', '900', '2'], ['Fenêtre', '1\u202f200', '1'], ['Porte', '800', '1']]);
    expect(t.total).toEqual(['Total', '', '4']);
  });

  it('murs : épaisseur, longueur d’axe, total ; modifier un mur met le tableau à jour', () => {
    const t = scheduleTable('murs', model);
    expect(t.rows[0]).toEqual(['W1', '200', '5,00']);
    expect(t.rows[4]).toEqual(['W5', '100', '4,00']);
    expect(t.total).toEqual(['Total', '', '22,00']);
    const longer = model.map(o => (o.id === 'W1' ? { ...o, x2: 6500 } as CadObject : o));
    expect(scheduleTable('murs', longer).rows[0]).toEqual(['W1', '200', '6,50']);
    expect(scheduleTable('murs', longer).total).toEqual(['Total', '', '23,50']);
  });

  it('dessin : en-tête, lignes et total dans la géométrie du tableau posé', () => {
    const o = { ...base, id: 'T', name: 'Tableau des murs', kind: 'bom', x: 0, y: 0, table: 'murs' } as BomObj;
    const texts = bomAnnotation(o, 1, model, []).texts.map(t => t.text);
    expect(texts.slice(0, 3)).toEqual(['Mur', 'Épaisseur (mm)', 'Longueur (m)']);
    expect(texts).toContain('22,00');
    expect(texts).toContain('Total');
  });
});

describe('tableaux de quantités : feuille et échanges (lot 13.5)', async () => {
  const { sheetToPdf, pdfString } = await import('./pdf');
  const { exportToDxf } = await import('./dxf');
  const { createDefaultLayers } = await import('@/types/cad');
  const layers = createDefaultLayers();
  const table = { ...base, id: 'T1', name: 'Tableau des murs', kind: 'bom', x: 6000, y: 0, table: 'murs', layerId: layers[0].id } as CadObject;
  const objects = [...model.map(o => ({ ...o, layerId: layers[0].id }) as CadObject), table];

  it('posé sur une feuille : le tableau figure dans le PDF de la feuille, total compris', () => {
    const pdf = sheetToPdf({
      sheet: { id: 'FEU-0001', name: 'Quantités', format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 },
        viewports: [{ id: 'FEN-0001', name: 'Plan', x: 20, y: 10, w: 390, h: 245, scale: { paper: 1, model: 50 }, center: { x: 5000, y: 2000 }, hiddenLayerIds: [] }] },
      objects, layers, blocks: [], versions: [{ seq: 0, label: 'v0', time: 0, objects, layers, blocks: [] }], pointer: 0, date: new Date(0),
    });
    expect(pdf).toContain(pdfString('Longueur (m)'));
    expect(pdf).toContain(pdfString('22,00'));
  });

  it('DXF : en-tête, lignes et total en textes', () => {
    const dxf = exportToDxf(objects, layers, []);
    expect(dxf).toContain('Longueur (m)');
    expect(dxf).toContain('22,00');
  });
});
