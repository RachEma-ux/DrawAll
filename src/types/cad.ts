// Modèle d'information commun — inspiré de l'Architecture de référence V4 §4
// Identités stables, classifications métier (ontologies), représentations multiples.

export type ObjectKind = 'line' | 'rect' | 'circle' | 'polyline' | 'dimension' | 'blockRef';
export type PrimitiveKind = 'line' | 'rect' | 'circle' | 'polyline';
export type HatchStyle = 'none' | 'diagonal' | 'cross' | 'solid';
export type DimensionStyle = 'horizontal' | 'vertical' | 'aligned' | 'radial';

// Ontologies activables (Architecture §4) — deux lectures d'un même objet
export type Classification =
  | 'non-classifie'
  | 'architecture'   // building.architecture : murs, dalles, ouvertures
  | 'structure'      // building.structure : poteaux, poutres
  | 'mecanique'      // industry.mechanical : pièces, tôlerie
  | 'electrique';    // industry.electrical : appareils, câbles

export type ViewReading = 'batiment' | 'industrie';
export type DisplayLevel = 'essentiel' | 'contextuel' | 'complet';

export interface Layer {
  id: string;               // identifiant stable LAY-0001
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

interface Base {
  id: string;              // identifiant stable OBJ-0001
  name: string;
  kind: ObjectKind;
  classification: Classification;
  layerId: string;
  hatch?: HatchStyle;
  createdSeq: number;      // microversion de création
}

export interface LineObj extends Base { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
export interface RectObj extends Base { kind: 'rect'; x: number; y: number; w: number; h: number }
export interface CircleObj extends Base { kind: 'circle'; cx: number; cy: number; r: number }
export interface PolylineObj extends Base { kind: 'polyline'; points: number[] }

/** Cote associative : la géométrie affichée dérive de l'objet cible. */
export interface DimensionObj extends Base {
  kind: 'dimension';
  targetId: string;
  style: DimensionStyle;
  offset: number;
}

/** Occurrence d'un bloc réutilisable. */
export interface BlockRefObj extends Base {
  kind: 'blockRef';
  blockId: string;
  x: number;
  y: number;
  scale: number;
}

export type PrimitiveObject = LineObj | RectObj | CircleObj | PolylineObj;
export type CadObject = PrimitiveObject | DimensionObj | BlockRefObj;

export interface BlockDef {
  id: string;              // identifiant stable BLQ-0001
  name: string;
  description?: string;
  primitives: PrimitiveObject[];
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewCadObject = DistributiveOmit<CadObject, 'id' | 'createdSeq' | 'name'>;

// Microversion — versionnement Git-like (Concept §8). Chaque microversion
// capture les objets, les calques et les définitions de blocs.
export interface MicroVersion {
  seq: number;
  label: string;
  time: number;
  named?: string;          // version nommée (jalon, livrable)
  objects: CadObject[];
  layers: Layer[];
  blocks: BlockDef[];
}

export interface ProjectState {
  versions: MicroVersion[];
  pointer: number;         // indice de la microversion courante
  counter: number;         // compteur d'identifiants OBJ-
  layerCounter: number;    // compteur d'identifiants LAY-
  blockCounter: number;    // compteur d'identifiants BLQ-
  activeLayerId: string;
}

export function createDefaultLayers(): Layer[] {
  return [
    { id: 'LAY-0001', name: 'Bâtiment', color: '#22d3ee', visible: true, locked: false },
    { id: 'LAY-0002', name: 'Équipements', color: '#34d399', visible: true, locked: false },
    { id: 'LAY-0003', name: 'Repères', color: '#fbbf24', visible: true, locked: false },
    { id: 'LAY-0004', name: 'Dessin libre', color: '#8b93a7', visible: true, locked: false },
  ];
}

export const CLASSIFICATION_META: Record<Classification, { label: string; ontology: string; color: string }> = {
  'non-classifie': { label: 'Non classifié', ontology: '—', color: '#8b93a7' },
  'architecture':  { label: 'Architecture',  ontology: 'building.architecture', color: '#22d3ee' },
  'structure':     { label: 'Structure',     ontology: 'building.structure',    color: '#fbbf24' },
  'mecanique':     { label: 'Mécanique',     ontology: 'industry.mechanical',   color: '#34d399' },
  'electrique':    { label: 'Électrique',    ontology: 'industry.electrical',   color: '#f472b6' },
};

export const KIND_LABEL: Record<ObjectKind, string> = {
  line: 'Ligne',
  rect: 'Rectangle',
  circle: 'Cercle',
  polyline: 'Polyligne',
  dimension: 'Cote',
  blockRef: 'Bloc',
};

export const HATCH_LABEL: Record<HatchStyle, string> = {
  none: 'Aucun',
  diagonal: 'Diagonales',
  cross: 'Croisées',
  solid: 'Plein',
};

export const DIMENSION_LABEL: Record<DimensionStyle, string> = {
  horizontal: 'Horizontale',
  vertical: 'Verticale',
  aligned: 'Alignée',
  radial: 'Rayon / diamètre',
};

export function isClosedPolyline(obj: CadObject): obj is PolylineObj {
  if (obj.kind !== 'polyline' || obj.points.length < 6) return false;
  const p = obj.points;
  return Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]) < 0.01;
}

export function canHatch(obj: CadObject): obj is RectObj | CircleObj | PolylineObj {
  return obj.kind === 'rect' || obj.kind === 'circle' || isClosedPolyline(obj);
}

// Lecture métier d'un objet selon la vue active — « un objet, deux lectures » (Concept §1)
export function readingFor(obj: CadObject, view: ViewReading): { title: string; detail: string } {
  const dim = dimensionOf(obj);
  if (obj.kind === 'dimension') {
    return { title: 'Cote associative', detail: `Mesure dérivée de ${obj.targetId} — recalculée à chaque modification de la cible.` };
  }
  if (obj.kind === 'blockRef') {
    return { title: 'Occurrence de bloc', detail: `Référence ${obj.blockId} — la définition reste unique et réutilisable.` };
  }
  if (view === 'batiment') {
    switch (obj.classification) {
      case 'architecture': return { title: 'Élément architectural', detail: `Implantation bâtiment — encombrement ${dim}, position et zone.` };
      case 'structure':    return { title: 'Élément structurel', detail: `Porteur — profilé ${dim}, à coordonner avec les niveaux.` };
      case 'mecanique':    return { title: 'Équipement implanté', detail: `Encombrement ${dim} dans le plan ; définition de produit conservée.` };
      case 'electrique':   return { title: 'Appareil / réseau', detail: `Repère dans le local ; connexions et réseaux associés.` };
      default:             return { title: 'Géométrie libre', detail: `Tracé ${dim} — classifiez l'objet pour activer les lectures métier.` };
    }
  }
  switch (obj.classification) {
    case 'mecanique':    return { title: 'Pièce / tôle', detail: `Définition de produit — cote ${dim}, matière et développé dérivables.` };
    case 'electrique':   return { title: 'Composant électrique', detail: `Symbole et bornes — connectivité logique indépendante du tracé.` };
    case 'structure':    return { title: 'Membrure', detail: `Profil ${dim} — assemblages, boulons et soudures associables.` };
    case 'architecture': return { title: 'Enveloppe / volume', detail: `Volume ${dim} lu comme masse de fabrication.` };
    default:             return { title: 'Géométrie libre', detail: `Profil ${dim} — convertible en pièce par classification explicite.` };
  }
}

export function dimensionOf(obj: CadObject): string {
  switch (obj.kind) {
    case 'line': {
      const d = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
      return `L ${fmt(d)} mm`;
    }
    case 'rect': return `${fmt(obj.w)} × ${fmt(obj.h)} mm`;
    case 'circle': return `Ø ${fmt(obj.r * 2)} mm`;
    case 'polyline': {
      let d = 0;
      for (let i = 0; i + 3 < obj.points.length + 1 && i + 2 < obj.points.length; i += 2) {
        d += Math.hypot(obj.points[i + 2] - obj.points[i], obj.points[i + 3] - obj.points[i + 1]);
      }
      return `L ${fmt(d)} mm`;
    }
    case 'dimension': return `cote → ${obj.targetId}`;
    case 'blockRef': return `bloc ${obj.blockId} ×${fmt(obj.scale)}`;
  }
}

/**
 * Styles de cote pris en charge pour chaque type de cible — définition unique
 * utilisée par la création, l'inspecteur, la mesure, le rendu et l'export.
 * Le premier style de la liste est le style par défaut.
 */
export function supportedDimensionStyles(target: CadObject): DimensionStyle[] {
  switch (target.kind) {
    case 'line': return ['aligned', 'horizontal', 'vertical'];
    case 'rect': return ['horizontal', 'vertical'];
    case 'polyline': return ['horizontal', 'vertical'];
    case 'circle': return ['radial'];
    default: return [];
  }
}

/** Style réellement appliqué : le style demandé s'il est pris en charge, sinon le style par défaut de la cible. */
export function effectiveDimensionStyle(style: DimensionStyle, target: CadObject): DimensionStyle | null {
  const supported = supportedDimensionStyles(target);
  if (supported.includes(style)) return style;
  return supported[0] ?? null;
}

/** Emprise (min/max) des sommets d'une polyligne. */
export function polylineExtents(points: number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Valeur mesurée par une cote, en millimètres, à pleine précision.
 * Horizontale = ΔX, verticale = ΔY, alignée = longueur vraie, rayon = diamètre.
 */
export function dimensionMeasure(obj: DimensionObj, target: CadObject): { value: number; prefix: '' | 'Ø ' } | null {
  const style = effectiveDimensionStyle(obj.style, target);
  if (!style) return null;
  switch (target.kind) {
    case 'circle': return { value: target.r * 2, prefix: 'Ø ' };
    case 'rect': return { value: style === 'vertical' ? target.h : target.w, prefix: '' };
    case 'line': {
      const dx = Math.abs(target.x2 - target.x1);
      const dy = Math.abs(target.y2 - target.y1);
      return { value: style === 'horizontal' ? dx : style === 'vertical' ? dy : Math.hypot(dx, dy), prefix: '' };
    }
    case 'polyline': {
      const e = polylineExtents(target.points);
      return { value: style === 'vertical' ? e.maxY - e.minY : e.maxX - e.minX, prefix: '' };
    }
    default: return null;
  }
}

export function dimensionValue(obj: DimensionObj, objects: CadObject[]): string {
  const target = objects.find(o => o.id === obj.targetId);
  if (!target) return 'cible absente';
  const measure = dimensionMeasure(obj, target);
  if (!measure) return 'cote non prise en charge';
  return `${measure.prefix}${fmt(measure.value)} mm`;
}

/** Précision affichée par défaut : deux décimales au plus (la géométrie stockée n'est jamais arrondie). */
export const DISPLAY_DECIMALS = 2;

export function fmt(n: number, decimals = DISPLAY_DECIMALS): string {
  const value = Object.is(n, -0) ? 0 : n;
  return value.toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}
