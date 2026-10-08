// Niveaux (lot 4.4) : étages avec altitude, objets rattachés à un niveau, copie d'un niveau.
// Fonctions pures.
import type { CadObject, Level } from '@/types/cad';

export const DEFAULT_LEVEL: Level = { id: 'NIV-0001', name: 'Rez-de-chaussée', elevation: 0 };

/** Niveaux du projet (au moins le niveau par défaut), triés par altitude. */
export function levelsOf(levels: Level[] | undefined): Level[] {
  const list = levels && levels.length ? levels : [DEFAULT_LEVEL];
  return [...list].sort((a, b) => a.elevation - b.elevation || a.id.localeCompare(b.id));
}

export const levelIdOf = (o: Pick<CadObject, 'levelId'>) => o.levelId ?? DEFAULT_LEVEL.id;

/**
 * Niveau montré par une fenêtre de feuille : celui qu'elle désigne s'il existe, sinon le premier
 * niveau du projet (même règle pour l'aperçu, le PDF et le SVG).
 */
export function viewportLevelId(vp: Pick<CadObject, 'levelId'>, levels: Level[] | undefined): string {
  const list = levelsOf(levels);
  const id = levelIdOf(vp);
  return list.some(l => l.id === id) ? id : list[0].id;
}

/** Objets d'un niveau. */
export const onLevel = <T extends Pick<CadObject, 'levelId'>>(objects: T[], levelId: string) => objects.filter(o => levelIdOf(o) === levelId);

/** Niveau immédiatement inférieur (pour le fond de plan), ou null. */
export function levelBelow(levels: Level[], levelId: string): Level | null {
  const sorted = levelsOf(levels);
  const i = sorted.findIndex(l => l.id === levelId);
  return i > 0 ? sorted[i - 1] : null;
}

/** Altitude affichée en mètres signée : « +2,80 m », « ±0,00 m ». */
export function formatElevation(mm: number): string {
  const m = Math.round(mm / 10) / 100;
  if (m === 0) return '±0,00 m';
  return `${m > 0 ? '+' : '−'}${Math.abs(m).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

/**
 * Copie des objets d'un niveau vers un autre : identifiants neufs (compteur), liens internes
 * refaits (ouverture → mur, cote → cible, îlots), objets rattachés au niveau cible.
 */
export function copyLevelObjects(objects: CadObject[], fromId: string, toId: string, counter: number, seq: number): { objects: CadObject[]; counter: number } {
  const source = onLevel(objects, fromId);
  const ids = new Map<string, string>();
  for (const o of source) { counter += 1; ids.set(o.id, `OBJ-${String(counter).padStart(4, '0')}`); }
  const copies: CadObject[] = [];
  for (const o of source) {
    const c = { ...o, id: ids.get(o.id)!, levelId: toId, createdSeq: seq } as CadObject;
    if (c.kind === 'opening') { const h = ids.get(c.hostId); if (!h) continue; c.hostId = h; }
    if (c.kind === 'dimension') { const t = ids.get(c.targetId); if (!t) continue; c.targetId = t; }
    if (c.holes) c.holes = c.holes.map(h => ids.get(h)).filter((h): h is string => !!h);
    if (c.name === o.id) c.name = c.id;
    copies.push(c);
  }
  return { objects: copies, counter };
}
