// Hors ligne (lot 7.2) : copie durable du projet dans IndexedDB (plus de place que le stockage local
// du navigateur), reprise au démarrage, estimation du quota. Le stockage local reste la copie lue
// en premier ; IndexedDB la remplace seulement quand le dernier enregistrement n'a pas pu l'atteindre
// (stockage local plein) ou qu'elle a disparu.

const DB_NAME = 'drawall';
const STORE = 'projet';
const KEY = 'courant';

/** Enregistrement : état du projet (JSON), date, et si la même version a atteint le stockage local. */
export interface SavedProject { savedAt: number; json: string; localOk: boolean }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB illisible'));
  });
}

/** Écrit l'état ; la promesse échoue si IndexedDB est indisponible ou plein. */
export async function saveProject(saved: SavedProject): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(saved, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('écriture refusée'));
      tx.onabort = () => reject(tx.error ?? new Error('écriture interrompue'));
    });
  } finally { db.close(); }
}

/** Dernier état enregistré, ou null. */
export async function loadProject(): Promise<SavedProject | null> {
  const db = await openDb();
  try {
    return await new Promise<SavedProject | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const v = req.result as Partial<SavedProject> | undefined;
        resolve(v && typeof v.json === 'string' && typeof v.savedAt === 'number' ? { savedAt: v.savedAt, json: v.json, localOk: v.localOk !== false } : null);
      };
      req.onerror = () => reject(req.error ?? new Error('lecture refusée'));
    });
  } finally { db.close(); }
}

/**
 * Reprise : la copie IndexedDB remplace l'état lu dans le stockage local quand celui-ci n'a pas de
 * projet, ou quand son dernier enregistrement n'a pas atteint le stockage local **et** qu'elle est
 * plus récente que le dernier enregistrement réussi du stockage local (`localSavedAt`) : une copie
 * IndexedDB ancienne ne fait jamais revenir en arrière.
 */
export function shouldResume(saved: SavedProject | null, localHasProject: boolean, localSavedAt = 0): boolean {
  if (!saved) return false;
  if (!localHasProject) return true;
  return !saved.localOk && saved.savedAt > localSavedAt;
}

/** Part du quota de stockage du navigateur au-delà de laquelle l'atelier avertit. */
export const QUOTA_WARNING = 0.9;

/** Occupation du stockage du navigateur (octets), si le navigateur la donne. */
export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { usage: e.usage ?? 0, quota: e.quota } : null;
  } catch { return null; }
}

/** Avertissement de quota : null tant que l'occupation reste sous le seuil. */
export function quotaWarning(u: { usage: number; quota: number } | null): string | null {
  if (!u || u.quota <= 0 || u.usage / u.quota < QUOTA_WARNING) return null;
  return `Stockage de l’appareil presque plein (${Math.round((u.usage / u.quota) * 100)} %)`;
}
