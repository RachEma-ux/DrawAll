// Assistant à boucle contrôlée (lot 18.3) : demande → séquence d'opérations proposée par le
// générateur → validation à blanc par les moteurs (trois corrections au plus) → aperçu → exécution
// après accord explicite, par l'API de commandes, annulée en entier si une commande échoue. Chaque
// décision (exécutée, rejetée, échec) est inscrite au journal des hypothèses.
import { useMemo, useRef, useState } from 'react';
import { ObjectShape } from '@/components/CanvasView';
import ExclusiveRun from '@/components/ExclusiveRun';
import { useCommandRunner, type Project } from '@/hooks/useCommandRunner';
import { controlledLoop, previewDiff, provisionalId, remapIds, type Generator, type LoopResult, type Proposal } from '@/lib/assistant/loop';
import { localGenerator } from '@/lib/assistant/local-generator';
import { versionDigest } from '@/lib/commands';
import { objectBounds, unionBounds } from '@/lib/geometry';
import type { CadObject } from '@/types/cad';

const DECISION_LABEL = { executee: 'exécutée', rejetee: 'rejetée', echec: 'échec, projet rétabli' } as const;

/**
 * Aperçu du résultat simulé complet, sur le niveau actif : objets inchangés en gris, objets créés et
 * modifiés en surbrillance (modifiés encadrés en orange), objets supprimés pâlis et encadrés en rouge.
 */
function Preview({ project, after }: { project: Project; after: CadObject[] }) {
  const level = project.activeLevelId ?? 'NIV-0001';
  const diff = useMemo(() => previewDiff(project.allObjects, after, level), [project.allObjects, after, level]);
  const all = [...diff.same, ...diff.added, ...diff.modified, ...diff.removed];
  const boundsOf = (o: CadObject) => objectBounds(o, project.blocks, all);
  const b = unionBounds(all.map(boundsOf).filter((x): x is NonNullable<typeof x> => !!x));
  if (!b) return null;
  const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1000) * 0.08;
  const vb = { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + 2 * pad, h: b.maxY - b.minY + 2 * pad };
  const zoom = 300 / Math.max(vb.w, vb.h);
  const shape = (o: CadObject, selected: boolean) => <ObjectShape key={o.id} obj={o} objects={all} blocks={project.blocks} view="batiment" selected={selected} zoom={zoom} unit="mm" layer={project.layers.find(l => l.id === o.layerId)} colorMode="calque" />;
  const frame = (o: CadObject, color: string) => {
    const r = boundsOf(o), m = 6 / zoom;
    return r && <rect key={`cadre-${o.id}`} x={r.minX - m} y={r.minY - m} width={r.maxX - r.minX + 2 * m} height={r.maxY - r.minY + 2 * m} fill="none" stroke={color} strokeWidth={1.5 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />;
  };
  return (
    <svg data-testid="apercu-assistant" data-proposes={diff.added.length} data-modifie={diff.modified.length} data-supprime={diff.removed.length}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="h-48 w-full rounded-sm border border-border bg-[#0e1526]">
      <g opacity={0.45}>{diff.same.map(o => shape(o, false))}</g>
      <g opacity={0.25}>{diff.removed.map(o => shape(o, false))}</g>
      {diff.removed.map(o => frame(o, '#f87171'))}
      {diff.modified.map(o => frame(o, '#fbbf24'))}
      {[...diff.added, ...diff.modified].map(o => shape(o, true))}
    </svg>
  );
}

export default function AssistantPanel({ project, onClose, generator = localGenerator }: { project: Project; onClose: () => void; generator?: Generator }) {
  const [request, setRequest] = useState('');
  const [result, setResult] = useState<(LoopResult & { request: string }) | null>(null);
  const [busy, setBusy] = useState<'proposer' | 'executer' | null>(null);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const cache = useRef(new Map<string, Proposal>());
  const panelRef = useRef<HTMLDivElement>(null);
  const { projectRef, exec } = useCommandRunner(project);
  /** Contenu du projet sur lequel la proposition affichée a été validée et aperçue. */
  const basisRef = useRef<string | null>(null);
  const digest = () => { const st = projectRef.current.state; return versionDigest(st.versions[st.pointer]); };

  const propose = async () => {
    const p = projectRef.current;
    setBusy('proposer');
    setOutcome(null);
    basisRef.current = digest();
    const r = await controlledLoop(generator, request, { objects: p.allObjects, layers: p.layers, activeLayerId: p.activeLayerId, activeLevelId: p.activeLevelId, levels: p.levels, blocks: p.blocks, zones: p.zones }, cache.current);
    setResult({ ...r, request });
    setBusy(null);
  };

  const log = (decision: 'executee' | 'rejetee' | 'echec', r: Extract<LoopResult, { status: 'ready' }>, req: string, error?: string) =>
    projectRef.current.logAssistant({ time: new Date().toISOString(), request: req, generator: r.fromCache ? `${generator.name} (cache)` : generator.name, hypotheses: r.proposal.hypotheses, steps: r.proposal.steps.length, corrections: r.corrections, decision, ...(error ? { error } : {}) });

  const accept = async () => {
    if (result?.status !== 'ready') return;
    // Le projet a changé depuis l'aperçu : la proposition validée ne vaut plus, rien n'est exécuté.
    if (digest() !== basisRef.current) {
      setOutcome({ ok: false, text: 'Le projet a changé depuis l’aperçu : rien n’a été exécuté. Proposez à nouveau.' });
      setResult(null);
      return;
    }
    const before = projectRef.current.state;
    setBusy('executer');
    try {
      // Identifiants provisoires (PROP-…) de la validation à blanc → identifiants réels des objets créés.
      const real = new Map<string, string>();
      let created = 0;
      for (const s of result.proposal.steps) {
        const out = await exec(s.type, remapIds(s.args, real) as unknown[]);
        if (s.type === 'addObject' && typeof out === 'string') real.set(provisionalId(++created), out);
      }
      log('executee', result, result.request);
      setOutcome({ ok: true, text: `${result.proposal.steps.length} opération${result.proposal.steps.length > 1 ? 's' : ''} exécutée${result.proposal.steps.length > 1 ? 's' : ''}.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      projectRef.current.restore(before);
      log('echec', result, result.request, msg);
      setOutcome({ ok: false, text: `Échec : ${msg}. Projet rétabli dans son état d’avant.` });
    }
    setResult(null);
    setBusy(null);
  };

  const reject = () => {
    if (result?.status !== 'ready') return;
    log('rejetee', result, result.request);
    setResult(null);
    setOutcome({ ok: true, text: 'Proposition rejetée : rien n’a été exécuté.' });
  };

  return (
    <>
    <ExclusiveRun active={busy === 'executer'} within={panelRef} />
    <div ref={panelRef} role="dialog" aria-label="Assistant" className="fixed inset-x-3 top-16 z-[70] mx-auto flex max-h-[80vh] max-w-xl flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Assistant</h2>
        {/* Fermer pendant l'exécution laisserait une séquence à moitié appliquée, sans journal ni retour arrière. */}
        <button type="button" onClick={onClose} disabled={busy === 'executer'} aria-label="Fermer l’assistant" className="rounded-sm px-2 py-0.5 hover:text-foreground disabled:opacity-40">×</button>
      </div>
      <p className="text-[11px]">
        {generator.name} : aucun envoi externe. La séquence proposée est validée par les moteurs (trois corrections au plus), aperçue, puis exécutée seulement après votre accord.
      </p>
      <textarea aria-label="Demande" value={request} onChange={e => setRequest(e.target.value)} rows={2} placeholder="ex. grille de 3 x 4 poteaux 300 x 300 mm entraxe 5 m"
        className="w-full resize-y rounded-sm border border-border bg-black/30 p-2 text-[12px] text-foreground" />
      <button type="button" disabled={!request.trim() || !!busy} onClick={() => void propose()} className="self-start rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40">Proposer</button>

      {result && (
        <section aria-label="Proposition" data-statut={result.status} className="flex flex-col gap-2 border-t border-border pt-2">
          {result.status === 'questions' && (
            <>
              <p className="text-amber-300">Précisions nécessaires (aucune valeur n’est inventée) :</p>
              <ul className="list-disc pl-4">{result.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </>
          )}
          {result.status === 'failed' && (
            <>
              <p className="text-red-300">Aucune séquence valide après {Math.max(result.attempts.length - 1, 0)} correction{result.attempts.length > 2 ? 's' : ''} : rien n’est proposé.</p>
              <ul className="list-disc pl-4 text-red-300">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </>
          )}
          {result.status === 'ready' && (
            <>
              <p data-testid="corrections" data-corrections={result.corrections}>
                {result.proposal.steps.length} opération{result.proposal.steps.length > 1 ? 's' : ''} validée{result.proposal.steps.length > 1 ? 's' : ''} par les moteurs
                {result.fromCache ? ' (cache des opérations validées)' : result.corrections ? ` après ${result.corrections} correction${result.corrections > 1 ? 's' : ''}` : ' du premier coup'}.
              </p>
              <h3 className="text-foreground">Hypothèses</h3>
              <ul aria-label="Hypothèses" className="list-disc pl-4">{result.proposal.hypotheses.map((h, i) => <li key={i}>{h}</li>)}</ul>
              <Preview project={project} after={result.preview.objects} />
              <details>
                <summary className="cursor-pointer">Opérations</summary>
                <ol className="list-decimal pl-5">{result.proposal.steps.map((s, i) => <li key={i}>{s.type}{s.why ? ` — ${s.why}` : ''}</li>)}</ol>
              </details>
              <div className="flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => void accept()} className="rounded-sm border border-emerald-500/60 px-2 py-1 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40">Accepter et exécuter</button>
                <button type="button" disabled={!!busy} onClick={reject} className="rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40">Rejeter</button>
              </div>
            </>
          )}
        </section>
      )}
      {outcome && <p role="status" className={outcome.ok ? 'text-emerald-300' : 'text-red-300'}>{outcome.text}</p>}

      <details open={project.assistantLog.length > 0}>
        <summary className="cursor-pointer text-foreground">Journal des hypothèses ({project.assistantLog.length})</summary>
        <ol aria-label="Journal des hypothèses" className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[11px]">
          {[...project.assistantLog].reverse().map(e => (
            <li key={e.n} data-decision={e.decision}>
              {e.n}. « {e.request} » — {DECISION_LABEL[e.decision]} ({e.steps} opération{e.steps > 1 ? 's' : ''}, {e.corrections} correction{e.corrections > 1 ? 's' : ''}, {e.generator}){e.error ? ` : ${e.error}` : ''}
              {e.hypotheses.length > 0 && <ul className="list-disc pl-4">{e.hypotheses.map((h, i) => <li key={i}>{h}</li>)}</ul>}
            </li>
          ))}
        </ol>
      </details>
    </div>
    </>
  );
}
