import { describe, expect, it } from 'vitest';
import { fromMm, parseLength, parsePointInput, toMm } from './input';

const ok = (r: ReturnType<typeof parsePointInput>) => {
  if (!r.ok) throw new Error(r.error);
  return r.point;
};

describe('saisie de point', () => {
  it('absolu x;y, virgule décimale acceptée', () => {
    expect(ok(parsePointInput('120;-40,5', null, 'mm'))).toEqual({ x: 120, y: -40.5 });
    expect(ok(parsePointInput(' 1 ; 2 ', null, 'mm'))).toEqual({ x: 1, y: 2 });
  });

  it('relatif @dx;dy depuis le dernier point', () => {
    expect(ok(parsePointInput('@10;-5', { x: 100, y: 100 }, 'mm'))).toEqual({ x: 110, y: 95 });
  });

  it('polaire relatif @L<angle : 0° vers +X, 90° vers le haut de l’écran', () => {
    expect(ok(parsePointInput('@5000<0', { x: 0, y: 0 }, 'mm'))).toEqual({ x: 5000, y: 0 });
    expect(ok(parsePointInput('@3000<90', { x: 5000, y: 0 }, 'mm'))).toEqual({ x: 5000, y: -3000 });
    const p = ok(parsePointInput('@100<45', { x: 0, y: 0 }, 'mm'));
    expect(p.x).toBeCloseTo(70.710678, 6);
    expect(p.y).toBeCloseTo(-70.710678, 6);
  });

  it('polaire absolu L<angle depuis l’origine', () => {
    expect(ok(parsePointInput('10<180', { x: 999, y: 999 }, 'mm'))).toEqual({ x: -10, y: 0 });
  });

  it('convertit depuis l’unité d’affichage (mètres, centimètres)', () => {
    expect(ok(parsePointInput('@5<0', { x: 0, y: 0 }, 'm'))).toEqual({ x: 5000, y: 0 });
    expect(ok(parsePointInput('@2,5;0', { x: 0, y: 0 }, 'cm'))).toEqual({ x: 25, y: 0 });
  });

  it('refuse les saisies invalides avec un message', () => {
    expect(parsePointInput('', null, 'mm').ok).toBe(false);
    expect(parsePointInput('abc', null, 'mm').ok).toBe(false);
    expect(parsePointInput('10,20', null, 'mm').ok).toBe(false); // la virgule est décimale
    const noLast = parsePointInput('@10;0', null, 'mm');
    expect(noLast.ok).toBe(false);
    if (!noLast.ok) expect(noLast.error).toMatch(/point précédent/);
    expect(parsePointInput('@-5<0', { x: 0, y: 0 }, 'mm').ok).toBe(false);
    // Débordement après conversion (mètres → mm) ou ajout de l'origine.
    expect(parsePointInput('1e308;0', null, 'm')).toEqual({ ok: false, error: 'Coordonnées hors limites.' });
    expect(parsePointInput('@1e308;0', { x: 1e308, y: 0 }, 'mm').ok).toBe(false);
  });
});

describe('unités d’affichage', () => {
  it('convertit sans perte et ne touche pas l’unité interne', () => {
    expect(toMm(5, 'm')).toBe(5000);
    expect(fromMm(5000, 'm')).toBe(5);
    expect(fromMm(25, 'cm')).toBe(2.5);
    expect(parseLength('2,5', 'cm')).toBe(25);
    expect(parseLength('x', 'mm')).toBeNaN();
  });
});
