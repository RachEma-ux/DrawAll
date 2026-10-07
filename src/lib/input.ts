// Saisie précise : unités d'affichage et analyse des coordonnées tapées. Fonctions pures.
//
// Conventions (cf. docs/DrawAll_v4.1_Conventions_Dessin.md §1.5) :
// - les valeurs saisies sont exprimées dans l'unité d'affichage, puis converties en millimètres ;
// - X et Y suivent les coordonnées affichées par l'atelier (Y croît vers le bas de l'écran) ;
// - un angle polaire se compte en degrés depuis +X, positif dans le sens antihoraire à l'écran
//   (90° = vers le haut), comme les arcs ;
// - la virgule décimale est acceptée ; le point-virgule sépare X et Y.

export type DisplayUnit = 'mm' | 'cm' | 'm';

export const DISPLAY_UNITS: { key: DisplayUnit; label: string; factor: number }[] = [
  { key: 'mm', label: 'mm', factor: 1 },
  { key: 'cm', label: 'cm', factor: 10 },
  { key: 'm', label: 'm', factor: 1000 },
];

/** Pas de grille proposés (mm). */
export const GRID_SIZES = [1, 5, 10, 50, 100, 500, 1000];

export const unitFactor = (u: DisplayUnit) => DISPLAY_UNITS.find(d => d.key === u)?.factor ?? 1;

/** Millimètres → unité d'affichage. */
export const fromMm = (mm: number, u: DisplayUnit) => mm / unitFactor(u);
/** Unité d'affichage → millimètres. */
export const toMm = (v: number, u: DisplayUnit) => v * unitFactor(u);

export interface P { x: number; y: number }

export type PointInput = { ok: true; point: P; relative: boolean } | { ok: false; error: string };

const NUM = String.raw`[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?`;
const CARTESIAN = new RegExp(String.raw`^(@)?\s*(${NUM})\s*;\s*(${NUM})$`, 'i');
const POLAR = new RegExp(String.raw`^(@)?\s*(${NUM})\s*<\s*(${NUM})$`, 'i');

const parseNum = (s: string) => Number(s.replace(',', '.'));

/** Nombre saisi dans l'unité d'affichage (virgule acceptée) → millimètres ; NaN si invalide. */
export function parseLength(text: string, unit: DisplayUnit): number {
  const t = text.trim();
  if (!new RegExp(`^${NUM}$`, 'i').test(t)) return NaN;
  return toMm(parseNum(t), unit);
}

/**
 * Analyse une saisie de point :
 * - `x;y` absolu ;
 * - `@dx;dy` relatif au dernier point ;
 * - `L<angle` polaire depuis l'origine, `@L<angle` polaire relatif au dernier point.
 */
export function parsePointInput(text: string, last: P | null, unit: DisplayUnit): PointInput {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return { ok: false, error: 'Saisie vide.' };
  const cart = CARTESIAN.exec(t);
  const polar = cart ? null : POLAR.exec(t);
  const m = cart ?? polar;
  if (!m) return { ok: false, error: `Saisie non reconnue : « ${text.trim()} » (formes : x;y · @dx;dy · @L<angle).` };
  const relative = m[1] === '@';
  if (relative && !last) return { ok: false, error: 'Pas de point précédent : saisissez d’abord un point absolu (x;y).' };
  const a = parseNum(m[2]), b = parseNum(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: 'Valeur numérique invalide.' };
  let dx: number, dy: number;
  if (cart) {
    dx = toMm(a, unit);
    dy = toMm(b, unit);
  } else {
    const L = toMm(a, unit);
    if (L < 0) return { ok: false, error: 'La longueur polaire doit être positive.' };
    const rad = (b * Math.PI) / 180;
    dx = clean(L * Math.cos(rad));
    dy = clean(-L * Math.sin(rad)); // Y croît vers le bas : 90° monte à l'écran.
  }
  const origin = relative ? last! : { x: 0, y: 0 };
  return { ok: true, point: { x: origin.x + dx, y: origin.y + dy }, relative };
}

/** Supprime le bruit flottant des angles remarquables (cos 90° ≈ 6e-17). */
function clean(v: number): number {
  const r = Math.round(v * 1e9) / 1e9;
  return Math.abs(r - v) < 1e-9 ? r : v;
}

/** Décimales affichées : même finesse (0,01 mm) quelle que soit l'unité. */
export const unitDecimals = (u: DisplayUnit) => 2 + Math.round(Math.log10(unitFactor(u)));
