export type SyncStatus = 'local' | 'dirty' | 'saving' | 'synced' | 'conflict' | 'error';

export const SYNC_META: Record<SyncStatus, { label: string; color: string }> = {
  local: { label: 'Brouillon local', color: '#8b93a7' },
  dirty: { label: 'Modifications locales', color: '#fbbf24' },
  saving: { label: 'Synchronisation…', color: '#22d3ee' },
  synced: { label: 'Synchronisé', color: '#34d399' },
  conflict: { label: 'Conflit de révision', color: '#fb7185' },
  error: { label: 'Erreur cloud', color: '#fb7185' },
};

/** Droit sur un projet cloud partagé (lot 8.4). */
export type CloudRole = 'proprietaire' | 'ecriture' | 'lecture';

export const ROLE_LABEL: Record<CloudRole, string> = {
  proprietaire: 'Propriétaire',
  ecriture: 'Écriture',
  lecture: 'Lecture',
};

/** Paramètre d'adresse d'une invitation : `?partage=JETON`. */
export const SHARE_PARAM = 'partage';
export const PENDING_SHARE_KEY = 'drawall-partage-en-attente';

export function shareUrl(token: string, origin = window.location.origin): string {
  return `${origin}/?${SHARE_PARAM}=${encodeURIComponent(token)}`;
}
