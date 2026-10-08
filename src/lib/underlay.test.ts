import { describe, expect, it } from 'vitest';
import { ASSETS_BUDGET, ASSET_TARGET, assetRoom, calibrate, fitEncoding, fitPixels, imageSizeMm, onUnderlay, pdfPageSizeMm, pixelToModel } from './underlay';

describe('fond de plan (lot 6.2)', () => {
  it('tailles de départ : image à 96 ppp, page PDF à sa taille réelle', () => {
    const img = imageSizeMm({ w: 96, h: 192 });
    expect(img.w).toBeCloseTo(25.4, 9); expect(img.h).toBeCloseTo(50.8, 9);
    const a4 = pdfPageSizeMm({ w: 595.276, h: 841.89 });
    expect(a4.w).toBeCloseTo(210, 2); expect(a4.h).toBeCloseTo(297, 2);
    expect(fitPixels(8192, 2048)).toEqual({ w: 4096, h: 1024, ratio: 0.5 });
    expect(fitPixels(800, 600).ratio).toBe(1);
  });

  it('calage par deux points : la distance mesurée devient la distance réelle (±0,5 %)', () => {
    const px = { w: 1000, h: 200 };
    const u = { x: 0, y: 0, w: 264.583, h: 52.917 };
    // Deux repères de l'image, 800 px d'écart, désignés avec 0,3 mm d'imprécision.
    const a = pixelToModel(u, px, { x: 100, y: 100 });
    const b = pixelToModel(u, px, { x: 900, y: 100 });
    const next = calibrate(u, { x: a.x + 0.3, y: a.y }, b, 8000)!;
    const a2 = pixelToModel(next, px, { x: 100, y: 100 }), b2 = pixelToModel(next, px, { x: 900, y: 100 });
    const d = Math.hypot(b2.x - a2.x, b2.y - a2.y);
    expect(Math.abs(d - 8000) / 8000).toBeLessThan(0.005);
    // Le premier point désigné reste en place ; les proportions sont conservées.
    expect(next.w / next.h).toBeCloseTo(u.w / u.h, 9);
  });

  it('calage refusé : points confondus ou distance non positive ; désignation', () => {
    const u = { x: 0, y: 0, w: 100, h: 50 };
    expect(calibrate(u, { x: 1, y: 1 }, { x: 1, y: 1 }, 10)).toBeNull();
    expect(calibrate(u, { x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBeNull();
    expect(calibrate(u, { x: 0, y: 0 }, { x: 10, y: 0 }, NaN)).toBeNull();
    expect(onUnderlay(u, { x: 50, y: 25 })).toBe(true);
    expect(onUnderlay(u, { x: 150, y: 25 })).toBe(false);
  });
});

describe('stockage borné des fonds de plan', () => {
  it('place disponible : budget total moins les fonds déjà conservés, au plus la taille visée', () => {
    expect(assetRoom(undefined)).toBe(ASSET_TARGET);
    expect(assetRoom({ a: { dataUrl: 'x'.repeat(ASSETS_BUDGET - 1000) } })).toBe(1000);
    expect(assetRoom({ a: { dataUrl: 'x'.repeat(ASSETS_BUDGET + 5) } })).toBe(0);
  });

  it('encodage : qualité puis taille réduites jusqu’à tenir dans le budget ; refus sinon', () => {
    // Encodeur simulé : taille ∝ pixels, PNG 4 fois plus lourd que le JPEG à qualité 1.
    const enc = (w: number, h: number, q: number | null) => 'x'.repeat(Math.round(w * h * (q === null ? 4 : q)));
    expect(fitEncoding({ w: 100, h: 100 }, 50_000, enc)).toMatchObject({ w: 100, h: 100 });
    const r = fitEncoding({ w: 1000, h: 1000 }, 100_000, enc)!;
    expect(r.dataUrl.length).toBeLessThanOrEqual(100_000);
    expect(r.w).toBeLessThan(1000);
    expect(fitEncoding({ w: 1000, h: 1000 }, 10, enc)).toBeNull();
  });
});
