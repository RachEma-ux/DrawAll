import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion, ProjectState } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { decodeHistory, encodeHistory } from './history';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const rect = (i: number): CadObject => ({ ...base, id: `OBJ-${String(i).padStart(4, '0')}`, name: `Pièce ${i}`, kind: 'rect', x: i * 100, y: 0, w: 80, h: 60 });

/** Projet de 200 objets puis 1 000 modifications : déplacements, ajouts, suppressions, calques. */
function workedProject(): ProjectState {
  let objects = Array.from({ length: 200 }, (_, i) => rect(i + 1));
  let layers = createDefaultLayers();
  let counter = 200;
  const versions: MicroVersion[] = [{ seq: 0, label: 'v0', time: 0, objects, layers, blocks: [] }];
  for (let k = 1; k <= 1000; k++) {
    const r = k % 10;
    if (r < 6) { const i = k % objects.length; objects = objects.map((o, j) => (j === i && o.kind === 'rect' ? { ...o, x: o.x + 10 } : o)); }
    else if (r < 8) objects = [...objects, rect(++counter)];
    else if (r < 9) objects = objects.filter((_, j) => j !== k % objects.length);
    else layers = layers.map((l, j) => (j === 0 ? { ...l, color: k % 20 === 9 ? '#ff0000' : '#22d3ee' } : l));
    versions.push({ seq: k, label: `Modification ${k}`, time: k * 1000, objects, layers, blocks: [] });
  }
  return { versions, pointer: versions.length - 1, counter, layerCounter: 4, blockCounter: 0, activeLayerId: 'LAY-0001' };
}

describe('historique compact (lot 8.1)', () => {
  const state = workedProject();
  const compact = JSON.stringify(encodeHistory(state));

  it('1 000 modifications enregistrées en moins de 2 Mo', () => {
    const bytes = new TextEncoder().encode(compact).length;
    expect(bytes).toBeLessThan(2_000_000);
    // Copie complète à chaque modification : plusieurs dizaines de mégaoctets.
    expect(new TextEncoder().encode(JSON.stringify(state)).length).toBeGreaterThan(20 * bytes);
  });

  it('aller-retour exact : chaque version est reconstruite à l’identique', () => {
    const back = decodeHistory(JSON.parse(compact)) as ProjectState;
    expect(back.versions).toHaveLength(state.versions.length);
    expect(back).toStrictEqual(state);
  });

  it('la version courante reste écrite en entier ; les objets inchangés sont partagés en mémoire', () => {
    const stored = JSON.parse(compact);
    expect(stored.versions[stored.pointer].objects.length).toBe(state.versions[state.pointer].objects.length);
    const back = decodeHistory(stored) as ProjectState;
    const a = back.versions[1].objects, b = back.versions[2].objects;
    expect(b.filter(o => a.includes(o)).length).toBeGreaterThan(190);
  });

  it('ordre des objets, champs ajoutés puis retirés, versions nommées', () => {
    const v0: MicroVersion = { seq: 0, label: 'a', time: 0, objects: [rect(1), rect(2), rect(3)], layers: createDefaultLayers(), blocks: [] };
    const v1: MicroVersion = { ...v0, seq: 1, label: 'b', time: 1, objects: [rect(3), rect(1), rect(2)], profileId: 'enseignement', named: 'Indice A', index: 'A' };
    const v2: MicroVersion = { seq: 2, label: 'c', time: 2, objects: v1.objects, layers: v0.layers, blocks: [] };
    const s: ProjectState = { versions: [v0, v1, v2, v2], pointer: 3, counter: 3, layerCounter: 4, blockCounter: 0, activeLayerId: 'LAY-0001' };
    const back = decodeHistory(JSON.parse(JSON.stringify(encodeHistory(s)))) as ProjectState;
    expect(back).toStrictEqual(s);
  });
});
