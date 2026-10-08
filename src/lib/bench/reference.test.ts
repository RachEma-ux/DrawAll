import { describe, expect, it } from 'vitest';
import { roomPolygons } from '@/lib/rooms';
import { onLevel } from '@/lib/levels';
import { REFERENCE_SPEC, referenceProject } from './reference';

describe('projet de référence du banc (lot 19.2)', () => {
  it('déclaré et déterministe : comptes par type, identifiants uniques', () => {
    const p = referenceProject();
    expect(p.counts).toEqual({ wall: 440, column: 242, opening: 200, room: 200 });
    expect(p.objects).toHaveLength(1082);
    expect(new Set(p.objects.map(o => o.id)).size).toBe(1082);
    expect(referenceProject()).toEqual(p);
    expect(p.levels.map(l => [l.name, l.elevation])).toEqual([['Rez-de-chaussée', 0], ['Étage 1', 3000]]);
    expect(REFERENCE_SPEC).toEqual({ levels: 2, cells: 10, pitch: 4000 });
  });

  it('chaque pièce est fermée par les murs de son niveau', () => {
    const p = referenceProject({ levels: 1, cells: 3, pitch: 4000 });
    const polys = roomPolygons(onLevel(p.objects, 'NIV-0001'));
    expect([...polys.values()].every(Boolean)).toBe(true);
    expect(polys.size).toBe(9);
  });
});
