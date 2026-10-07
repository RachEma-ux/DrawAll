export type SyncStatus = 'local' | 'dirty' | 'saving' | 'synced' | 'conflict' | 'error';

export const SYNC_META: Record<SyncStatus, { label: string; color: string }> = {
  local: { label: 'Brouillon local', color: '#8b93a7' },
  dirty: { label: 'Modifications locales', color: '#fbbf24' },
  saving: { label: 'Synchronisation…', color: '#22d3ee' },
  synced: { label: 'Synchronisé', color: '#34d399' },
  conflict: { label: 'Conflit de révision', color: '#fb7185' },
  error: { label: 'Erreur cloud', color: '#fb7185' },
};
