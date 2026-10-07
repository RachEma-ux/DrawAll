// Feuilles et fenêtres : formats ISO 216, échelles ISO 5455, passage papier ↔ modèle.
// Fonctions pures. L'échelle d'une fenêtre ne modifie jamais le modèle : elle ne fait que le
// représenter (Conventions §1.1 et §2).
import type { DrawingScale, Layer, Orientation, PaperFormat, Sheet, Viewport } from '@/types/cad';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

/** Formats ISO 216, en portrait (largeur × hauteur, mm). */
export const PAPER_SIZES: Record<PaperFormat, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  A2: { w: 420, h: 594 },
  A1: { w: 594, h: 841 },
  A0: { w: 841, h: 1189 },
};

export const PAPER_FORMATS = Object.keys(PAPER_SIZES) as PaperFormat[];

/** Marges par défaut : 20 mm à gauche (reliure, ISO 5457), 10 mm ailleurs. */
export const DEFAULT_MARGINS = { top: 10, right: 10, bottom: 10, left: 20 };

/** Échelles normalisées (ISO 5455) proposées, de la plus forte réduction à l'agrandissement. */
export const STANDARD_SCALES: DrawingScale[] = [
  { paper: 1, model: 1000 }, { paper: 1, model: 500 }, { paper: 1, model: 200 }, { paper: 1, model: 100 },
  { paper: 1, model: 50 }, { paper: 1, model: 20 }, { paper: 1, model: 10 }, { paper: 1, model: 5 },
  { paper: 1, model: 2 }, { paper: 1, model: 1 }, { paper: 2, model: 1 }, { paper: 5, model: 1 },
  { paper: 10, model: 1 }, { paper: 20, model: 1 }, { paper: 50, model: 1 },
];

export function sheetSize(format: PaperFormat, orientation: Orientation): { w: number; h: number } {
  const s = PAPER_SIZES[format];
  return orientation === 'portrait' ? { w: s.w, h: s.h } : { w: s.h, h: s.w };
}

/** Zone utile de la feuille (à l'intérieur des marges). */
export function printableArea(sheet: Pick<Sheet, 'format' | 'orientation' | 'margins'>): Rect {
  const { w, h } = sheetSize(sheet.format, sheet.orientation);
  const m = sheet.margins;
  return { x: m.left, y: m.top, w: w - m.left - m.right, h: h - m.top - m.bottom };
}

/** Rapport papier / modèle (1:50 → 0,02). */
export const scaleRatio = (s: DrawingScale) => s.paper / s.model;

/** Longueur sur la feuille d'une longueur réelle : 5 000 mm au 1:50 → 100 mm. */
export const paperLength = (modelMm: number, s: DrawingScale) => modelMm * scaleRatio(s);
/** Longueur réelle représentée par une longueur sur la feuille. */
export const modelLength = (paperMm: number, s: DrawingScale) => paperMm / scaleRatio(s);

/** Désignation ISO 5455 : « 1:50 », « 5:1 », « 1:1 ». */
export function formatScale(s: DrawingScale): string {
  return `${trim(s.paper)}:${trim(s.model)}`;
}

/** Lit « 1:50 », « 1/50 », « 5:1 », « 1 : 2,5 » ; null si invalide. */
export function parseScale(text: string): DrawingScale | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[:/]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const paper = Number(m[1].replace(',', '.'));
  const model = Number(m[2].replace(',', '.'));
  return paper > 0 && model > 0 ? { paper, model } : null;
}

/** Point du modèle → point de la feuille, à travers la fenêtre (même orientation des axes). */
export function modelToPaper(vp: Viewport, p: Pt): Pt {
  const k = scaleRatio(vp.scale);
  return { x: vp.x + vp.w / 2 + (p.x - vp.center.x) * k, y: vp.y + vp.h / 2 + (p.y - vp.center.y) * k };
}

/** Point de la feuille → point du modèle, à travers la fenêtre. */
export function paperToModel(vp: Viewport, p: Pt): Pt {
  const k = scaleRatio(vp.scale);
  return { x: vp.center.x + (p.x - vp.x - vp.w / 2) / k, y: vp.center.y + (p.y - vp.y - vp.h / 2) / k };
}

/** Partie du modèle visible dans la fenêtre (mm réels). */
export function viewportModelRect(vp: Viewport): Rect {
  const w = modelLength(vp.w, vp.scale), h = modelLength(vp.h, vp.scale);
  return { x: vp.center.x - w / 2, y: vp.center.y - h / 2, w, h };
}

/** Le calque est-il visible dans cette fenêtre (visible dans le projet et non masqué ici) ? */
export function layerVisibleInViewport(vp: Viewport, layer: Layer): boolean {
  return layer.visible && !vp.hiddenLayerIds.includes(layer.id);
}

/**
 * Plus grande échelle normalisée à laquelle une emprise du modèle tient dans la fenêtre ;
 * null si même la plus forte réduction ne suffit pas.
 */
export function fitScale(model: { w: number; h: number }, paper: { w: number; h: number }): DrawingScale | null {
  let best: DrawingScale | null = null;
  for (const s of STANDARD_SCALES) {
    if (paperLength(model.w, s) <= paper.w + 1e-9 && paperLength(model.h, s) <= paper.h + 1e-9) best = s;
  }
  return best;
}

/** Contrôles d'une feuille : fenêtres dans la zone utile, tailles et échelles valides. */
export function sheetIssues(sheet: Sheet): string[] {
  const issues: string[] = [];
  const area = printableArea(sheet);
  if (area.w <= 0 || area.h <= 0) issues.push(`${sheet.id} : marges plus grandes que la feuille.`);
  for (const vp of sheet.viewports) {
    if (!(vp.w > 0 && vp.h > 0)) issues.push(`${vp.id} : taille nulle.`);
    if (!(vp.scale.paper > 0 && vp.scale.model > 0)) issues.push(`${vp.id} : échelle invalide.`);
    const eps = 1e-6;
    if (vp.x < area.x - eps || vp.y < area.y - eps || vp.x + vp.w > area.x + area.w + eps || vp.y + vp.h > area.y + area.h + eps) {
      issues.push(`${vp.id} : déborde de la zone utile de ${sheet.id}.`);
    }
  }
  return issues;
}

function trim(v: number): string {
  return String(Math.round(v * 1000) / 1000).replace('.', ',');
}
