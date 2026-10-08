// Protocole entre la console de scripts et son Worker (lot 18.2). Le script n'a que l'API : il
// demande des commandes et des lectures ; le fil principal les exécute par l'API de commandes.
export type ScriptRequest =
  | { id: number; op: 'execute'; type: string; args: unknown[] }
  | { id: number; op: 'objects' }
  | { id: number; op: 'context' }
  | { id: number; op: 'log'; text: string };

export type ScriptMessage =
  | ScriptRequest
  | { op: 'done' }
  | { op: 'error'; message: string };

export type ScriptReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

/** Globaux retirés au script : pas d'accès au stockage, au réseau ni au chargement de code. */
export const FORBIDDEN_GLOBALS = [
  'indexedDB', 'caches', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'BroadcastChannel', 'importScripts', 'navigator', 'Worker', 'SharedWorker', 'postMessage', 'close', 'onmessage',
] as const;
