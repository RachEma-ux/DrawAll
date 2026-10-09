// Niveaux (lot 4.4) : étages avec altitude, objets rattachés à un niveau, copie d'un niveau.
// Fonctions pures.
import { withParents, type CadObject, type Level } from '@/types/cad';
import { nextGroupId } from '@/lib/groups';

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
  // Groupes (lot 10.5) : les copies forment des groupes neufs, propres au niveau copié.
  const groups = new Map<string, string>();
  const taken: string[] = [];
  const ids = new Map<string, string>();
  for (const o of source) { counter += 1; ids.set(o.id, `OBJ-${String(counter).padStart(4, '0')}`); }
  const copies: CadObject[] = [];
  for (const o of source) {
    // Liens refaits vers les copies (parent et, pour une coupe, repère) ; sinon l'objet n'est pas copié.
    const c = withParents({ ...o, id: ids.get(o.id)!, levelId: toId, createdSeq: seq } as CadObject, p => ids.get(p));
    if (!c) continue;
    if (c.holes) c.holes = c.holes.map(h => ids.get(h)).filter((h): h is string => !!h);
    // Liaison d'occurrence : vers la copie de sa cible ; une cible hors du niveau copié : liaison retirée.
    if (c.kind === 'occurrence' && c.mate) {
      const to = ids.get(c.mate.to);
      if (to) c.mate = { ...c.mate, to };
      else delete (c as { mate?: unknown }).mate;
    }
    if (c.name === o.id) c.name = c.id;
    if (c.groupId) {
      let g = groups.get(c.groupId);
      if (!g) { g = nextGroupId(objects, taken); taken.push(g); groups.set(c.groupId, g); }
      c.groupId = g;
    }
    copies.push(c);
  }
  return { objects: copies, counter };
}
