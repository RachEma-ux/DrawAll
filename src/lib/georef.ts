// Géoréférencement (lot 17.3) : point de base du projet dans un système de coordonnées projeté
// déclaré (code EPSG saisi, jamais deviné), altitude, et rotation du nord. Le modèle reste en
// millimètres, repère local (X du plan, Y du plan vers le bas) ; la conversion vers les coordonnées
// de la carte (E, N en mètres, H en mètres) est explicite, jamais mélangée au modèle. Fonctions pures.
import type { Georef } from '@/types/cad';

/**
 * Angles : `north` = angle, en degrés, du nord du quadrillage mesuré depuis le haut de l'écran,
 * positif dans le sens horaire (nord « à droite » du haut du plan). Il vaut aussi l'angle, dans le
 * sens trigonométrique, de l'axe X du modèle par rapport à l'est de la carte.
 */
export function georefError(g: Partial<Georef>): string | null {
  if (typeof g.crs !== 'string' || !/^EPSG:\d{4,6}$/.test(g.crs)) return 'Système de coordonnées : code EPSG attendu (ex. EPSG:2056).';
  for (const [k, label] of [['e', 'Est (E)'], ['n', 'Nord (N)'], ['h', 'Altitude']] as const) {
    if (typeof g[k] !== 'number' || !Number.isFinite(g[k])) return `${label} : nombre attendu.`;
  }
  if (typeof g.north !== 'number' || !Number.isFinite(g.north) || g.north <= -360 || g.north >= 360) return 'Rotation du nord : angle entre −360 et 360° attendu.';
  return null;
}

export const normalizeGeoref = (raw: unknown): Georef | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Georef;
  return georefError(g) ? undefined : { e: g.e, n: g.n, h: g.h, crs: g.crs, north: g.north };
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Point du modèle (mm, repère du plan) → coordonnées de la carte (m). */
export function modelToMap(p: { x: number; y: number; z: number }, g: Georef): { E: number; N: number; H: number } {
  // Repère local à Y vers le haut (nord du projet), en mètres.
  const lx = p.x / 1000, ly = -p.y / 1000, a = rad(g.north);
  return { E: g.e + lx * Math.cos(a) - ly * Math.sin(a), N: g.n + lx * Math.sin(a) + ly * Math.cos(a), H: g.h + p.z / 1000 };
}

/** Coordonnées de la carte (m) → point du modèle (mm, repère du plan). */
export function mapToModel(q: { E: number; N: number; H: number }, g: Georef): { x: number; y: number; z: number } {
  const dx = q.E - g.e, dy = q.N - g.n, a = rad(g.north);
  const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
  return { x: lx * 1000, y: -ly * 1000, z: (q.H - g.h) * 1000 };
}

/** Paramètres de l'IfcMapConversion (unités du projet : mm ; carte : m). */
export function ifcMapConversion(g: Georef) {
  const a = rad(g.north);
  return { eastings: g.e, northings: g.n, orthogonalHeight: g.h, xAxisAbscissa: Math.cos(a), xAxisOrdinate: Math.sin(a), scale: 0.001 };
}

/** Direction du nord du quadrillage dans le repère local IFC (Y vers le haut). */
export const gridNorthLocal = (g: Georef): [number, number] => [Math.sin(rad(g.north)), Math.cos(rad(g.north))];

/** Affichage : « EPSG:2056 · E 2 600 000,000 · N 1 200 000,000 · H 432,500 m · nord 15° ». */
export function formatGeoref(g: Georef): string {
  const f = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `${g.crs} · E ${f(g.e)} · N ${f(g.n)} · H ${f(g.h)} m · nord ${g.north.toLocaleString('fr-FR')}°`;
}
