// Cartouche (lot 2.3) : champs saisis (projet, titre, auteur, méthode de projection) et champs
// tirés du projet (échelle des fenêtres, date et indice de la version). Fonctions pures.
import type { MicroVersion, ProjectionMethod, Sheet, TitleBlock } from '@/types/cad';
import { formatScale, printableArea, type Rect } from '@/lib/sheet';

/** Largeur normalisée du cartouche (ISO 7200 : 180 mm au plus) et hauteur retenue. */
export const TITLE_BLOCK_SIZE = { w: 180, h: 32 };

export const PROJECTION_LABEL: Record<ProjectionMethod, string> = {
  'premier-diedre': 'Premier dièdre (ISO E)',
  'troisieme-diedre': 'Troisième dièdre (ISO A)',
};

export const DEFAULT_TITLE_BLOCK: TitleBlock = { project: '', title: '', author: '', projection: 'premier-diedre' };

/** Lettre d'indice : A, B, … Z, puis AA, AB… */
export function indexLetter(n: number): string {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** Rang d'une lettre d'indice (A = 1, AA = 27) ; 0 si illisible. */
export function indexNumber(letter: string): number {
  if (!/^[A-Z]+$/.test(letter)) return 0;
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Indice de la version affichée : la lettre émise sur elle ou, à défaut, sur la dernière version
 * émise avant elle (marquée « modifié depuis »). Les lettres sont enregistrées à l'émission : nommer
 * plus tard une version plus ancienne ne change aucun indice déjà émis.
 */
export function revisionIndex(versions: MicroVersion[], pointer: number): { letter: string | null; named: string | null; pending: boolean } {
  let issued: MicroVersion | null = null;
  for (let i = 0; i <= pointer && i < versions.length; i++) if (versions[i].index) issued = versions[i];
  return { letter: issued?.index ?? null, named: issued?.named ?? null, pending: !versions[pointer]?.index };
}

/** Lettre du prochain indice : celle de la version affichée si elle est émise, sinon la suivante de tout l'historique. */
export function nextIndexLetter(versions: MicroVersion[], pointer: number): string {
  const own = versions[pointer]?.index;
  if (own) return own;
  return indexLetter(Math.max(0, ...versions.map(v => indexNumber(v.index ?? ''))) + 1);
}

/** Échelle(s) de la feuille : celles de ses fenêtres, sans doublon (« 1:50 / 1:5 »). */
export function sheetScales(sheet: Sheet): string {
  const scales = [...new Set(sheet.viewports.map(v => formatScale(v.scale)))];
  return scales.length ? scales.join(' / ') : '—';
}

export interface TitleField { key: string; label: string; value: string }

/** Champs affichés au cartouche, dans l'ordre. Une valeur manquante s'affiche « — ». */
export function titleBlockFields(sheet: Sheet, versions: MicroVersion[], pointer: number): TitleField[] {
  const tb = sheet.titleBlock ?? DEFAULT_TITLE_BLOCK;
  const rev = revisionIndex(versions, pointer);
  const v = versions[pointer];
  const date = v ? new Date(v.time).toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—';
  const index = rev.letter ? `${rev.letter}${rev.pending ? ' (modifié depuis)' : ''}` : '— (aucun indice émis)';
  return [
    { key: 'project', label: 'Projet', value: tb.project || '—' },
    { key: 'title', label: 'Titre', value: tb.title || '—' },
    { key: 'scale', label: 'Échelle', value: sheetScales(sheet) },
    { key: 'date', label: 'Date', value: date },
    { key: 'index', label: 'Indice', value: index },
    { key: 'author', label: 'Auteur', value: tb.author || '—' },
    { key: 'projection', label: 'Projection', value: PROJECTION_LABEL[tb.projection] },
    { key: 'sheet', label: 'Feuille', value: `${sheet.id} · ${sheet.format}` },
  ];
}

/** Emplacement du cartouche : coin inférieur droit de la zone utile (ISO 5457). */
export function titleBlockRect(sheet: Sheet): Rect {
  const a = printableArea(sheet);
  const w = Math.min(TITLE_BLOCK_SIZE.w, a.w);
  return { x: a.x + a.w - w, y: a.y + a.h - TITLE_BLOCK_SIZE.h, w, h: TITLE_BLOCK_SIZE.h };
}
