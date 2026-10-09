// Publications (lot 14.4) : publier la version courante (version nommée + PDF des feuilles, figés),
// consulter les dossiers publiés et leur état (« publié », « modifié depuis »). Pendant que les vues
// sont calculées avant de figer les PDF, l'atelier est gelé : le dossier porte sur l'état préparé.
import { useRef, useState } from 'react';
import ExclusiveRun from '@/components/ExclusiveRun';
import type { ProjectState } from '@/types/cad';
import { pdfBytes } from '@/lib/pdf';
import { publicationStatus, type Publication } from '@/lib/publication';

interface Props {
  state: ProjectState;
  publications: Publication[];
  /** Peut attendre (vues projetées calculées avant de figer les PDF). */
  onPublish: (name: string) => string | null | Promise<string | null>;
  onClose: () => void;
}

/** Télécharge le PDF figé d'une feuille publiée. */
function download(p: Publication, sheet: Publication['sheets'][number]) {
  const url = URL.createObjectURL(new Blob([pdfBytes(sheet.pdf)], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name.replace(/[^\p{L}\p{N}_-]+/gu, '-')}-${sheet.id}.pdf`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PublicationsPanel({ state, publications, onPublish, onClose }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const submit = async () => {
    setBusy(true);
    try {
      const err = await onPublish(name);
      setError(err);
      if (!err) setName('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const color = { 'publié': 'text-emerald-300', 'modifié depuis': 'text-amber-300', 'autre variante': 'text-muted-foreground' } as const;
  return (
    <>
    <ExclusiveRun active={busy} within={panelRef} />
    <div ref={panelRef} role="dialog" aria-label="Publications" className="fixed inset-x-3 top-16 z-[70] mx-auto flex max-h-[75vh] max-w-lg flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Publications</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer les publications" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); if (!busy) void submit(); }} data-busy={busy || undefined}>
        <input aria-label="Nom du dossier à publier" placeholder="Nom du dossier (ex. Permis de construire)" value={name} onChange={e => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 py-1 text-foreground" />
        <button type="submit" disabled={busy} aria-label="Publier la version courante" className="rounded-sm disabled:opacity-40 border border-cyan-400/60 bg-cyan-400/10 px-2 py-1 text-cyan-200">Publier</button>
      </form>
      <p className="text-[11px]">Publier fige la version courante (nommée) et le PDF de chaque feuille : le dossier ne change plus, même si le projet évolue.</p>
      {error && <p role="alert" data-testid="publication-erreur" className="text-red-300">{error}</p>}
      {[...publications].reverse().map(p => {
        const status = publicationStatus(state, p);
        return (
          <section key={p.id} data-publication={p.id} className="rounded-sm border border-border p-2">
            <div className="flex items-baseline gap-2">
              <span className="flex-1 truncate text-foreground">{p.name}</span>
              <span data-etat-publication className={color[status]}>{status}</span>
            </div>
            <p className="text-[11px]">{p.id} · v{p.seq} de « {p.branchName} » · {new Date(p.time).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.sheets.map(sh => (
                <button key={sh.id} type="button" onClick={() => download(p, sh)} aria-label={`PDF publié de ${sh.name}`}
                  className="rounded-sm border border-border px-1.5 py-0.5 text-foreground hover:bg-white/5">{sh.name}.pdf</button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
    </>
  );
}
