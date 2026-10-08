import { describe, expect, it } from 'vitest';
import type { CadObject } from '@/types/cad';
import { parentOf } from '@/types/cad';
import { mirrorObject, moveObject, notePosition, objectBounds, reanchorNote, rotateObject, scaleObject } from '@/lib/geometry';
import { cloneAll, rotation, translation, withDependencies } from '@/lib/array';
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

describe('note jointe transformée avec son objet', () => {
  const note = attached as Extract<CadObject, { kind: 'note' }>;
  const check = (fn: (o: CadObject) => Partial<CadObject> | null) => {
    const before = [rect, attached];
    const after = [{ ...rect, ...fn(rect) } as CadObject, attached];
    const p = reanchorNote(note, fn, before, after, [])!;
    const moved = { ...note, ...p };
    const expected = { ...notePosition(note, before, []) };
    const t = fn({ ...note, targetId: undefined, x: expected.x, y: expected.y } as CadObject) as { x?: number; y?: number };
    const got = notePosition(moved, [after[0], moved], []);
    expect(got.x).toBeCloseTo(t.x ?? expected.x, 6);
    expect(got.y).toBeCloseTo(t.y ?? expected.y, 6);
  };

  it('rotation, symétrie, échelle : le point noté suit la transformation de l’objet', () => {
    check(o => rotateObject(o, 1000, 2000, 90));
    check(o => mirrorObject(o, 'x', 1500));
    check(o => scaleObject(o, 1000, 2000, 2));
  });

  it('réseau polaire : la note de chaque copie suit la rotation', () => {
    const { objects } = cloneAll([rect, attached], [rotation(1000, 2000, 90)], 10, 1);
    const copyRect = objects.find(o => o.kind !== 'note')!;
    const copyNote = objects.find(o => o.kind === 'note') as Extract<CadObject, { kind: 'note' }>;
    const p = notePosition(copyNote, objects, []);
    // Point noté (1 050 ; 2 020) tourné de 90° (sens trigonométrique à l'écran) autour de (1 000 ; 2 000).
    expect(copyNote.targetId).toBe(copyRect.id);
    expect(p.x).toBeCloseTo(1020, 6);
    expect(p.y).toBeCloseTo(1950, 6);
  });
});
