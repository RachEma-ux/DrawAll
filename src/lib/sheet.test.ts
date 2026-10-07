import { describe, expect, it } from 'vitest';
import type { Layer, Sheet, Viewport } from '@/types/cad';
import {
  DEFAULT_MARGINS, fitScale, formatScale, layerVisibleInViewport, modelLength, modelToPaper, paperLength,
  paperToModel, parseScale, printableArea, sheetIssues, sheetSize, viewportModelRect,
} from './sheet';

const vp = (over: Partial<Viewport> = {}): Viewport => ({
  id: 'FEN-0001', name: 'Plan', x: 20, y: 10, w: 200, h: 100,
  scale: { paper: 1, model: 50 }, center: { x: 5000, y: 2500 }, hiddenLayerIds: [], ...over,
});

describe('échelles', () => {
  it('5 000 mm au 1:50 = 100 mm papier ; au 1:100 = 50 mm', () => {
    expect(paperLength(5000, { paper: 1, model: 50 })).toBe(100);
    expect(paperLength(5000, { paper: 1, model: 100 })).toBe(50);
    expect(modelLength(100, { paper: 1, model: 50 })).toBe(5000);
  });

  it('agrandissement 5:1 : 2 mm réels = 10 mm papier', () => {
    expect(paperLength(2, { paper: 5, model: 1 })).toBe(10);
  });

  it('désignation et lecture ISO 5455', () => {
    expect(formatScale({ paper: 1, model: 50 })).toBe('1:50');
    expect(formatScale({ paper: 5, model: 1 })).toBe('5:1');
    expect(parseScale('1:50')).toEqual({ paper: 1, model: 50 });
    expect(parseScale(' 1 / 2,5 ')).toEqual({ paper: 1, model: 2.5 });
    expect(parseScale('0:5')).toBeNull();
    expect(parseScale('1:')).toBeNull();
  });

  it('choisit la plus grande échelle normalisée qui fait tenir l’emprise', () => {
    expect(fitScale({ w: 10000, h: 6000 }, { w: 270, h: 180 })).toEqual({ paper: 1, model: 50 });
    expect(fitScale({ w: 20, h: 10 }, { w: 270, h: 180 })).toEqual({ paper: 10, model: 1 });
    expect(fitScale({ w: 1e9, h: 1 }, { w: 270, h: 180 })).toBeNull();
  });
});

describe('fenêtre', () => {
  it('papier ↔ modèle : le centre de la fenêtre montre son point central', () => {
    const v = vp();
    expect(modelToPaper(v, { x: 5000, y: 2500 })).toEqual({ x: 120, y: 60 });
    expect(modelToPaper(v, { x: 10000, y: 2500 })).toEqual({ x: 220, y: 60 });
    expect(paperToModel(v, { x: 20, y: 10 })).toEqual({ x: 0, y: 0 });
    const p = { x: 1234.5, y: -678 };
    const back = paperToModel(v, modelToPaper(v, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('partie du modèle visible', () => {
    expect(viewportModelRect(vp())).toEqual({ x: 0, y: 0, w: 10000, h: 5000 });
  });

  it('calques masqués dans une fenêtre seulement', () => {
    const layer: Layer = { id: 'LAY-0002', name: 'Équipements', color: '#fff', visible: true, locked: false };
    expect(layerVisibleInViewport(vp(), layer)).toBe(true);
    expect(layerVisibleInViewport(vp({ hiddenLayerIds: ['LAY-0002'] }), layer)).toBe(false);
    expect(layerVisibleInViewport(vp(), { ...layer, visible: false })).toBe(false);
  });
});

describe('feuille', () => {
  const sheet = (viewports: Viewport[]): Sheet => ({ id: 'FEU-0001', name: 'A3', format: 'A3', orientation: 'paysage', margins: DEFAULT_MARGINS, viewports });

  it('formats ISO 216 et orientation', () => {
    expect(sheetSize('A3', 'portrait')).toEqual({ w: 297, h: 420 });
    expect(sheetSize('A3', 'paysage')).toEqual({ w: 420, h: 297 });
    expect(sheetSize('A0', 'portrait')).toEqual({ w: 841, h: 1189 });
    expect(printableArea(sheet([]))).toEqual({ x: 20, y: 10, w: 390, h: 277 });
  });

  it('signale une fenêtre qui déborde ou une échelle invalide', () => {
    expect(sheetIssues(sheet([vp()]))).toEqual([]);
    expect(sheetIssues(sheet([vp({ x: 300 })]))[0]).toMatch(/déborde/);
    expect(sheetIssues(sheet([vp({ scale: { paper: 0, model: 50 } })]))[0]).toMatch(/échelle invalide/);
  });

  it('l’échelle ne modifie pas le modèle', () => {
    const v = vp();
    const before = JSON.stringify(v.center);
    paperLength(5000, v.scale);
    viewportModelRect(v);
    expect(JSON.stringify(v.center)).toBe(before);
  });
});
