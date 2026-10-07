import { describe, expect, it } from 'vitest';
import { normalizeProjectState } from './project';

describe('normalisation du projet enregistré', () => {
  it('conserve les propriétés de trait des calques et des objets', () => {
    const state = normalizeProjectState({
      versions: [{
        seq: 0, label: 'v0', time: 1,
        layers: [{ id: 'LAY-0001', name: 'Axes', color: '#ff0000', visible: true, locked: false, lineType: 'mixte', lineWeight: 0.18 }],
        objects: [{ id: 'OBJ-0001', name: 'A', kind: 'line', classification: 'non-classifie', layerId: 'LAY-0001', createdSeq: 0, x1: 0, y1: 0, x2: 1, y2: 0, lineType: 'interrompu', lineWeight: 0.5, color: '#00ff00' }],
        blocks: [],
      }],
      pointer: 0, counter: 1, layerCounter: 1, blockCounter: 0, activeLayerId: 'LAY-0001',
    });
    const v = state.versions[0];
    expect(v.layers[0]).toMatchObject({ lineType: 'mixte', lineWeight: 0.18 });
    expect(v.objects[0]).toMatchObject({ lineType: 'interrompu', lineWeight: 0.5, color: '#00ff00' });
  });

  it('écarte un type de trait inconnu ou une épaisseur invalide', () => {
    const state = normalizeProjectState({
      versions: [{ seq: 0, label: 'v0', time: 1, layers: [{ id: 'LAY-0001', name: 'X', color: '#fff', lineType: 'zigzag', lineWeight: -1 }], objects: [], blocks: [] }],
      pointer: 0,
    });
    expect(state.versions[0].layers[0].lineType).toBeUndefined();
    expect(state.versions[0].layers[0].lineWeight).toBeUndefined();
  });
});
