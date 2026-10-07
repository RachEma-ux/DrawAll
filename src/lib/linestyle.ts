// Propriétés de trait (ISO 128-2:2022) : type, épaisseur et couleur, par calque et par objet.
// Une propriété absente sur l'objet vaut « du calque » (DXF : BYLAYER). Fonctions pures.
import type { CadObject, Layer, LineType } from '@/types/cad';

export interface LineTypeDef {
  key: LineType;
  label: string;
  /** Numéro du type de trait de base dans ISO 128-2. */
  iso: string;
  usage: string;
  /** Nom du type de ligne écrit en DXF (bibliothèque ISO d'AutoCAD, épaisseur 1 mm). */
  dxf: string;
  /**
   * Motif en multiples de l'épaisseur d (ISO 128-2 §5) : longueurs positives = traits,
   * négatives = espaces ; 0,5 d représente un point.
   */
  pattern: number[];
}

export const LINE_TYPES: LineTypeDef[] = [
  { key: 'continu', label: 'Continu', iso: '01', usage: 'Contours vus, cotes, hachures', dxf: 'CONTINUOUS', pattern: [] },
  { key: 'interrompu', label: 'Interrompu', iso: '02', usage: 'Contours cachés', dxf: 'ACAD_ISO02W100', pattern: [12, -3] },
  { key: 'mixte', label: 'Mixte (trait-point)', iso: '04', usage: 'Axes, lignes de symétrie, plans de coupe', dxf: 'ACAD_ISO04W100', pattern: [24, -3, 0.5, -3] },
  { key: 'mixte-double', label: 'Mixte double (trait-deux points)', iso: '05', usage: 'Contours de pièces voisines, positions extrêmes', dxf: 'ACAD_ISO05W100', pattern: [24, -3, 0.5, -3, 0.5, -3] },
];

/** Série d'épaisseurs ISO 128-2 (mm sur la feuille, raison √2). */
export const LINE_WEIGHTS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1, 1.4, 2];

export const DEFAULT_LINE_TYPE: LineType = 'continu';
export const DEFAULT_LINE_WEIGHT = 0.25;

export const lineTypeDef = (t: LineType | undefined) => LINE_TYPES.find(d => d.key === t) ?? LINE_TYPES[0];

export interface EffectiveStyle {
  color: string;
  lineType: LineType;
  /** Épaisseur sur la feuille (mm). */
  lineWeight: number;
  /** Vrai pour chaque propriété prise sur le calque. */
  byLayer: { color: boolean; lineType: boolean; lineWeight: boolean };
}

/** Propriétés effectives d'un objet : les siennes, sinon celles de son calque, sinon les valeurs par défaut. */
export function effectiveStyle(o: Pick<CadObject, 'color' | 'lineType' | 'lineWeight'>, layer: Layer | undefined): EffectiveStyle {
  return {
    color: o.color ?? layer?.color ?? '#8b93a7',
    lineType: o.lineType ?? layer?.lineType ?? DEFAULT_LINE_TYPE,
    lineWeight: o.lineWeight ?? layer?.lineWeight ?? DEFAULT_LINE_WEIGHT,
    byLayer: { color: o.color === undefined, lineType: o.lineType === undefined, lineWeight: o.lineWeight === undefined },
  };
}

/** Largeur d'affichage à l'écran (px) : proportionnelle à l'épaisseur, 0,25 mm → 1,5 px. */
export function screenWidth(lineWeight: number): number {
  return Math.min(8, Math.max(1, (lineWeight / 0.25) * 1.5));
}

/**
 * Motif de tirets à l'écran (px) pour une largeur affichée donnée ; undefined pour un trait continu.
 * Le motif garde les proportions de la norme ; un point devient un tiret très court.
 */
export function screenDash(lineType: LineType, widthPx: number): number[] | undefined {
  const def = lineTypeDef(lineType);
  if (def.pattern.length === 0) return undefined;
  const d = Math.max(1.5, widthPx);
  return def.pattern.map(v => Math.max(1, Math.abs(v) * d));
}

/** Épaisseur DXF (groupe 370) : centièmes de mm, valeurs normalisées les plus proches. */
const DXF_WEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
export function dxfLineWeight(mm: number): number {
  const target = mm * 100;
  return DXF_WEIGHTS.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), DXF_WEIGHTS[0]);
}

/** Type de ligne DrawAll correspondant à un nom de type de ligne DXF (import). */
export function lineTypeFromDxf(name: string | undefined): LineType | undefined | 'bylayer' {
  if (!name) return undefined;
  const n = name.toUpperCase();
  if (n === 'BYLAYER') return 'bylayer';
  if (n === 'CONTINUOUS' || n === 'BYBLOCK') return 'continu';
  if (/ISO0?2W|ISO0?3W|DASHED|HIDDEN/.test(n)) return 'interrompu';
  if (/ISO0?5W|PHANTOM|DIVIDE/.test(n)) return 'mixte-double';
  if (/ISO0?4W|ISO1[0-1]W|CENTER|DASHDOT/.test(n)) return 'mixte';
  return undefined;
}
