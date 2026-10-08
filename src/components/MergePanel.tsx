// Comparaison et fusion de variantes (lot 14.2) : changements de l'autre variante depuis l'ancêtre
// commun, en liste et en surimpression ; conflits listés, chacun tranché avant la fusion.
import { useMemo, useState } from 'react';
import type { ProjectState } from '@/types/cad';
import type { BranchInfo } from '@/lib/branches';
import { conflictKey, diffById, merge3, mergeInputs, versionDiff, type Change, type Choice } from '@/lib/merge';

interface Props {
  state: ProjectState;
  branches: BranchInfo[];
  /** Surimpression : changements de l'autre variante sur le dessin (null pour l'effacer). */
  onOverlay: (changes: { changes: Change[]; otherId: string } | null) => void;
  onMerge: (otherId: string, choices: Record<string, Choice>) => string | null;
  onClose: () => void;
}

const WHERE: Record<string, string> = {
  objects: 'Objet', layers: 'Calque', blocks: 'Bloc', sheets: 'Feuille', levels: 'Niveau', constraints: 'Contrainte', parameters: 'Paramètre', zones: 'Zone',
  profileId: 'Profil de dessin', surfaceRule: 'Règle de surface',
};

export default function MergePanel({ state, branches, onOverlay, onMerge, onClose }: Props) {
  const others = branches.filter(b => !b.active);
  const active = branches.find(b => b.active)!;
  const [otherId, setOtherId] = useState(others[0]?.id ?? '');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [error, setError] = useState<string | null>(null);
  const other = branches.find(b => b.id === otherId);

  const analysis = useMemo(() => {
    if (!otherId) return null;
    const inputs = mergeInputs(state, otherId);
    if ('error' in inputs) return { error: inputs.error };
    // Comptes : toutes les collections fusionnées et les réglages ; surimpression : les objets.
    const theirs = versionDiff(inputs.base, inputs.theirs);
    const ours = versionDiff(inputs.base, inputs.ours);
    const drawn = diffById(inputs.base.objects, inputs.theirs.objects);
    return { theirs, ours, drawn, result: merge3(inputs.base, inputs.ours, inputs.theirs) };
  }, [state, otherId]);

  const close = () => { onOverlay(null); onClose(); };
  const count = (list: Change[], k: Change['kind']) => list.filter(c => c.kind === k).length;

  return (
    <div role="dialog" aria-label="Comparer et fusionner" className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[75vh] max-w-lg flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Comparer et fusionner</h2>
        <button type="button" onClick={close} aria-label="Fermer la comparaison" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      {others.length === 0 ? <p>Aucune autre variante : créez-en une dans l’historique.</p> : (
        <>
          <label className="flex items-center gap-2">Comparer « {active.name} » avec
            <select aria-label="Variante à comparer" value={otherId} onChange={e => { setOtherId(e.target.value); setChoices({}); setError(null); onOverlay(null); }}
              className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
              {others.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {analysis && 'error' in analysis && <p role="alert" className="text-red-300">{analysis.error}</p>}
          {analysis && !('error' in analysis) && (
            <>
              <p data-testid="fusion-differences">
                Depuis l’ancêtre commun, « {other?.name} » : {count(analysis.theirs, 'ajouté')} ajouté(s), {count(analysis.theirs, 'modifié')} modifié(s), {count(analysis.theirs, 'supprimé')} supprimé(s) ;
                « {active.name} » : {count(analysis.ours, 'ajouté')} ajouté(s), {count(analysis.ours, 'modifié')} modifié(s), {count(analysis.ours, 'supprimé')} supprimé(s).
              </p>
              <button type="button" onClick={() => onOverlay({ changes: analysis.drawn, otherId })} className="self-start rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5">
                Montrer les changements de « {other?.name} » sur le dessin
              </button>
              {analysis.result.conflicts.length > 0 ? (
                <div data-testid="fusion-conflits" className="space-y-1">
                  <p className="text-amber-300">{analysis.result.conflicts.length} conflit(s) : les deux variantes ont changé le même élément différemment. Tranchez chacun.</p>
                  {analysis.result.conflicts.map(c => (
                    <fieldset key={conflictKey(c)} data-conflit={conflictKey(c)} className="rounded-sm border border-border p-1.5">
                      <legend className="px-1 text-foreground">{WHERE[c.where] ?? c.where} {c.where === c.id ? '' : c.id} — ici {c.ours}, là {c.theirs}</legend>
                      {(['nôtre', 'leur'] as const).map(ch => (
                        <label key={ch} className="mr-3 inline-flex items-center gap-1">
                          <input type="radio" name={conflictKey(c)} checked={choices[conflictKey(c)] === ch} onChange={() => setChoices(p => ({ ...p, [conflictKey(c)]: ch }))} />
                          {ch === 'nôtre' ? `garder « ${active.name} »` : `garder « ${other?.name} »`}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              ) : <p data-testid="fusion-sans-conflit">Aucun conflit : {analysis.result.taken.length} changement(s) de « {other?.name} » seront repris.</p>}
              <button type="button" disabled={analysis.result.conflicts.some(c => !choices[conflictKey(c)])}
                onClick={() => { const err = onMerge(otherId, choices); setError(err); if (!err) close(); }}
                className="self-start rounded-sm border border-cyan-400/60 bg-cyan-400/10 px-2 py-1 text-cyan-200 disabled:opacity-40">
                Fusionner « {other?.name} » dans « {active.name} »
              </button>
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>
  );
}
