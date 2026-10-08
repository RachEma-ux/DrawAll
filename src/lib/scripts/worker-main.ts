// Corps du Worker des scripts (lot 18.2). Fonction autonome (aucune référence extérieure) : sa
// source est envoyée telle quelle au Worker, créé dans un cadre isolé dont la politique de sécurité
// interdit tout chargement réseau (voir runner.ts). Le script n'a que l'objet `drawall`.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function workerMain(forbidden: readonly string[]) {
  const g: any = self;
  const send = g.postMessage.bind(g) as (m: unknown) => void;
  const pending = new Map<number, (r: any) => void>();
  let next = 1;
  g.addEventListener('message', async (e: MessageEvent) => {
    const data = e.data;
    if (data && typeof data === 'object' && 'id' in data) { pending.get(data.id)?.(data); pending.delete(data.id); return; }
    const ask = (req: Record<string, unknown>) => new Promise<unknown>((resolve, reject) => {
      const id = next++;
      pending.set(id, r => (r.ok ? resolve(r.result) : reject(new Error(r.error))));
      send({ id, ...req });
    });
    const drawall = Object.freeze({
      /** Exécute une commande de l'API (lot 18.1) ; une commande refusée lève une erreur. */
      execute: (type: string, ...args: unknown[]) => ask({ op: 'execute', type, args }),
      /** Copie des objets du projet. */
      objects: () => ask({ op: 'objects' }),
      /** Calque et niveau actifs, calques et niveaux du projet. */
      context: () => ask({ op: 'context' }),
      log: (...parts: unknown[]) => { send({ id: 0, op: 'log', text: parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ') }); },
    });
    // Retrait des accès au stockage, au réseau, au chargement de code et à la messagerie brute, sur
    // l'objet global et sur toute sa chaîne de prototypes (défense en profondeur : la politique de
    // sécurité du cadre bloque déjà tout chargement réseau, import() compris).
    for (let o: any = g; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const name of forbidden) {
        if (!Object.prototype.hasOwnProperty.call(o, name) && o !== g) continue;
        try { Object.defineProperty(o, name, { value: undefined, configurable: false, writable: false }); } catch { /* non configurable */ }
      }
    }
    try {
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
      await new AsyncFunction('drawall', '"use strict";\n' + data.code)(drawall);
      send({ op: 'done' });
    } catch (err) {
      send({ op: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  });
}
