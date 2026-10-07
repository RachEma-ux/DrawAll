import { describe, expect, it } from 'vitest';
import type { MicroVersion, Sheet } from '@/types/cad';
import { indexLetter, nextIndexLetter, revisionIndex, sheetScales, titleBlockFields, titleBlockRect } from './titleblock';

const v = (seq: number, named?: string): MicroVersion => ({ seq, label: `v${seq}`, time: Date.UTC(2026, 9, 7, 12), objects: [], layers: [], blocks: [], ...(named ? { named } : {}) });

const sheet: Sheet = {
  id: 'FEU-0001', name: 'Plans', format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 },
  viewports: [
    { id: 'FEN-0001', name: 'a', x: 20, y: 10, w: 190, h: 200, scale: { paper: 1, model: 50 }, center: { x: 0, y: 0 }, hiddenLayerIds: [] },
    { id: 'FEN-0002', name: 'b', x: 220, y: 10, w: 180, h: 200, scale: { paper: 1, model: 5 }, center: { x: 0, y: 0 }, hiddenLayerIds: [] },
    { id: 'FEN-0003', name: 'c', x: 220, y: 10, w: 10, h: 10, scale: { paper: 1, model: 50 }, center: { x: 0, y: 0 }, hiddenLayerIds: [] },
  ],
  titleBlock: { project: 'Logement Rue Haute', title: 'Plan du rez', author: 'R. E.', projection: 'premier-diedre' },
};

describe('indice', () => {
  it('lettres A, B… Z, AA', () => {
    expect([1, 2, 26, 27, 28].map(indexLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });

  it('l’indice suit les versions nommées', () => {
    const versions = [v(0), v(1, 'Esquisse'), v(2), v(3, 'APD'), v(4)];
    expect(revisionIndex(versions, 0)).toEqual({ letter: null, named: null, pending: true });
    expect(revisionIndex(versions, 1)).toEqual({ letter: 'A', named: 'Esquisse', pending: false });
    expect(revisionIndex(versions, 2)).toEqual({ letter: 'A', named: 'Esquisse', pending: true });
    expect(revisionIndex(versions, 3)).toEqual({ letter: 'B', named: 'APD', pending: false });
    // En revenant dans l'historique, l'indice est celui de la version affichée.
    expect(revisionIndex(versions, 2).letter).toBe('A');
    expect(nextIndexLetter(versions, 4)).toBe('C');
    expect(nextIndexLetter(versions, 3)).toBe('B');
    expect(nextIndexLetter([v(0)], 0)).toBe('A');
  });
});

describe('cartouche', () => {
  it('champs liés au projet et à la version', () => {
    const fields = Object.fromEntries(titleBlockFields(sheet, [v(0), v(1, 'APD')], 1).map(f => [f.key, f.value]));
    expect(fields).toMatchObject({
      project: 'Logement Rue Haute', title: 'Plan du rez', scale: '1:50 / 1:5', date: '07/10/2026',
      index: 'A', author: 'R. E.', projection: 'Premier dièdre (ISO E)', sheet: 'FEU-0001 · A3',
    });
  });

  it('valeurs absentes affichées « — », sans en inventer', () => {
    const fields = Object.fromEntries(titleBlockFields({ ...sheet, titleBlock: undefined, viewports: [] }, [v(0)], 0).map(f => [f.key, f.value]));
    expect(fields).toMatchObject({ project: '—', title: '—', author: '—', scale: '—', index: '— (aucune version nommée)' });
    expect(sheetScales({ ...sheet, viewports: [] })).toBe('—');
  });

  it('placé au coin inférieur droit de la zone utile, 180 mm de large', () => {
    expect(titleBlockRect(sheet)).toEqual({ x: 230, y: 255, w: 180, h: 32 });
  });
});
