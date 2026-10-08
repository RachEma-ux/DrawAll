// Exécution d'un script dans son Worker (lot 18.2) : demandes traitées une à une, dans l'ordre ;
// délai maximal au-delà duquel le Worker est arrêté.
import type { ScriptMessage, ScriptReply, ScriptRequest } from './protocol';

export interface ScriptHandlers {
  onRequest: (req: Exclude<ScriptRequest, { op: 'log' }>) => Promise<unknown>;
  onLog: (text: string) => void;
}

export function runScript(code: string, h: ScriptHandlers, timeoutMs = 10_000): { done: Promise<{ ok: true } | { ok: false; error: string }>; stop: () => void } {
  const worker = new Worker(new URL('./script.worker.ts', import.meta.url), { type: 'module' });
  let finish!: (r: { ok: true } | { ok: false; error: string }) => void;
  const done = new Promise<{ ok: true } | { ok: false; error: string }>(r => { finish = r; });
  let settled = false;
  const end = (r: { ok: true } | { ok: false; error: string }) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate(); finish(r); };
  const timer = setTimeout(() => end({ ok: false, error: `délai de ${timeoutMs / 1000} s dépassé : script arrêté` }), timeoutMs);
  let chain = Promise.resolve();
  worker.onmessage = (e: MessageEvent<ScriptMessage>) => {
    const m = e.data;
    if (m.op === 'done') { chain.then(() => end({ ok: true })); return; }
    if (m.op === 'error') { chain.then(() => end({ ok: false, error: m.message })); return; }
    if (m.op === 'log') { h.onLog(m.text); return; }
    if (m.op !== 'execute' && m.op !== 'objects' && m.op !== 'context') return;
    // Une demande à la fois : chacune voit le projet laissé par la précédente.
    chain = chain.then(async () => {
      if (settled) return;
      let reply: ScriptReply;
      try { reply = { id: m.id, ok: true, result: await h.onRequest(m) }; } catch (err) { reply = { id: m.id, ok: false, error: err instanceof Error ? err.message : String(err) }; }
      if (!settled) worker.postMessage(reply);
    });
  };
  worker.onerror = e => { e.preventDefault?.(); end({ ok: false, error: e.message || 'erreur du Worker de script' }); };
  worker.postMessage({ code });
  return { done, stop: () => end({ ok: false, error: 'script arrêté' }) };
}
