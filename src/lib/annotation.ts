// Styles d'annotation papier (lot 2.4) : hauteurs de texte, flèches et épaisseurs exprimées en mm
// sur la feuille, identiques quelle que soit l'échelle de la fenêtre. Une fenêtre convertit ces
// tailles en unités du modèle (divisées par le rapport d'échelle). Fonctions pures.
import type { DrawingScale, LineType } from '@/types/cad';
import { lineTypeDef } from '@/lib/linestyle';
import { modelLength, paperLength } from '@/lib/sheet';

export interface Pt { x: number; y: number }

/** Style de cote papier (ISO 129-1 : flèche fermée remplie, texte 2,5 mm, traits fins). */
export const PAPER_DIMENSION_STYLE = {
  /** Hauteur des chiffres de cote (mm papier). */
  textHeight: 2.5,
  /** Longueur de la flèche (mm papier). */
  arrowLength: 2.5,
  /** Demi-largeur de la flèche : angle d'ouverture de 30° (tan 15° × longueur). */
  arrowHalfWidth: 2.5 * Math.tan((15 * Math.PI) / 180),
  /** Épaisseur des lignes de cote et d'attache (mm papier). */
  lineWeight: 0.18,
  /** Écart entre la ligne de cote et le texte (mm papier). */
  textGap: 1,
};

/** Taille papier → taille dans le modèle, pour une fenêtre à cette échelle (2,5 mm au 1:50 → 125 mm). */
export const paperToModelSize = (paperMm: number, scale: DrawingScale) => modelLength(paperMm, scale);
/** Taille dans le modèle → taille sur la feuille. */
export const modelToPaperSize = (modelMm: number, scale: DrawingScale) => paperLength(modelMm, scale);

/** Épaisseur de trait (mm papier) exprimée en unités du modèle, pour un tracé à l'échelle exacte. */
export const strokeInModel = (lineWeightMm: number, scale: DrawingScale) => paperToModelSize(lineWeightMm, scale);

/**
 * Motif de tirets ISO 128-2 en unités du modèle : longueurs en multiples de l'épaisseur d sur la
 * feuille (02 à 0,25 mm : trait 3 mm, espace 0,75 mm), converties à l'échelle de la fenêtre.
 */
export function dashInModel(lineType: LineType, lineWeightMm: number, scale: DrawingScale): number[] | undefined {
  const def = lineTypeDef(lineType);
  if (def.pattern.length === 0) return undefined;
  return def.pattern.map(v => paperToModelSize(Math.abs(v) * lineWeightMm, scale));
}

/** Triangle de flèche fermée : pointe en `tip`, orientée de `from` vers `tip` (unités du modèle). */
export function arrowHead(tip: Pt, from: Pt, length: number, halfWidth: number): Pt[] {
  const dx = tip.x - from.x, dy = tip.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const bx = tip.x - ux * length, by = tip.y - uy * length;
  return [tip, { x: bx - uy * halfWidth, y: by + ux * halfWidth }, { x: bx + uy * halfWidth, y: by - ux * halfWidth }];
}

/**
 * Position du texte d'une cote : au milieu de la ligne de cote, à l'écart papier mesuré
 * perpendiculairement à la ligne — au-dessus d'une ligne plutôt horizontale (texte centré), à droite
 * d'une ligne plutôt verticale (texte aligné à gauche, qui ne chevauche donc pas la ligne).
 */
export function dimensionTextPosition(line: { x1: number; y1: number; x2: number; y2: number }, gapModel: number): { x: number; y: number; anchor: 'middle' | 'start' } {
  const mx = (line.x1 + line.x2) / 2, my = (line.y1 + line.y2) / 2;
  const dx = line.x2 - line.x1, dy = line.y2 - line.y1, l = Math.hypot(dx, dy);
  if (l < 1e-9) return { x: mx, y: my - gapModel, anchor: 'middle' };
  let n = { x: dy / l, y: -dx / l };                 // une normale à la ligne (Y vers le bas)
  const steep = Math.abs(dy) > Math.abs(dx);
  // Côté retenu : à droite (x > 0) pour une ligne plutôt verticale, au-dessus (y < 0) sinon.
  if ((steep && n.x < 0) || (!steep && n.y > 0)) n = { x: -n.x, y: -n.y };
  return { x: mx + n.x * gapModel, y: my + n.y * gapModel, anchor: steep ? 'start' : 'middle' };
}
