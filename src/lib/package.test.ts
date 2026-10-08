import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion, ProjectState } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { normalizeProjectState } from '@/store/project';
import { canonicalJson, fromPackage, toPackage } from './package';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const objects: CadObject[] = [
  { ...base, id: 'OBJ-0001', name: 'Mur', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe', materialId: 'beton' },
  { ...base, id: 'OBJ-0002', name: 'Porte', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 1500, width: 900, hinge: 'debut', side: 'droite' },
  { ...base, id: 'OBJ-0003', name: 'Platine', kind: 'rect', x: 0, y: 1000, w: 100, h: 60, hatch: 'diagonal', hatchParams: { angle: 30, spacing: 4, unit: 'papier' }, lineType: 'mixte', color: '#ff0000' },
  { ...base, id: 'OBJ-0004', name: 'Cote', kind: 'dimension', targetId: 'OBJ-0003', style: 'horizontal', offset: -20, tolerance: { kind: 'classe', cls: 'H7' } } as CadObject,
  { ...base, id: 'OBJ-0005', name: 'Note 1', kind: 'note', x: 10, y: 5, targetId: 'OBJ-0001', text: 'Fissure', time: 1700000000000, photoIds: ['IMG-0001'], levelId: 'NIV-0002' } as CadObject,
];
const layers = createDefaultLayers();
const v0: MicroVersion = { seq: 0, label: 'Projet initial', time: 1, objects: objects.slice(0, 1), layers, blocks: [] };
const v1: MicroVersion = { seq: 1, label: 'Porte', time: 2, objects: objects.slice(0, 3), layers, blocks: [{ id: 'BLQ-0001', name: 'Vis', primitives: [{ ...base, id: 'BLQ-0001-P1', name: 'trait', kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }] }], profileId: 'enseignement' };
const v2: MicroVersion = {
  ...v1, seq: 2, label: 'Feuille', time: 3, objects, named: 'Indice A', index: 'A', surfaceRule: 'carrez',
  levels: [{ id: 'NIV-0001', name: 'Rez', elevation: 0 }, { id: 'NIV-0002', name: 'Étage', elevation: 2800 }],
  sheets: [{ id: 'FEU-0001', name: 'Plan', format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 }, viewports: [{ id: 'FEN-0001', name: 'Plan', x: 20, y: 10, w: 390, h: 245, scale: { paper: 1, model: 50 }, center: { x: 2500, y: 500 }, hiddenLayerIds: ['LAY-0003'], levelId: 'NIV-0002', context: 'vue' }], titleBlock: { project: 'Logement', title: 'Plan', author: 'R. E.', projection: 'premier-diedre' } }],
};
const state: ProjectState = normalizeProjectState({
  versions: [v0, v1, v2], pointer: 1, counter: 5, layerCounter: 4, blockCounter: 1, activeLayerId: 'LAY-0002', activeLevelId: 'NIV-0002',
  assets: { 'IMG-0001': { id: 'IMG-0001', name: 'photo.jpg', dataUrl: 'data:image/jpeg;base64,AAAA', px: { w: 4, h: 3 }, source: 'image' } },
});

describe('paquet natif (lot 8.2)', () => {
  it('aller-retour octet pour octet : exporter, réimporter, réexporter donne le même fichier', () => {
    const first = toPackage(state);
    const back = fromPackage(first);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(toPackage(back.state)).toBe(first);
  });

  it('le modèle relu est identique : versions, objets, feuilles, styles, niveaux, ressources, compteurs', () => {
    const back = fromPackage(toPackage(state));
    if (!back.ok) throw new Error(back.error);
    expect(canonicalJson(back.state)).toBe(canonicalJson(state));
    expect(back.state.versions).toHaveLength(3);
    expect(back.state.pointer).toBe(1);
    expect(back.state.versions[2].sheets![0].viewports[0]).toMatchObject({ levelId: 'NIV-0002', context: 'vue', hiddenLayerIds: ['LAY-0003'] });
    expect(back.state.assets!['IMG-0001'].dataUrl).toBe('data:image/jpeg;base64,AAAA');
  });

  it('fichiers refusés avec un message ; paquet prototype 0.1 relu en une version', () => {
    expect(fromPackage('pas du json')).toMatchObject({ ok: false });
    expect(fromPackage('{"manifest":{"format":"autre"}}')).toMatchObject({ ok: false, error: expect.stringMatching(/pas un paquet DrawAll/) });
    expect(fromPackage('{"manifest":{"format":"drawall-package","version":"2.0.0"},"projet":{}}')).toMatchObject({ ok: false, error: expect.stringMatching(/non prise en charge/) });
    const proto = fromPackage(JSON.stringify({ manifest: { format: 'drawall-package', version: '0.1.0-prototype' }, calques: layers, blocs: [], objets: objects.slice(0, 3) }));
    expect(proto.ok && proto.state.versions).toHaveLength(1);
    expect(proto.ok && proto.state.versions[0].objects).toHaveLength(3);
  });
});
