// Fond de plan (lot 6.2) : image ou page de PDF placée sous le dessin, calée par deux points et une
// distance connue, verrouillable. L'image est conservée une fois dans le projet (ressource) ; l'objet
// « fond de plan » la place dans le modèle (coin supérieur gauche, largeur et hauteur en mm).
// Fonctions pures.
import type { UnderlayObj } from '@/types/cad';

export interface Pt { x: number; y: number }

/** Résolution supposée d'une image sans échelle connue (px par pouce) : taille de départ, à caler. */
export const IMAGE_DPI = 96;
/** Côté maximal conservé (px) : au-delà, l'image est réduite à l'import. */
export const MAX_PIXELS = 4096;

/** Taille de départ d'une image (mm) : pixels à 96 ppp. */
export const imageSizeMm = (px: { w: number; h: number }) => ({ w: (px.w * 25.4) / IMAGE_DPI, h: (px.h * 25.4) / IMAGE_DPI });

/** Taille d'une page PDF (mm) : ses points (1/72 de pouce), à l'échelle réelle de la page. */
export const pdfPageSizeMm = (pt: { w: number; h: number }) => ({ w: (pt.w * 25.4) / 72, h: (pt.h * 25.4) / 72 });

/** Dimensions réduites pour ne pas dépasser MAX_PIXELS de côté (proportions conservées). */
export function fitPixels(w: number, h: number, max = MAX_PIXELS): { w: number; h: number; ratio: number } {
  const ratio = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)), ratio };
}

/** Point du modèle correspondant à un pixel de l'image (origine en haut à gauche). */
export function pixelToModel(u: Pick<UnderlayObj, 'x' | 'y' | 'w' | 'h'>, px: { w: number; h: number }, p: Pt): Pt {
  return { x: u.x + (p.x / px.w) * u.w, y: u.y + (p.y / px.h) * u.h };
}

/**
 * Calage par deux points : le fond est mis à l'échelle autour du premier point pour que la distance
 * entre les deux points désignés vaille la distance réelle. null si les points sont confondus ou la
 * distance n'est pas positive.
 */
export function calibrate(u: Pick<UnderlayObj, 'x' | 'y' | 'w' | 'h'>, a: Pt, b: Pt, realMm: number): Pick<UnderlayObj, 'x' | 'y' | 'w' | 'h'> | null {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(d > 1e-9) || !(realMm > 0) || !Number.isFinite(realMm)) return null;
  const f = realMm / d;
  return { x: a.x + (u.x - a.x) * f, y: a.y + (u.y - a.y) * f, w: u.w * f, h: u.h * f };
}

/** Le point est-il sur le fond (désignation) ? */
export const onUnderlay = (u: Pick<UnderlayObj, 'x' | 'y' | 'w' | 'h'>, p: Pt) => p.x >= u.x && p.x <= u.x + u.w && p.y >= u.y && p.y <= u.y + u.h;
