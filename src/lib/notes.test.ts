import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { parentOf } from '@/types/cad';
import { moveObject, notePosition, objectBounds } from '@/lib/geometry';
import { cloneAll, translation, withDependencies } from '@/lib/array';
import { exportDxf } from '@/lib/dxf';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
const rect: CadObject = { ...base, id: 'OBJ-0001', kind: 'rect', x: 1000, y: 2000, w: 400, h: 300 };
const attached: CadObject = { ...base, id: 'OBJ-0002', kind: 'note', x: 50, y: 20, targetId: 'OBJ-0001', text: 'Fissure', time: 0 };
const loose: CadObject = { ...base, id: 'OBJ-0003', kind: 'note', x: 10, y: 10, text: 'Regard', time: 0 };

describe('notes de terrain (lot 7.3)', () => {
  it('une note jointe suit son objet ; une note sur un point reste au point', () => {
    expect(notePosition(attached as Extract<CadObject, { kind: 'note' }>, [rect, attached], [])).toEqual({ x: 1050, y: 2020 });
    const moved = { ...rect, ...moveObject(rect, 500, 0) } as CadObject;
    expect(notePosition(attached as Extract<CadObject, { kind: 'note' }>, [moved, attached], [])).toEqual({ x: 1550, y: 2020 });
    expect(notePosition(loose as Extract<CadObject, { kind: 'note' }>, [rect, loose], [])).toEqual({ x: 10, y: 10 });
    expect(objectBounds(attached, [], [rect, attached])).toEqual({ minX: 1050, minY: 2020, maxX: 1050, maxY: 2020 });
  });

  it('une note jointe dépend de son objet : copiée et supprimée avec lui', () => {
    expect(parentOf(attached)).toBe('OBJ-0001');
    expect(parentOf(loose)).toBeNull();
    expect(withDependencies([rect, attached], ['OBJ-0001']).map(o => o.id)).toEqual(['OBJ-0001', 'OBJ-0002']);
    const { objects } = cloneAll([rect, attached], [translation(0, 1000)], 10, 1);
    const copy = objects.find(o => o.kind === 'note');
    expect(copy).toMatchObject({ targetId: objects.find(o => o.kind === 'rect')!.id, x: 50, y: 20 });
  });

  it('les notes ne sont pas exportées en DXF ; le rapport le dit', () => {
    const { content, report } = exportDxf([rect, attached, loose], [{ id: 'LAY-0001', name: 'Dessin', color: '#ffffff', visible: true, locked: false }], []);
    expect(content).not.toContain('Fissure');
    expect(report.lost.join(' ')).toMatch(/Notes de terrain : 2/);
  });
});
