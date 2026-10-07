// Matériaux et profils de dessin (lot 3.1). Un matériau dit de quoi l'objet est fait ; un profil de
// dessin dit comment le représenter. Changer de profil change l'apparence, jamais le matériau.
// Les correspondances matériau → motif sont des usages (enseignement, entreprise), pas une norme :
// chaque profil porte sa version, sa source et son domaine (Conventions §4.3).
import type { CadObject, HatchStyle } from '@/types/cad';

export interface Material {
  id: string;
  name: string;
  family: 'construction' | 'métal' | 'isolant' | 'autre';
}

/** Bibliothèque de base : noms seulement, aucune propriété physique ou réglementaire. */
export const MATERIALS: Material[] = [
  { id: 'beton', name: 'Béton', family: 'construction' },
  { id: 'beton-arme', name: 'Béton armé', family: 'construction' },
  { id: 'maconnerie', name: 'Maçonnerie', family: 'construction' },
  { id: 'bois', name: 'Bois', family: 'construction' },
  { id: 'terre', name: 'Terre, remblai', family: 'construction' },
  { id: 'acier', name: 'Acier', family: 'métal' },
  { id: 'aluminium', name: 'Aluminium', family: 'métal' },
  { id: 'isolant', name: 'Isolant', family: 'isolant' },
  { id: 'verre', name: 'Verre', family: 'autre' },
];

export const materialById = (id: string | undefined) => MATERIALS.find(m => m.id === id);

export interface DrawingProfile {
  id: string;
  name: string;
  version: string;
  /** Origine des correspondances (aucun profil n'est présenté comme une norme). */
  source: string;
  domain: string;
  /** Motif par matériau ; un matériau absent prend `fallback`. */
  patterns: Record<string, HatchStyle>;
  fallback: HatchStyle;
}

export const PROFILES: DrawingProfile[] = [
  {
    id: 'neutre',
    name: 'Neutre',
    version: '1.0',
    source: 'DrawAll — profil par défaut, sans référence normative (décision du maître d’ouvrage en attente, §7).',
    domain: 'Tous domaines',
    patterns: {},
    fallback: 'diagonal',
  },
  {
    id: 'enseignement',
    name: 'Enseignement — usages courants',
    version: '1.0',
    source: 'Usages d’enseignement du dessin technique, non normatifs (ISO 4069:1977, retirée, ne fixait aucun motif par matériau).',
    domain: 'Bâtiment et mécanique, exercices',
    patterns: {
      beton: 'cross', 'beton-arme': 'cross', maconnerie: 'diagonal', bois: 'diagonal', terre: 'cross',
      acier: 'diagonal', aluminium: 'cross', isolant: 'none', verre: 'solid',
    },
    fallback: 'diagonal',
  },
  {
    id: 'pleins',
    name: 'Plans de présentation — aplats',
    version: '1.0',
    source: 'Usage de présentation (rendus simplifiés), non normatif.',
    domain: 'Plans de présentation',
    patterns: {},
    fallback: 'solid',
  },
];

export const DEFAULT_PROFILE_ID = 'neutre';

export const profileById = (id: string | undefined) => PROFILES.find(p => p.id === id) ?? PROFILES.find(p => p.id === DEFAULT_PROFILE_ID)!;

/** Motif affiché d'un objet : celui que le profil associe à son matériau, sinon son motif propre. */
export function effectiveHatch(o: Pick<CadObject, 'hatch' | 'materialId'>, profile: DrawingProfile): HatchStyle {
  if (o.materialId && materialById(o.materialId)) return profile.patterns[o.materialId] ?? profile.fallback;
  return o.hatch ?? 'none';
}

/**
 * Objets tels qu'il faut les dessiner ou les exporter avec ce profil : seul le motif affiché change ;
 * les objets d'origine (et leur matériau) ne sont pas modifiés.
 */
export function withProfile<T extends CadObject>(objects: T[], profile: DrawingProfile): T[] {
  return objects.map(o => {
    if (!o.materialId) return o;
    const hatch = effectiveHatch(o, profile);
    return hatch === o.hatch ? o : { ...o, hatch };
  });
}
