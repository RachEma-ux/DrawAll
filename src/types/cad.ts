// Modèle d'information commun — inspiré de l'Architecture de référence V4 §4
// Identités stables, classifications métier (ontologies), représentations multiples.

import { deviations, formatClass, formatDeviation, parseClass } from '@/lib/iso286';

export type ObjectKind = 'line' | 'rect' | 'circle' | 'arc' | 'polyline' | 'dimension' | 'pdim' | 'blockRef' | 'text' | 'wall' | 'opening' | 'room' | 'north' | 'section' | 'levelMark' | 'roughness';
export type TextAlign = 'left' | 'center' | 'right';
export type PrimitiveKind = 'line' | 'rect' | 'circle' | 'arc' | 'polyline';
export type HatchStyle = 'none' | 'diagonal' | 'cross' | 'solid';

/**
 * Hachure paramétrée : angle (degrés, antihoraire depuis +X), pas entre traits, unité du pas
 * (« papier » : constant sur la feuille quelle que soit l'échelle ; « modèle » : dimension réelle,
 * par exemple un calepinage), origine du motif dans le modèle.
 */
export interface HatchParams { angle: number; spacing: number; unit: 'papier' | 'modele'; originX?: number; originY?: number }
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

/** Types de trait de base ISO 128-2 retenus (01, 02, 04, 05). */
export type LineType = 'continu' | 'interrompu' | 'mixte' | 'mixte-double';

export interface Layer {
  id: string;               // identifiant stable LAY-0001
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  lineType?: LineType;      // défaut : continu
  lineWeight?: number;      // mm sur la feuille ; défaut : 0,25
}

interface Base {
  id: string;              // identifiant stable OBJ-0001
  name: string;
  kind: ObjectKind;
  classification: Classification;
  layerId: string;
  hatch?: HatchStyle;
  createdSeq: number;      // microversion de création
  /** Niveau (étage) de l'objet (lot 4.4) ; absent = niveau par défaut NIV-0001. */
  levelId?: string;
  /** Matériau (bibliothèque src/lib/materials.ts) ; le motif affiché en découle par le profil de dessin. */
  materialId?: string;
  /** Paramètres des hachures (lot 3.2) ; absents = 45°, pas papier de 3 mm. */
  hatchParams?: HatchParams;
  /** Îlots non hachurés : identifiants de contours fermés situés dans l'objet. */
  holes?: string[];
  // Propriétés de trait propres à l'objet ; absentes = « du calque ».
  color?: string;
  lineType?: LineType;
  lineWeight?: number;     // mm sur la feuille
}

export interface LineObj extends Base { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
export interface RectObj extends Base { kind: 'rect'; x: number; y: number; w: number; h: number }
export interface CircleObj extends Base { kind: 'circle'; cx: number; cy: number; r: number }
/**
 * Arc de cercle : centre, rayon, angles de début et de fin en degrés, parcouru dans le sens
 * trigonométrique du repère DXF (Y vers le haut) — donc dans le sens antihoraire à l'écran.
 */
export interface ArcObj extends Base { kind: 'arc'; cx: number; cy: number; r: number; start: number; end: number }
export interface PolylineObj extends Base { kind: 'polyline'; points: number[] }

/** Cote associative : la géométrie affichée dérive de l'objet cible. */
export interface DimensionObj extends Base {
  kind: 'dimension';
  targetId: string;
  style: DimensionStyle;
  offset: number;
  /** Cote radiale : rayon (R) ou diamètre (Ø) ; défaut Ø pour un cercle, R pour un arc. */
  radialMode?: 'rayon' | 'diametre';
  /** Tolérance (lot 5.1) ; absente = cote nominale seule. */
  tolerance?: DimensionTolerance;
}

/**
 * Tolérance d'une cote (lot 5.1) : symétrique (± mm), écarts saisis (mm, signés), classe ISO 286
 * (« H7 », « g6 ») dont les écarts sont tirés de la norme, ou ajustement alésage / arbre (« H7/g6 »).
 */
export type DimensionTolerance =
  | { kind: 'symetrique'; value: number }
  | { kind: 'ecarts'; upper: number; lower: number }
  | { kind: 'classe'; cls: string }
  | { kind: 'ajustement'; hole: string; shaft: string };

/**
 * Cote par points (lot 2.6), non associative : sa valeur vient de ses points.
 * - chain : cotation en série (chaînée) entre points successifs ;
 * - baseline : cotes cumulées depuis le premier point (origine) ;
 * - angular : angle au sommet (points : sommet, branche 1, branche 2) ;
 * - level : cote de niveau d'un point par rapport au niveau ±0,00 (`reference`, Y du modèle).
 */
export type PointDimensionMode = 'chain' | 'baseline' | 'angular' | 'level';
export interface PointDimensionObj extends Base {
  kind: 'pdim';
  mode: PointDimensionMode;
  /** Direction mesurée (série et cumulée). */
  axis: 'horizontal' | 'vertical' | 'aligned';
  points: number[];
  /** Distance de la ligne de cote aux points (mm), rayon de l'arc pour une cote angulaire. */
  offset: number;
  /** Cote de niveau : Y du modèle au niveau ±0,00. */
  reference?: number;
}

/**
 * Texte : point d'insertion sur la ligne de base, hauteur des majuscules en mm (modèle),
 * rotation en degrés dans le sens trigonométrique (repère DXF, Y vers le haut).
 * Le contenu peut compter plusieurs lignes (séparées par « \n »).
 */
export interface TextObj extends Base {
  kind: 'text';
  x: number;
  y: number;
  content: string;
  height: number;
  rotation: number;
  align: TextAlign;
}

/** Occurrence d'un bloc réutilisable. */
export interface BlockRefObj extends Base {
  kind: 'blockRef';
  blockId: string;
  x: number;
  y: number;
  scale: number;
}

export type PrimitiveObject = LineObj | RectObj | CircleObj | ArcObj | PolylineObj;
/**
 * Mur (lot 4.1) : trait de référence (x1, y1) → (x2, y2), épaisseur et justification : le trait est
 * l'axe du mur, ou sa face gauche / droite (côté vu à l'écran en parcourant le trait).
 */
export interface WallObj extends Base {
  kind: 'wall';
  x1: number; y1: number; x2: number; y2: number;
  thickness: number;
  justification: 'axe' | 'gauche' | 'droite';
}

/**
 * Ouverture (lot 4.2) : porte ou fenêtre hébergée par un mur, à `position` mm de son début (centre
 * de la baie). Porte : charnière au début ou à la fin de la baie, ouverture du côté gauche ou droit.
 */
export interface OpeningObj extends Base {
  kind: 'opening';
  hostId: string;
  type: 'porte' | 'fenetre';
  position: number;
  width: number;
  hinge: 'debut' | 'fin';
  side: 'gauche' | 'droite';
}

/**
 * Pièce (lot 4.3) : nom et point intérieur. Son contour est la face fermée par les murs qui contient
 * ce point, recalculé à chaque modification des murs.
 */
export interface RoomObj extends Base {
  kind: 'room';
  x: number; y: number;
}

/** Nord (lot 4.5) : centre du symbole et direction du nord, en degrés antihoraires depuis le haut de l'écran. */
export interface NorthObj extends Base {
  kind: 'north';
  x: number; y: number;
  rotation: number;
}

/**
 * Repère de coupe (lot 4.5) : trace du plan de coupe de (x1, y1) à (x2, y2), repère (« A ») et sens
 * de la vue : à gauche du trait parcouru, à droite si `flip`.
 */
export interface SectionMarkObj extends Base {
  kind: 'section';
  x1: number; y1: number; x2: number; y2: number;
  label: string;
  flip?: boolean;
}

/** Cote de niveau en plan (lot 4.5) : point et altitude saisie (mm, par rapport au ±0,00). */
export interface LevelMarkObj extends Base {
  kind: 'levelMark';
  x: number; y: number;
  elevation: number;
}

/**
 * État de surface (lot 5.1) : symbole graphique pointe sur la surface (ISO 21920-1, ex-ISO 1302),
 * procédé (quelconque, enlèvement de matière exigé ou interdit) et rugosité Ra saisie (µm).
 */
export interface RoughnessObj extends Base {
  kind: 'roughness';
  x: number; y: number;
  rotation: number;
  process: 'quelconque' | 'enlevement' | 'sans-enlevement';
  ra?: number;
}

export type CadObject = PrimitiveObject | DimensionObj | PointDimensionObj | BlockRefObj | TextObj | WallObj | OpeningObj | RoomObj | NorthObj | SectionMarkObj | LevelMarkObj | RoughnessObj;

export interface BlockDef {
  id: string;              // identifiant stable BLQ-0001
  name: string;
  description?: string;
  /** Gabarit de la bibliothèque bâtiment d'origine (lot 4.5). */
  libraryKey?: string;
  primitives: PrimitiveObject[];
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewCadObject = DistributiveOmit<CadObject, 'id' | 'createdSeq' | 'name'>;

// Microversion — versionnement Git-like (Concept §8). Chaque microversion
// capture les objets, les calques et les définitions de blocs.
// ─── Feuilles et fenêtres (présentations) ─────────────────────────────────────
// Une feuille est un support papier ; une fenêtre y montre une partie du modèle à une échelle.
// Toutes les grandeurs de feuille sont en millimètres papier, origine en haut à gauche.

export type PaperFormat = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';
export type Orientation = 'portrait' | 'paysage';

/** Échelle de représentation : `paper` mm sur la feuille pour `model` mm réels (1:50 → 1 / 50). */
export interface DrawingScale { paper: number; model: number }

export interface Viewport {
  id: string;              // identifiant stable FEN-0001
  name: string;
  x: number; y: number;    // coin haut gauche sur la feuille (mm papier)
  w: number; h: number;    // taille sur la feuille (mm papier)
  scale: DrawingScale;
  center: { x: number; y: number };   // point du modèle au centre de la fenêtre (mm)
  hiddenLayerIds: string[];           // calques masqués dans cette fenêtre seulement
  levelId?: string;                   // niveau montré (lot 4.4) ; absent = niveau par défaut
  context?: 'coupe' | 'vue';          // représentation des matériaux (lot 3.3) ; défaut : coupe
}

/** Méthode de projection orthogonale (ISO 5456-2) indiquée au cartouche. */
export type ProjectionMethod = 'premier-diedre' | 'troisieme-diedre';

/** Champs saisis du cartouche ; échelle, date et indice sont tirés du projet. */
export interface TitleBlock {
  project: string;
  title: string;
  author: string;
  projection: ProjectionMethod;
}

export interface Sheet {
  id: string;              // identifiant stable FEU-0001
  name: string;
  format: PaperFormat;
  orientation: Orientation;
  margins: { top: number; right: number; bottom: number; left: number };
  viewports: Viewport[];
  titleBlock?: TitleBlock; // absent = pas de cartouche
}

/** Niveau (étage) : nom et altitude du plancher (mm, par rapport au ±0,00 du projet). */
export interface Level { id: string; name: string; elevation: number }

export interface MicroVersion {
  seq: number;
  label: string;
  time: number;
  named?: string;          // version nommée (jalon, livrable)
  index?: string;          // indice émis sur cette version (lot 2.3) : lettre figée, jamais réattribuée
  objects: CadObject[];
  layers: Layer[];
  blocks: BlockDef[];
  sheets?: Sheet[];        // absent dans les projets antérieurs au lot 2.1
  profileId?: string;      // profil de dessin (lot 3.1) ; absent = profil par défaut
  surfaceRule?: 'sia-416' | 'carrez'; // règle de surface des pièces (lot 4.3) ; absent = SIA 416
  levels?: Level[];        // niveaux (lot 4.4) ; absent = un seul niveau par défaut
}

export interface ProjectState {
  versions: MicroVersion[];
  pointer: number;         // indice de la microversion courante
  counter: number;         // compteur d'identifiants OBJ-
  layerCounter: number;    // compteur d'identifiants LAY-
  blockCounter: number;    // compteur d'identifiants BLQ-
  activeLayerId: string;
  activeLevelId?: string;  // niveau affiché et édité (lot 4.4)
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
  arc: 'Arc',
  polyline: 'Polyligne',
  dimension: 'Cote',
  blockRef: 'Bloc',
  text: 'Texte',
  pdim: 'Cote par points',
  wall: 'Mur',
  opening: 'Ouverture',
  room: 'Pièce',
  north: 'Nord',
  section: 'Repère de coupe',
  levelMark: 'Cote de niveau',
  roughness: 'État de surface',
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
  // Un arc n'est pas un contour fermé : pas de hachure.
  return obj.kind === 'rect' || obj.kind === 'circle' || isClosedPolyline(obj);
}

// Lecture métier d'un objet selon la vue active — « un objet, deux lectures » (Concept §1)
export function readingFor(obj: CadObject, view: ViewReading): { title: string; detail: string } {
  const dim = dimensionOf(obj);
  if (obj.kind === 'dimension') {
    return { title: 'Cote associative', detail: `Mesure dérivée de ${obj.targetId} — recalculée à chaque modification de la cible.` };
  }
  if (obj.kind === 'text') {
    return { title: 'Annotation', detail: `« ${obj.content.split('\n')[0]} » — texte de ${fmt(obj.height)} mm, lisible dans les deux lectures.` };
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
    case 'arc': return `R ${fmt(obj.r)} mm · ${fmt(((((obj.end - obj.start) % 360) + 360) % 360) || 360)}°`;
    case 'polyline': {
      let d = 0;
      for (let i = 0; i + 3 < obj.points.length + 1 && i + 2 < obj.points.length; i += 2) {
        d += Math.hypot(obj.points[i + 2] - obj.points[i], obj.points[i + 3] - obj.points[i + 1]);
      }
      return `L ${fmt(d)} mm`;
    }
    case 'dimension': return `cote → ${obj.targetId}`;
    case 'pdim': return `cote par points (${obj.points.length / 2} points)`;
    case 'wall': return `Mur ép. ${fmt(obj.thickness)} mm · L ${fmt(Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1))} mm`;
    case 'opening': return `${obj.type === 'porte' ? 'Porte' : 'Fenêtre'} ${fmt(obj.width)} mm · ${obj.hostId}`;
    case 'room': return `Pièce « ${obj.name} »`;
    case 'north': return `Nord à ${fmt(obj.rotation)}°`;
    case 'section': return `Coupe ${obj.label} · L ${fmt(Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1))} mm`;
    case 'levelMark': return `Niveau ${fmt(obj.elevation / 1000)} m`;
    case 'roughness': return obj.ra !== undefined ? `Ra ${fmt(obj.ra, 3)} µm` : 'État de surface';
    case 'blockRef': return `bloc ${obj.blockId} ×${fmt(obj.scale)}`;
    case 'text': return `texte h ${fmt(obj.height)} mm`;
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
    case 'arc': return ['radial'];
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
  // Boucle explicite : une polyligne importée peut compter des centaines de milliers de sommets.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (points[i] < minX) minX = points[i];
    if (points[i] > maxX) maxX = points[i];
    if (points[i + 1] < minY) minY = points[i + 1];
    if (points[i + 1] > maxY) maxY = points[i + 1];
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Valeur mesurée par une cote, en millimètres, à pleine précision.
 * Horizontale = ΔX, verticale = ΔY, alignée = longueur vraie, rayon = diamètre.
 */
export function dimensionMeasure(obj: DimensionObj, target: CadObject): { value: number; prefix: '' | 'Ø ' | 'R ' } | null {
  const style = effectiveDimensionStyle(obj.style, target);
  if (!style) return null;
  switch (target.kind) {
    // Cote radiale : diamètre par défaut pour un cercle, rayon pour un arc ; l'utilisateur peut choisir.
    case 'circle': return (obj.radialMode ?? 'diametre') === 'diametre' ? { value: target.r * 2, prefix: 'Ø ' } : { value: target.r, prefix: 'R ' };
    case 'arc': return (obj.radialMode ?? 'rayon') === 'rayon' ? { value: target.r, prefix: 'R ' } : { value: target.r * 2, prefix: 'Ø ' };
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
  return `${measure.prefix}${fmt(measure.value)}${toleranceText(obj.tolerance, measure.value)} mm`;
}

/** Texte de tolérance ajouté à la valeur d'une cote (« ±0,1 », « +0,1/−0,05 », « H7 (+0,021/0) »). */
export function toleranceText(t: DimensionTolerance | undefined, nominal: number): string {
  if (!t) return '';
  const mm = (v: number) => formatDeviation(Math.round(v * 1e6) / 1e3);
  switch (t.kind) {
    case 'symetrique': return ` ±${fmt(Math.abs(t.value), 4)}`;
    case 'ecarts': return ` ${mm(t.upper)}/${mm(t.lower)}`;
    case 'classe': {
      const c = parseClass(t.cls);
      const d = c ? deviations(nominal, c) : null;
      return d?.ok ? ` ${formatClass(c!)} (${formatDeviation(d.value.upper)}/${formatDeviation(d.value.lower)})` : ` ${t.cls} (non évalué)`;
    }
    case 'ajustement': return ` ${t.hole}/${t.shaft}`;
  }
}

/** Précision affichée par défaut : deux décimales au plus (la géométrie stockée n'est jamais arrondie). */
export const DISPLAY_DECIMALS = 2;

export function fmt(n: number, decimals = DISPLAY_DECIMALS): string {
  const value = Object.is(n, -0) ? 0 : n;
  return value.toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}
