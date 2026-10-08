// Publication (lot 14.4) : dossier figé = version nommée + PDF de chaque feuille, produits au moment
// de la publication et conservés tels quels. Le dossier ne change pas quand le projet évolue ; son
// état dit si la version courante est celle publiée ou si le projet a été modifié depuis.
import type { MicroVersion, ProjectState } from '@/types/cad';
import { activeBranch } from './branches';
import { diffVersion } from './history';
import { profileById } from './materials';
import { sheetToPdf } from './pdf';

export interface Publication {
  id: string;
  name: string;
  /** Branche et microversion publiées. */
  branchId: string;
  branchName: string;
  seq: number;
  /** Date de publication (ms). */
  time: number;
  /** PDF de chaque feuille, figés. */
  sheets: { id: string; name: string; pdf: string }[];
}

export type PublicationStatus = 'publié' | 'modifié depuis' | 'autre variante';

/** Dossier de la version courante : un PDF par feuille, à la date donnée. */
export function buildPublication(s: ProjectState, id: string, name: string, date: Date): Publication | { error: string } {
  const n = name.trim();
  if (!n) return { error: 'Nom de publication attendu.' };
  const v = s.versions[s.pointer];
  const sheets = v.sheets ?? [];
  if (!sheets.length) return { error: 'Aucune feuille à publier : créez d’abord une feuille.' };
  const b = activeBranch(s);
  return {
    id, name: n, branchId: b.id, branchName: b.name, seq: v.seq, time: date.getTime(),
    sheets: sheets.map(sheet => ({
      id: sheet.id, name: sheet.name,
      pdf: sheetToPdf({ sheet, objects: v.objects, levels: v.levels, layers: v.layers, blocks: v.blocks, versions: s.versions, pointer: s.pointer, profile: profileById(v.profileId), date }),
    })),
  };
}

const unchanged = (a: MicroVersion, b: MicroVersion) => {
  const d = diffVersion(a, b);
  return !d.objects && !d.put && !d.drop;
};

/** État d'une publication par rapport à la version courante du projet. */
export function publicationStatus(s: ProjectState, p: Publication): PublicationStatus {
  if (activeBranch(s).id !== p.branchId) return 'autre variante';
  const cur = s.versions[s.pointer];
  if (cur.seq === p.seq) return 'publié';
  const published = s.versions.find(v => v.seq === p.seq);
  return published && unchanged(published, cur) ? 'publié' : 'modifié depuis';
}

/** Publications relues : champs attendus et PDF textuels seulement. */
export function normalizePublications(raw: unknown): Publication[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ok = raw.filter((p): p is Publication => !!p && typeof p === 'object'
    && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.branchId === 'string' && typeof p.branchName === 'string'
    && Number.isFinite(p.seq) && Number.isFinite(p.time) && Array.isArray(p.sheets)
    && p.sheets.every((sh: unknown) => !!sh && typeof (sh as { id?: unknown }).id === 'string' && typeof (sh as { name?: unknown }).name === 'string' && typeof (sh as { pdf?: unknown }).pdf === 'string' && (sh as { pdf: string }).pdf.startsWith('%PDF-')));
  return ok.length ? ok : undefined;
}
