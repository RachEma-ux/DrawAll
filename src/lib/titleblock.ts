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

/**
 * Indice de la version affichée : une lettre par version nommée jusqu'à elle (A pour la première).
 * Une version qui n'est pas nommée reste à l'indice de la dernière version nommée, marqué « en cours ».
 */
export function revisionIndex(versions: MicroVersion[], pointer: number): { letter: string | null; named: string | null; pending: boolean } {
  let count = 0;
  let lastNamed: string | null = null;
  for (let i = 0; i <= pointer && i < versions.length; i++) {
    if (versions[i].named) { count++; lastNamed = versions[i].named!; }
  }
  const pending = !versions[pointer]?.named;
  return { letter: count > 0 ? indexLetter(count) : null, named: lastNamed, pending };
}

/** Lettre du prochain indice à émettre. */
export function nextIndexLetter(versions: MicroVersion[], pointer: number): string {
  const { letter, pending } = revisionIndex(versions, pointer);
  const count = letter ? versions.slice(0, pointer + 1).filter(v => v.named).length : 0;
  return pending || !letter ? indexLetter(count + 1) : letter;
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
  const index = rev.letter ? `${rev.letter}${rev.pending ? ' (modifié depuis)' : ''}` : '— (aucune version nommée)';
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
