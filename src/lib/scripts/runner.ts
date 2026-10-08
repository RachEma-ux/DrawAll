// Exécution d'un script dans son Worker (lot 18.2) : demandes traitées une à une, dans l'ordre ;
// délai maximal au-delà duquel le Worker est arrêté.
//
// Isolement réseau : le Worker est créé, depuis un Blob, dans un cadre isolé (sandbox, origine
// opaque) dont la politique de sécurité n'autorise aucune source réseau. Un Worker créé depuis un Blob
// hérite de cette politique : import() d'une adresse, fetch, WebSocket… sont bloqués avant toute
// requête. Le cadre ne fait que relayer les messages ; le retirer arrête le Worker.
import { FORBIDDEN_GLOBALS, type ScriptMessage, type ScriptReply, type ScriptRequest } from './protocol';
import { workerMain } from './worker-main';

const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:";
const HOST = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><script>
let w;
addEventListener('message', e => {
  if (e.source !== parent) return;
  const d = e.data;
  if (d && d.boot) {
    w = new Worker(URL.createObjectURL(new Blob([d.boot], { type: 'text/javascript' })));
    w.onmessage = m => parent.postMessage(m.data, '*');
    w.onerror = ev => { ev.preventDefault(); parent.postMessage({ op: 'error', message: ev.message || 'erreur du Worker de script' }, '*'); };
    w.postMessage({ code: d.code });
    return;
  }
  if (w) w.postMessage(d);
});
parent.postMessage({ ready: true }, '*');
</script>`;
const WORKER_SOURCE = `(${workerMain.toString()})(${JSON.stringify(FORBIDDEN_GLOBALS)});`;

export interface ScriptHandlers {
  onRequest: (req: Exclude<ScriptRequest, { op: 'log' }>) => Promise<unknown>;
  onLog: (text: string) => void;
}

export function runScript(code: string, h: ScriptHandlers, timeoutMs = 10_000): { done: Promise<{ ok: true } | { ok: false; error: string }>; stop: () => void } {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.display = 'none';
  frame.srcdoc = HOST;
  let finish!: (r: { ok: true } | { ok: false; error: string }) => void;
  const done = new Promise<{ ok: true } | { ok: false; error: string }>(r => { finish = r; });
  let settled = false;
  const end = (r: { ok: true } | { ok: false; error: string }) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    frame.remove(); // le Worker disparaît avec son cadre
    finish(r);
  };
  const timer = setTimeout(() => end({ ok: false, error: `délai de ${timeoutMs / 1000} s dépassé : script arrêté` }), timeoutMs);
  const post = (m: unknown) => frame.contentWindow?.postMessage(m, '*');
  let chain = Promise.resolve();
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return; // seul le cadre du script parle ici
    const m = e.data as ScriptMessage | { ready: true };
    if ('ready' in m) { post({ boot: WORKER_SOURCE, code }); return; }
    if (m.op === 'done') { chain.then(() => end({ ok: true })); return; }
    if (m.op === 'error') { chain.then(() => end({ ok: false, error: m.message })); return; }
    if (m.op === 'log') { h.onLog(m.text); return; }
    if (m.op !== 'execute' && m.op !== 'objects' && m.op !== 'context') return;
    // Une demande à la fois : chacune voit le projet laissé par la précédente.
    chain = chain.then(async () => {
      if (settled) return;
      let reply: ScriptReply;
      try { reply = { id: m.id, ok: true, result: await h.onRequest(m) }; } catch (err) { reply = { id: m.id, ok: false, error: err instanceof Error ? err.message : String(err) }; }
      if (!settled) post(reply);
    });
  };
  window.addEventListener('message', onMessage);
  document.body.appendChild(frame);
  return { done, stop: () => end({ ok: false, error: 'script arrêté' }) };
}
