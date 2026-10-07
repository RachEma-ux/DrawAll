// Géométrie du texte : boîte englobante approchée (sans mesure de police), rotation et test de point.
// Convention : (x, y) = point d'insertion sur la ligne de base de la première ligne ;
// rotation en degrés, sens trigonométrique dans le repère DXF (Y vers le haut), donc
// sens horaire à l'écran (Y vers le bas).
import type { TextObj } from '@/types/cad';

/** Largeur moyenne d'un caractère rapportée à la hauteur (police sans empattement). */
export const TEXT_CHAR_WIDTH = 0.7;
/** Taille de police SVG (em) rapportée à la hauteur des majuscules (≈ 0,716 em en Arial). */
export const TEXT_FONT_SCALE = 1 / 0.716;
/** Interligne rapporté à la hauteur. */
export const TEXT_LINE_SPACING = 1.4;
/** Hauteur par défaut d'un texte posé à l'outil, en mm (modèle). */
export const DEFAULT_TEXT_HEIGHT = 20;

export interface Pt { x: number; y: number }

export function textLines(content: string): string[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  return lines.length > 0 ? lines : [''];
}

/** Coins de la boîte du texte, dans l'ordre (haut-gauche, haut-droit, bas-droit, bas-gauche), en coordonnées modèle (Y vers le bas). */
export function textCorners(t: Pick<TextObj, 'x' | 'y' | 'content' | 'height' | 'rotation' | 'align'>): [Pt, Pt, Pt, Pt] {
  const lines = textLines(t.content);
  const width = Math.max(1, ...lines.map(l => l.length)) * t.height * TEXT_CHAR_WIDTH;
  const left = t.align === 'center' ? -width / 2 : t.align === 'right' ? -width : 0;
  const top = -t.height;
  const bottom = (lines.length - 1) * t.height * TEXT_LINE_SPACING + t.height * 0.25;
  const local: Pt[] = [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: bottom },
    { x: left, y: bottom },
  ];
  const rad = (-t.rotation * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const world = local.map(p => ({ x: t.x + p.x * c - p.y * s, y: t.y + p.x * s + p.y * c }));
  return [world[0], world[1], world[2], world[3]];
}

export function textBounds(t: Pick<TextObj, 'x' | 'y' | 'content' | 'height' | 'rotation' | 'align'>) {
  const pts = textCorners(t);
  return {
    minX: Math.min(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)),
    maxX: Math.max(...pts.map(p => p.x)),
    maxY: Math.max(...pts.map(p => p.y)),
  };
}

/** Le point est-il dans la boîte du texte (élargie de la tolérance) ? */
export function pointInText(t: Pick<TextObj, 'x' | 'y' | 'content' | 'height' | 'rotation' | 'align'>, px: number, py: number, tol = 0): boolean {
  // Ramène le point dans le repère local du texte (rotation inverse).
  const rad = (t.rotation * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const dx = px - t.x, dy = py - t.y;
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  const lines = textLines(t.content);
  const width = Math.max(1, ...lines.map(l => l.length)) * t.height * TEXT_CHAR_WIDTH;
  const left = t.align === 'center' ? -width / 2 : t.align === 'right' ? -width : 0;
  const top = -t.height;
  const bottom = (lines.length - 1) * t.height * TEXT_LINE_SPACING + t.height * 0.25;
  return lx >= left - tol && lx <= left + width + tol && ly >= top - tol && ly <= bottom + tol;
}

/** Angle normalisé dans ]−180 ; 180]. */
export function normalizeAngle(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 1e6) / 1e6;
}
