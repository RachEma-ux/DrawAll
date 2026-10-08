// Worker des scripts (lot 18.2) : le code reçu est exécuté sans accès au stockage ni au réseau ;
// il ne dispose que de l'objet `drawall` (commandes, lecture des objets, journal de la console).
import { FORBIDDEN_GLOBALS, type ScriptMessage, type ScriptReply } from './protocol';

const send = self.postMessage.bind(self) as (m: ScriptMessage) => void;
const pending = new Map<number, (r: ScriptReply) => void>();
let next = 1;

self.addEventListener('message', async (e: MessageEvent<{ code: string } | ScriptReply>) => {
  const data = e.data;
  if ('id' in data) { pending.get(data.id)?.(data); pending.delete(data.id); return; }
  // Une fois le script lancé, plus aucun message n'est accepté que les réponses de l'API.
  const ask = (req: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
    const id = next++;
    pending.set(id, r => (r.ok ? resolve(r.result) : reject(new Error(r.error))));
    send({ id, ...req } as ScriptMessage);
  });
  const drawall = Object.freeze({
    /** Exécute une commande de l'API (lot 18.1) ; une commande refusée lève une erreur. */
    execute: (type: string, ...args: unknown[]) => ask({ op: 'execute', type, args }),
    /** Copie des objets du projet. */
    objects: () => ask({ op: 'objects' }) as Promise<unknown[]>,
    /** Calque et niveau actifs, calques et niveaux du projet. */
    context: () => ask({ op: 'context' }),
    log: (...parts: unknown[]) => { send({ id: 0, op: 'log', text: parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ') }); },
  });
  // Retrait des accès au stockage, au réseau, au chargement de code et à la messagerie brute.
  // Retrait sur l'objet global et sur toute sa chaîne de prototypes (sinon l'accesseur du
  // prototype resterait atteignable).
  for (let o: object | null = self; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const name of FORBIDDEN_GLOBALS) {
      if (!Object.prototype.hasOwnProperty.call(o, name) && o !== self) continue;
      try { Object.defineProperty(o, name, { value: undefined, configurable: false, writable: false }); } catch { /* non configurable */ }
    }
  }
  try {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...a: string[]) => (api: unknown) => Promise<unknown>;
    await new AsyncFunction('drawall', '"use strict";\n' + (data as { code: string }).code)(drawall);
    send({ op: 'done' });
  } catch (err) {
    send({ op: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
