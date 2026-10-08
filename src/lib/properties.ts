// Propriétés et classification (lot 12.3) : jeux de propriétés par objet (nom, valeur, unité) et
// classe IFC 4.3, par défaut selon le type d'objet, modifiable. Aucun contenu de jeu normalisé n'est
// inventé : l'utilisateur saisit ses propriétés ; seul le nom usuel « Pset_<Classe>Common » est
// proposé. Fonctions pures.
import type { CadObject } from '@/types/cad';

export type PropValue = string | number | boolean;
export interface Property { name: string; value: PropValue; unit?: string }
export interface PropertySet { name: string; props: Property[] }

/** Entités IFC 4.3 (ISO 16739-1:2024) proposées à la classification. */
export const IFC_CLASSES = [
  'IfcAnnotation', 'IfcBeam', 'IfcBuildingElementProxy', 'IfcColumn', 'IfcCovering', 'IfcCurtainWall', 'IfcDiscreteAccessory',
  'IfcDoor', 'IfcElementAssembly', 'IfcFooting', 'IfcFurnishingElement', 'IfcMechanicalFastener', 'IfcMember', 'IfcPile',
  'IfcPlate', 'IfcRailing', 'IfcRamp', 'IfcRoof', 'IfcSlab', 'IfcSpace', 'IfcStair', 'IfcWall', 'IfcWindow',
] as const;
export type IfcClass = (typeof IFC_CLASSES)[number];
export const isIfcClass = (c: unknown): c is IfcClass => typeof c === 'string' && (IFC_CLASSES as readonly string[]).includes(c);

/** Unités proposées aux propriétés (vide : sans unité). */
export const PROPERTY_UNITS = ['', 'mm', 'm', 'm²', 'm³', 'kg', '°', '%', 'W/(m²·K)', 'dB', 'h'] as const;

/**
 * Classe IFC par défaut d'un objet : mur → IfcWall, baie → IfcDoor ou IfcWindow, pièce → IfcSpace,
 * occurrence de bloc → IfcBuildingElementProxy ; géométrie de dessin et annotations → IfcAnnotation.
 */
export function defaultIfcClass(o: CadObject): IfcClass {
  switch (o.kind) {
    case 'wall': return 'IfcWall';
    case 'opening': return o.type === 'porte' ? 'IfcDoor' : 'IfcWindow';
    case 'room': return 'IfcSpace';
    case 'slab': return 'IfcSlab';
    case 'blockRef': return 'IfcBuildingElementProxy';
    // Géométrie de dessin (lignes, contours…) et annotations : représentations 2D sans élément porteur.
    default: return 'IfcAnnotation';
  }
}

/** Classe IFC retenue : celle choisie, sinon celle du type d'objet. */
export const ifcClassOf = (o: CadObject): IfcClass => (isIfcClass(o.ifcClass) ? o.ifcClass : defaultIfcClass(o));

/** Nom usuel du jeu de propriétés commun d'une classe (IfcWall → Pset_WallCommon). */
export const commonPsetName = (c: IfcClass) => `Pset_${c.replace(/^Ifc/, '')}Common`;

const validName = (n: unknown): n is string => typeof n === 'string' && n.trim().length > 0 && n.length <= 128;

/** Jeux de propriétés relus : noms non vides, valeurs typées (texte, nombre fini, booléen), unités connues ; doublons écartés. */
export function normalizePsets(raw: unknown): PropertySet[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sets: PropertySet[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object' || !validName((s as PropertySet).name) || sets.some(x => x.name === (s as PropertySet).name)) continue;
    const props: Property[] = [];
    for (const p of Array.isArray((s as PropertySet).props) ? (s as PropertySet).props : []) {
      if (!p || !validName(p.name) || props.some(x => x.name === p.name)) continue;
      const okValue = typeof p.value === 'string' || typeof p.value === 'boolean' || (typeof p.value === 'number' && Number.isFinite(p.value));
      if (!okValue) continue;
      const unit = typeof p.unit === 'string' && (PROPERTY_UNITS as readonly string[]).includes(p.unit) && p.unit ? p.unit : undefined;
      props.push({ name: p.name, value: p.value, ...(unit ? { unit } : {}) });
    }
    sets.push({ name: (s as PropertySet).name, props });
  }
  return sets.length ? sets : undefined;
}

/** Ajoute un jeu vide ; refuse un nom vide ou déjà pris. */
export function addPset(psets: PropertySet[] | undefined, name: string): PropertySet[] | { error: string } {
  const n = name.trim();
  if (!n) return { error: 'Nom du jeu de propriétés attendu.' };
  // Même règle qu'à la relecture : un jeu accepté ici n'est jamais écarté au rechargement.
  if (!validName(n)) return { error: 'Nom du jeu de propriétés trop long (128 caractères au plus).' };
  if (psets?.some(s => s.name === n)) return { error: `Le jeu « ${n} » existe déjà.` };
  return [...(psets ?? []), { name: n, props: [] }];
}

/** Valeur typée d'une saisie : « vrai »/« faux » en booléen, nombre (virgule acceptée), sinon texte. */
export function parseValue(text: string, kind: 'texte' | 'nombre' | 'booleen'): PropValue | { error: string } {
  const t = text.trim();
  if (kind === 'booleen') {
    if (/^(vrai|oui|true)$/i.test(t)) return true;
    if (/^(faux|non|false)$/i.test(t)) return false;
    return { error: 'Valeur booléenne attendue (vrai ou faux).' };
  }
  if (kind === 'nombre') {
    const n = Number(t.replace(',', '.'));
    return t !== '' && Number.isFinite(n) ? n : { error: `Nombre attendu, « ${t} » reçu.` };
  }
  return t;
}

/** Pose (ou remplace) une propriété dans un jeu existant. */
export function setProperty(psets: PropertySet[] | undefined, set: string, prop: Property): PropertySet[] | { error: string } {
  if (!validName(prop.name)) return { error: 'Nom de propriété attendu.' };
  if (!psets?.some(s => s.name === set)) return { error: `Jeu « ${set} » inconnu.` };
  return psets.map(s => (s.name !== set ? s : {
    ...s,
    props: s.props.some(p => p.name === prop.name) ? s.props.map(p => (p.name === prop.name ? prop : p)) : [...s.props, prop],
  }));
}

export function removeProperty(psets: PropertySet[], set: string, name: string): PropertySet[] {
  return psets.map(s => (s.name !== set ? s : { ...s, props: s.props.filter(p => p.name !== name) }));
}

export const removePset = (psets: PropertySet[], set: string) => psets.filter(s => s.name !== set);

/** Valeur affichée (booléens en français, nombres à virgule). */
export function formatValue(p: Property): string {
  const v = typeof p.value === 'boolean' ? (p.value ? 'vrai' : 'faux') : typeof p.value === 'number' ? String(p.value).replace('.', ',') : p.value;
  return p.unit ? `${v} ${p.unit}` : v;
}
