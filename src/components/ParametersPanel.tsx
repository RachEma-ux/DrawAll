// Table des paramètres nommés (lot 12.2) : nom, expression, unité, valeur calculée. Une saisie qui
// créerait une référence circulaire ou une erreur est refusée avec sa raison.
import { useMemo, useState } from 'react';
import { resolveParameters, type Parameter } from '@/lib/params/expr';

interface Props {
  parameters: Parameter[];
  onAdd: (name: string, expr: string, unit: Parameter['unit']) => string | null;
  onUpdate: (id: string, patch: Partial<Pick<Parameter, 'expr' | 'unit'>>) => string | null;
  onRemove: (id: string) => string | null;
  onClose: () => void;
}

const fmt = (v: number) => (Math.round(v * 1e6) / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
const input = 'rounded-sm border border-border bg-background px-1.5 py-1 text-foreground';

export default function ParametersPanel({ parameters, onAdd, onUpdate, onRemove, onClose }: Props) {
  const resolved = useMemo(() => resolveParameters(parameters), [parameters]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', expr: '', unit: 'mm' as Parameter['unit'] });

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const err = onAdd(draft.name, draft.expr, draft.unit);
    setError(err);
    if (!err) setDraft({ name: '', expr: '', unit: draft.unit });
  };

  return (
    <div role="dialog" aria-label="Paramètres du projet" className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[75vh] max-w-lg flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Paramètres du projet</h2>
        <button type="button" onClick={onClose} aria-label="Fermer les paramètres" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      <p className="text-[11px]">Expressions : + − × (*) ÷ (/) ^, parenthèses, racine, sin, cos, tan (degrés), min, max, arrondi, pi ; arguments séparés par « ; ». Une cote de contrainte peut citer un paramètre (par exemple « L / 2 »).</p>
      {parameters.length > 0 && (
        <table className="w-full border-collapse">
          <thead><tr className="text-left text-[11px]"><th className="py-1">Nom</th><th>Expression</th><th>Unité</th><th className="text-right">Valeur</th><th /></tr></thead>
          <tbody>
            {parameters.map(p => (
              <tr key={p.id} data-parametre={p.name} className="align-middle">
                <td className="py-0.5 pr-2 text-foreground">{p.name}</td>
                <td className="pr-2">
                  <input aria-label={`Expression de ${p.name}`} defaultValue={p.expr} key={`${p.id}-${p.expr}`} className={`${input} w-full`}
                    onBlur={e => { const err = onUpdate(p.id, { expr: e.target.value }); setError(err); if (err) e.target.value = p.expr; }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                </td>
                <td className="pr-2">
                  <select aria-label={`Unité de ${p.name}`} value={p.unit} onChange={e => setError(onUpdate(p.id, { unit: e.target.value as Parameter['unit'] }))} className={input}>
                    <option value="mm">mm</option><option value="°">°</option><option value="">—</option>
                  </select>
                </td>
                <td data-valeur className="pr-2 text-right text-foreground" title={resolved.errors.get(p.name) ?? ''}>
                  {resolved.values.has(p.name) ? `${fmt(resolved.values.get(p.name)!)}${p.unit ? ` ${p.unit}` : ''}` : <span className="text-red-300">erreur</span>}
                </td>
                <td><button type="button" aria-label={`Retirer ${p.name}`} onClick={() => setError(onRemove(p.id))} className="px-1 hover:text-red-300">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={add} className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <input aria-label="Nom du nouveau paramètre" placeholder="Nom" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className={`${input} w-20`} />
        <span>=</span>
        <input aria-label="Expression du nouveau paramètre" placeholder="Expression" value={draft.expr} onChange={e => setDraft(d => ({ ...d, expr: e.target.value }))} className={`${input} min-w-0 flex-1`} />
        <select aria-label="Unité du nouveau paramètre" value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value as Parameter['unit'] }))} className={input}>
          <option value="mm">mm</option><option value="°">°</option><option value="">—</option>
        </select>
        <button type="submit" aria-label="Ajouter le paramètre" className="rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5">Ajouter</button>
      </form>
      {error && <p role="alert" data-testid="parametres-erreur" className="text-red-300">{error}</p>}
    </div>
  );
}
