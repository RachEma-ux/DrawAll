// Journal des commandes (lot 18.1) : commandes exécutées depuis l'état de base, refus en clair,
// et rejeu de vérification (le projet doit être reproduit à l'identique).
import type { Journal } from '@/lib/commands';

interface Props {
  journal: Journal | undefined;
  replay: { running: boolean; done: number; total: number; identical?: boolean } | null;
  onReplay: () => string | null;
  onClose: () => void;
}

export default function JournalPanel({ journal, replay, onReplay, onClose }: Props) {
  const entries = journal?.entries ?? [];
  const refused = entries.filter(e => e.refused).length;
  return (
    <div role="dialog" aria-label="Journal des commandes" data-commandes={entries.length} className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[75vh] max-w-lg flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Journal des commandes</h2>
        <button type="button" onClick={onClose} aria-label="Fermer le journal" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      <p className="text-[11px]">{entries.length} commande{entries.length > 1 ? 's' : ''} depuis l’ouverture du projet{refused ? `, dont ${refused} refusée${refused > 1 ? 's' : ''}` : ''}.</p>
      <ol className="flex max-h-60 flex-col gap-0.5 overflow-y-auto text-[11px]">
        {entries.slice(-50).map(e => (
          <li key={e.n} className={e.refused ? 'text-red-300' : ''}>{e.n}. {e.type}{e.refused ? ` — refusée : ${e.refused}` : ''}</li>
        ))}
      </ol>
      <button type="button" disabled={!entries.length || replay?.running} className="self-start rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40" onClick={onReplay}>Rejouer le journal (vérification)</button>
      {replay && (
        <p role="status" data-testid="rejeu" data-identique={replay.identical === undefined ? undefined : String(replay.identical)}
          className={replay.identical === false ? 'text-red-300' : replay.identical ? 'text-emerald-300' : ''}>
          {replay.running ? `Rejeu : ${replay.done} / ${replay.total}…` : replay.identical ? `Journal rejoué (${replay.total} commandes) : projet reproduit à l’identique.` : `Journal rejoué (${replay.total} commandes) : le projet obtenu diffère.`}
        </p>
      )}
    </div>
  );
}
