// Console de scripts (lot 18.2) : le script s'exécute dans un Worker, sans accès au stockage, et
// n'agit sur le projet que par l'API de commandes (lot 18.1), une commande à la fois. Un script qui
// échoue (exception, commande refusée, délai dépassé, arrêt) est annulé en entier : le projet,
// journal compris, revient à son état d'avant le script.
import { useEffect, useRef, useState } from 'react';
import { useCommandRunner, type Project } from '@/hooks/useCommandRunner';
import { runScript } from '@/lib/scripts/runner';
import type { ScriptRequest } from '@/lib/scripts/protocol';

const EXAMPLE = `// Grille de 3 × 4 poteaux de 300 × 300 mm, entraxe 5 m
const { activeLayerId } = await drawall.context();
for (let i = 0; i < 3; i++)
  for (let j = 0; j < 4; j++)
    await drawall.execute('addObject', { kind: 'column', classification: 'structure', layerId: activeLayerId,
      hatch: 'none', x: j * 5000, y: i * 5000, section: 'rect', b: 300, h: 300 });
drawall.log((await drawall.objects()).length, 'objets');`;

/** Copie transmissible au Worker (les valeurs non clonables sont omises). */
const transferable = (v: unknown) => { try { return structuredClone(v); } catch { return undefined; } };

export default function ScriptConsole({ project, onClose }: { project: Project; onClose: () => void }) {
  const [code, setCode] = useState(EXAMPLE);
  const [timeoutS, setTimeoutS] = useState('10');
  const [log, setLog] = useState<{ text: string; tone?: 'ok' | 'error' }[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'reussi' | 'annule' | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const { projectRef, exec } = useCommandRunner(project);
  useEffect(() => () => stopRef.current?.(), []);

  const onRequest = async (req: Exclude<ScriptRequest, { op: 'log' }>) => {
    const p = projectRef.current;
    if (req.op === 'objects') return transferable(p.allObjects);
    if (req.op === 'context') return transferable({ activeLayerId: p.activeLayerId, activeLevelId: p.activeLevelId, layers: p.layers.map(l => ({ id: l.id, name: l.name, locked: l.locked })), levels: p.levels });
    return transferable(await exec(req.type, req.args));
  };

  const run = () => {
    const seconds = Number(timeoutS.replace(',', '.'));
    if (!(seconds >= 1 && seconds <= 120)) { setLog([{ text: 'Délai : entre 1 et 120 s.', tone: 'error' }]); return; }
    const before = projectRef.current.state;
    setLog([]);
    setResult(null);
    setRunning(true);
    const handle = runScript(code, { onRequest, onLog: text => setLog(l => [...l, { text }]) }, seconds * 1000);
    stopRef.current = handle.stop;
    void handle.done.then(r => {
      stopRef.current = null;
      setRunning(false);
      if (r.ok) { setResult('reussi'); setLog(l => [...l, { text: 'Script terminé.', tone: 'ok' }]); return; }
      projectRef.current.restore(before);
      setResult('annule');
      setLog(l => [...l, { text: `Échec : ${r.error}. Projet rétabli dans son état d’avant le script.`, tone: 'error' }]);
    });
  };

  return (
    <div role="dialog" aria-label="Console de scripts" className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[80vh] max-w-xl flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Console de scripts</h2>
        <button type="button" onClick={onClose} aria-label="Fermer la console" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      <p className="text-[11px]">
        JavaScript exécuté à part, sans accès au stockage : <code>drawall.execute(commande, …arguments)</code>, <code>drawall.objects()</code>,{' '}
        <code>drawall.context()</code>, <code>drawall.log(…)</code>. Un script qui échoue est annulé en entier.
      </p>
      <textarea aria-label="Code du script" value={code} onChange={e => setCode(e.target.value)} spellCheck={false} rows={10}
        className="min-h-40 w-full resize-y rounded-sm border border-border bg-black/30 p-2 text-[12px] text-foreground" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={running || !code.trim()} onClick={run} className="rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40">Exécuter</button>
        <button type="button" disabled={!running} onClick={() => stopRef.current?.()} className="rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40">Arrêter</button>
        <label className="flex items-center gap-1">Délai (s)
          <input aria-label="Délai (s)" value={timeoutS} onChange={e => setTimeoutS(e.target.value)} inputMode="decimal" className="w-14 rounded-sm border border-border bg-black/30 px-1 py-0.5 text-foreground" />
        </label>
      </div>
      <ol role="log" aria-label="Sortie du script" data-script={running ? 'en-cours' : result ?? undefined} className="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-[11px]">
        {log.map((l, i) => (
          <li key={i} className={l.tone === 'error' ? 'text-red-300' : l.tone === 'ok' ? 'text-emerald-300' : ''}>{l.text}</li>
        ))}
      </ol>
    </div>
  );
}
