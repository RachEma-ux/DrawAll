import { describe, expect, it } from 'vitest';
import type { BlockDef, CadObject } from '@/types/cad';
import { BOM_PAPER, balloonGeometry, bomGeometry, bomRows, itemOf, partDesignation } from './bom';

const base = { classification: 'mecanique' as const, layerId: 'LAY-0001', hatch: 'none' as const, name: 'o' };
const blocks: BlockDef[] = [{ id: 'BLQ-0001', name: 'Vis H M8', primitives: [{ ...base, id: 'BLQ-0001-P1', kind: 'circle', cx: 0, cy: 0, r: 4, createdSeq: 0 }] }];
const plate: CadObject = { ...base, id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, part: 'Platine', materialId: 'acier', createdSeq: 1 };
const screw = (id: string, seq: number): CadObject => ({ ...base, id, kind: 'blockRef', blockId: 'BLQ-0001', x: 10, y: 10, scale: 1, createdSeq: seq });
const line: CadObject = { ...base, id: 'OBJ-0009', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, createdSeq: 0 };

describe('nomenclature (lot 5.4)', () => {
  it('pièces : désignation saisie ou nom du bloc ; les autres objets n’en sont pas', () => {
    expect(partDesignation(plate, blocks)).toBe('Platine');
    expect(partDesignation(screw('OBJ-0002', 2), blocks)).toBe('Vis H M8');
    expect(partDesignation(line, blocks)).toBeNull();
  });

  it('lignes : repère, désignation, matériau, quantité ; ordre d’apparition', () => {
    const rows = bomRows([line, plate, screw('OBJ-0002', 2), screw('OBJ-0003', 3)], blocks);
    expect(rows.map(r => [r.item, r.designation, r.material, r.quantity])).toEqual([[1, 'Platine', 'Acier', 1], [2, 'Vis H M8', '—', 2]]);
    expect(itemOf(rows, 'OBJ-0003')).toBe(2);
    expect(itemOf(rows, 'OBJ-0009')).toBeNull();
  });

  it('ajouter une pièce met à jour la nomenclature sans renuméroter', () => {
    const before = bomRows([plate, screw('OBJ-0002', 2)], blocks);
    const washer: CadObject = { ...base, id: 'OBJ-0004', kind: 'circle', cx: 0, cy: 0, r: 8, part: 'Rondelle M8', materialId: 'acier', createdSeq: 4 };
    const after = bomRows([plate, screw('OBJ-0002', 2), washer, screw('OBJ-0005', 5)], blocks);
    expect(after.slice(0, before.length).map(r => [r.item, r.designation])).toEqual(before.map(r => [r.item, r.designation]));
    expect(after.map(r => [r.item, r.designation, r.quantity])).toEqual([[1, 'Platine', 1], [2, 'Vis H M8', 2], [3, 'Rondelle M8', 1]]);
    // Même désignation, autre matériau : une autre ligne.
    const alu = { ...washer, id: 'OBJ-0006', materialId: 'aluminium', createdSeq: 6 } as CadObject;
    expect(bomRows([washer, alu], blocks).map(r => r.material)).toEqual(['Acier', 'Aluminium']);
  });

  it('tableau : en-tête et une ligne par pièce, à la taille papier', () => {
    const rows = bomRows([plate, screw('OBJ-0002', 2)], blocks);
    const g = bomGeometry({ x: 0, y: 0 }, rows, 50);
    expect(g.texts.map(t => t.text)).toEqual(['Rep.', 'Désignation', 'Matériau', 'Qté', '1', 'Platine', 'Acier', '1', '2', 'Vis H M8', '—', '1']);
    // 3 lignes de texte → 4 traits horizontaux, 5 verticaux ; hauteur de ligne 7 mm papier au 1:50.
    expect(g.lines).toHaveLength(9);
    expect(g.lines[1].a.y).toBe(BOM_PAPER.row * 50);
  });

  it('repère : bulle numérotée, ligne de repère terminée par un point sur la pièce', () => {
    const g = balloonGeometry({ x: 100, y: -50 }, 2, { x: 50, y: 30 }, 1);
    expect(g.texts[0].text).toBe('2');
    expect(g.circles[0].r).toBe(BOM_PAPER.balloon);
    expect(g.lines[0].b).toEqual({ x: 50, y: 30 });
    expect(g.fills).toHaveLength(1);
    expect(balloonGeometry({ x: 0, y: 0 }, null, null, 1).texts[0].text).toBe('?');
  });
});
