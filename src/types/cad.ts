// Modèle d'information commun — inspiré de l'Architecture de référence V4 §4
// Identités stables, classifications métier (ontologies), représentations multiples.

export type ObjectKind = 'line' | 'rect' | 'circle' | 'polyline';

// Ontologies activables (Architecture §4) — deux lectures d'un même objet
export type Classification =
  | 'non-classifie'
  | 'architecture'   // building.architecture : murs, dalles, ouvertures
  | 'structure'      // building.structure : poteaux, poutres
  | 'mecanique'      // industry.mechanical : pièces, tôlerie
  | 'electrique';    // industry.electrical : appareils, câbles

export type ViewReading = 'batiment' | 'industrie';
export type DisplayLevel = 'essentiel' | 'contextuel' | 'complet';

interface Base {
  id: string;              // identifiant stable OBJ-0001
  name: string;
  kind: ObjectKind;
  classification: Classification;
  layer: string;
  createdSeq: number;      // microversion de création
}

export interface LineObj extends Base { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
export interface RectObj extends Base { kind: 'rect'; x: number; y: number; w: number; h: number }
export interface CircleObj extends Base { kind: 'circle'; cx: number; cy: number; r: number }
export interface PolylineObj extends Base { kind: 'polyline'; points: number[] }

export type CadObject = LineObj | RectObj | CircleObj | PolylineObj;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewCadObject = DistributiveOmit<CadObject, 'id' | 'createdSeq' | 'name'>;

// Microversion — versionnement Git-like (Concept §8)
export interface MicroVersion {
  seq: number;
  label: string;
  time: number;
  named?: string;          // version nommée (jalon, livrable)
  objects: CadObject[];
}

export interface ProjectState {
  versions: MicroVersion[];
  pointer: number;         // indice de la microversion courante
  counter: number;         // compteur d'identifiants OBJ-
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
};

// Lecture métier d'un objet selon la vue active — « un objet, deux lectures » (Concept §1)
export function readingFor(obj: CadObject, view: ViewReading): { title: string; detail: string } {
  const dim = dimensionOf(obj);
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
  }
}

export function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}
