import { describe, expect, it } from 'vitest';
import type { CadObject, WallObj } from '@/types/cad';
import { normalizeZones } from '@/store/project';
import { areaM2, roomPolygons } from './rooms';
import { zoneColors, zoneSummaries } from './zones';

const base = { classification: 'architecture' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallObj => ({ ...base, id, name: id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe' });
const room = (id: string, name: string, x: number, y: number, zoneId?: string) => ({ ...base, id, name, kind: 'room', x, y, ...(zoneId ? { zoneId } : {}) }) as CadObject;

// Murs de 200 mm d'axe en axe : 5 × 4 m, refend à x = 3 000.
const walls = [wall('W1', 0, 0, 5000, 0), wall('W2', 5000, 0, 5000, 4000), wall('W3', 5000, 4000, 0, 4000), wall('W4', 0, 4000, 0, 0), wall('W5', 3000, 0, 3000, 4000)];

describe('zones (lot 13.3)', () => {
  it('surface cumulée : somme exacte des surfaces des pièces de la zone', () => {
    const objects = [...walls, room('R1', 'Séjour', 1500, 2000, 'ZON-0001'), room('R2', 'Cuisine', 4000, 2000, 'ZON-0001'), room('R3', 'Isolée', 9000, 9000)];
    const polys = roomPolygons(objects);
    const a1 = areaM2(polys.get('R1')!), a2 = areaM2(polys.get('R2')!);
    // Contours intérieurs : 2,80 × 3,80 et 1,80 × 3,80 m.
    expect(a1).toBeCloseTo(10.64, 9);
    expect(a2).toBeCloseTo(6.84, 9);
    const [s] = zoneSummaries(objects, [{ id: 'ZON-0001', name: 'Logement', color: '#22d3ee' }]);
    expect(s.rooms.map(r => r.id)).toEqual(['R1', 'R2']);
    expect(s.totalM2).toBe(a1 + a2);
    expect(s.totalM2).toBeCloseTo(17.48, 9);
    expect(s.unevaluated).toBe(0);
  });

  it('pièce non fermée : non évaluée, hors de la somme, signalée', () => {
    const objects = [...walls, room('R1', 'Séjour', 1500, 2000, 'Z'), room('R3', 'Ouverte', 9000, 9000, 'Z')];
    const [s] = zoneSummaries(objects, [{ id: 'Z', name: 'Z', color: '#000000' }]);
    expect(s.rooms.find(r => r.id === 'R3')!.areaM2).toBeNull();
    expect(s.unevaluated).toBe(1);
    expect(s.totalM2).toBeCloseTo(10.64, 9);
  });

  it('couleurs : pièces rattachées à une zone connue seulement', () => {
    const objects = [room('R1', 'A', 0, 0, 'Z1'), room('R2', 'B', 0, 0, 'Z9'), room('R3', 'C', 0, 0)];
    expect([...zoneColors(objects, [{ id: 'Z1', name: 'Z1', color: '#ff0000' }])]).toEqual([['R1', '#ff0000']]);
  });

  it('relecture : couleur #rrggbb, identifiants uniques', () => {
    const ok = [{ id: 'ZON-0001', name: 'Logement', color: '#22d3ee' }];
    expect(normalizeZones([...ok, { id: 'ZON-0001', name: 'Doublon', color: '#000000' }, { id: 'ZON-0002', name: 'X', color: 'rouge' }, null])).toEqual(ok);
    expect(normalizeZones('x')).toBeUndefined();
  });
});
