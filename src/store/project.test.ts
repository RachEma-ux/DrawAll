import { describe, expect, it } from 'vitest';
import { normalizeProjectState, normalizeSheets } from './project';

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

describe('feuilles enregistrées (lot 2.1)', () => {
  const layers = [{ id: 'LAY-0001', name: 'A', color: '#fff', visible: true, locked: false }];

  it('un projet antérieur sans feuilles reçoit une liste vide', () => {
    const state = normalizeProjectState({ versions: [{ seq: 0, label: 'v0', time: 1, layers, objects: [], blocks: [] }], pointer: 0 });
    expect(state.versions[0].sheets).toEqual([]);
  });

  it('complète les valeurs manquantes et oublie les calques disparus', () => {
    const [sheet] = normalizeSheets([{
      id: 'FEU-0001', format: 'A9', viewports: [{ id: 'FEN-0001', w: 200, h: 100, scale: { paper: 1, model: 0 }, hiddenLayerIds: ['LAY-0001', 'LAY-0999'] }],
    }], layers);
    expect(sheet).toMatchObject({ format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 } });
    expect(sheet.viewports[0]).toMatchObject({ x: 0, y: 0, w: 200, h: 100, scale: { paper: 1, model: 1 }, center: { x: 0, y: 0 }, hiddenLayerIds: ['LAY-0001'] });
  });

  it('conserve une feuille complète telle quelle', () => {
    const full = {
      id: 'FEU-0002', name: 'Plans', format: 'A1', orientation: 'portrait', margins: { top: 5, right: 5, bottom: 5, left: 25 },
      viewports: [{ id: 'FEN-0003', name: 'Détail', x: 30, y: 40, w: 100, h: 80, scale: { paper: 5, model: 1 }, center: { x: 12.5, y: -3 }, hiddenLayerIds: [] }],
      titleBlock: { project: 'P', title: 'T', author: 'A', projection: 'troisieme-diedre' },
    };
    expect(normalizeSheets([full], layers)).toEqual([full]);
  });
});

describe('niveaux enregistrés (lot 4.4)', () => {
  const layers = [{ id: 'LAY-0001', name: 'A', color: '#fff', visible: true, locked: false }];
  const obj = (id: string, levelId?: string) => ({ id, name: id, kind: 'line', classification: 'non-classifie', layerId: 'LAY-0001', createdSeq: 0, x1: 0, y1: 0, x2: 1, y2: 0, ...(levelId ? { levelId } : {}) });

  it('un projet antérieur reste sur un seul niveau, sans marque sur les objets', () => {
    const state = normalizeProjectState({ versions: [{ seq: 0, label: 'v0', time: 1, layers, objects: [obj('OBJ-0001')], blocks: [] }], pointer: 0 });
    expect(state.versions[0].levels).toBeUndefined();
    expect(state.versions[0].objects[0].levelId).toBeUndefined();
  });

  it('niveaux valides conservés ; objet et fenêtre sur un niveau inconnu ramenés au premier niveau', () => {
    const state = normalizeProjectState({
      versions: [{
        seq: 0, label: 'v0', time: 1, layers, blocks: [],
        levels: [{ id: 'NIV-0002', name: 'Étage', elevation: 2800 }, { id: 'NIV-0002', name: 'doublon', elevation: 0 }, { id: 'NIV-0003', name: 'Sous-sol', elevation: 'x' }],
        objects: [obj('OBJ-0001', 'NIV-0002'), obj('OBJ-0002', 'NIV-0099'), obj('OBJ-0003')],
        sheets: [{ id: 'FEU-0001', viewports: [{ id: 'FEN-0001', levelId: 'NIV-0099' }, { id: 'FEN-0002', levelId: 'NIV-0002' }] }],
      }],
      pointer: 0, activeLevelId: 'NIV-0002',
    });
    const v = state.versions[0];
    expect(v.levels).toEqual([{ id: 'NIV-0002', name: 'Étage', elevation: 2800 }, { id: 'NIV-0003', name: 'Sous-sol', elevation: 0 }]);
    // Premier niveau par altitude : Sous-sol (0) puis Étage (2 800).
    expect(v.objects.map(o => o.levelId)).toEqual(['NIV-0002', 'NIV-0003', 'NIV-0003']);
    expect(v.sheets![0].viewports.map(vp => vp.levelId)).toEqual(['NIV-0003', 'NIV-0002']);
    expect(state.activeLevelId).toBe('NIV-0002');
  });
});
