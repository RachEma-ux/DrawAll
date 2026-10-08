// Zones (lot 13.3) : regroupement de pièces (nom, couleur) et surface cumulée. L'appartenance est
// portée par la pièce (`zoneId`) ; une pièce appartient à une zone au plus. Fonctions pures.
import type { CadObject, Zone } from '@/types/cad';
import { levelIdOf } from './levels';
import { areaM2, roomPolygons } from './rooms';

export interface ZoneSummary {
  zone: Zone;
  rooms: { id: string; name: string; areaM2: number | null }[];
  /** Somme des surfaces des pièces fermées (m²). */
  totalM2: number;
  /** Pièces non fermées : surface non évaluée, absente de la somme. */
  unevaluated: number;
}

/**
 * `objects` : objets de tous les niveaux (une zone peut couvrir plusieurs étages) ; le contour de
 * chaque pièce est calculé avec les murs de son seul niveau.
 */
export function zoneSummaries(objects: CadObject[], zones: Zone[] | undefined): ZoneSummary[] {
  if (!zones?.length) return [];
  const byLevel = new Map<string, CadObject[]>();
  for (const o of objects) { const k = levelIdOf(o); byLevel.set(k, [...(byLevel.get(k) ?? []), o]); }
  const polys = new Map<string, { x: number; y: number }[] | null>();
  for (const objs of byLevel.values()) for (const [id, p] of roomPolygons(objs)) polys.set(id, p);
  return zones.map(zone => {
    const rooms = objects
      .filter(o => o.kind === 'room' && o.zoneId === zone.id)
      .map(o => { const p = polys.get(o.id); return { id: o.id, name: o.name, areaM2: p ? areaM2(p) : null }; });
    return {
      zone,
      rooms,
      totalM2: rooms.reduce((s, r) => s + (r.areaM2 ?? 0), 0),
      unevaluated: rooms.filter(r => r.areaM2 === null).length,
    };
  });
}

/** Couleur de remplissage de chaque pièce rattachée à une zone connue. */
export function zoneColors(objects: CadObject[], zones: Zone[] | undefined): Map<string, string> {
  const color = new Map((zones ?? []).map(z => [z.id, z.color]));
  const out = new Map<string, string>();
  for (const o of objects) if (o.kind === 'room' && o.zoneId && color.has(o.zoneId)) out.set(o.id, color.get(o.zoneId)!);
  return out;
}

export const isHexColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
