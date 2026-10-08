// Inspecteur — classe IFC et jeux de propriétés d'un objet (lot 12.3).
import { useState } from 'react';
import type { CadObject } from '@/types/cad';
import {
  IFC_CLASSES, PROPERTY_UNITS, addPset, commonPsetName, defaultIfcClass, formatValue, ifcClassOf, isIfcClass, parseValue, removeProperty, removePset, setProperty,
  type PropertySet,
} from '@/lib/properties';

interface Props {
  obj: CadObject;
  onUpdate: (id: string, patch: Partial<CadObject>, label?: string) => void;
}

const field = 'rounded-sm border border-border bg-background px-1.5 py-1 text-xs text-foreground';
type Kind = 'texte' | 'nombre' | 'booleen';

export default function PropertiesEditor({ obj, onUpdate }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [newSet, setNewSet] = useState('');
  const [draft, setDraft] = useState<{ set: string; name: string; kind: Kind; value: string; unit: string }>({ set: '', name: '', kind: 'texte', value: '', unit: '' });
  const psets = obj.psets ?? [];
  const save = (next: PropertySet[], label: string) => { onUpdate(obj.id, { psets: next.length ? next : undefined }, label); setError(null); };
  const cls = ifcClassOf(obj);

  return (
    <div data-testid="proprietes">
      <p className="ui-label mb-1.5">Classe IFC</p>
      <select aria-label="Classe IFC" value={isIfcClass(obj.ifcClass) ? obj.ifcClass : ''} className={`${field} w-full`}
        onChange={e => onUpdate(obj.id, { ifcClass: e.target.value || undefined }, 'Classe IFC')}>
        <option value="">Par défaut ({defaultIfcClass(obj)})</option>
        {IFC_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <p className="ui-label mb-1.5 mt-3">Jeux de propriétés</p>
      {psets.map(s => (
        <div key={s.name} data-pset={s.name} className="mb-2 rounded-sm border border-border p-1.5">
          <div className="mb-1 flex items-center gap-1 font-mono text-[11px] text-foreground">
            <span className="flex-1 truncate">{s.name}</span>
            <button type="button" aria-label={`Retirer le jeu ${s.name}`} onClick={() => save(removePset(psets, s.name), `Retirer ${s.name}`)} className="px-1 text-muted-foreground hover:text-red-300">×</button>
          </div>
          {s.props.length === 0 && <p className="text-[11px] text-muted-foreground">Aucune propriété.</p>}
          <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5 font-mono text-[11px]">
            {s.props.map(p => (
              <div key={p.name} data-propriete={`${s.name}.${p.name}`} className="contents">
                <dt className="text-muted-foreground">{p.name}</dt>
                <dd className="text-foreground">{formatValue(p)}</dd>
                <dd><button type="button" aria-label={`Retirer ${s.name}.${p.name}`} onClick={() => save(removeProperty(psets, s.name, p.name), `Retirer ${p.name}`)} className="px-1 text-muted-foreground hover:text-red-300">×</button></dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {psets.length > 0 && (
        <form className="mb-2 flex flex-wrap items-center gap-1" onSubmit={e => {
          e.preventDefault();
          const set = draft.set || psets[0].name;
          const value = parseValue(draft.value, draft.kind);
          if (typeof value === 'object') { setError(value.error); return; }
          const next = setProperty(psets, set, { name: draft.name.trim(), value, ...(draft.unit ? { unit: draft.unit } : {}) });
          if ('error' in next) { setError(next.error); return; }
          save(next, `Propriété ${draft.name.trim()}`);
          setDraft(d => ({ ...d, name: '', value: '' }));
        }}>
          <select aria-label="Jeu de la propriété" value={draft.set || psets[0].name} onChange={e => setDraft(d => ({ ...d, set: e.target.value }))} className={field}>
            {psets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <input aria-label="Nom de la propriété" placeholder="Nom" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className={`${field} w-24`} />
          <select aria-label="Type de la valeur" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value as Kind }))} className={field}>
            <option value="texte">texte</option><option value="nombre">nombre</option><option value="booleen">vrai/faux</option>
          </select>
          <input aria-label="Valeur de la propriété" placeholder="Valeur" value={draft.value} onChange={e => setDraft(d => ({ ...d, value: e.target.value }))} className={`${field} w-20`} />
          <select aria-label="Unité de la propriété" value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))} className={field}>
            {PROPERTY_UNITS.map(u => <option key={u} value={u}>{u || '—'}</option>)}
          </select>
          <button type="submit" aria-label="Ajouter la propriété" className="rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-accent">Ajouter</button>
        </form>
      )}

      <form className="flex items-center gap-1" onSubmit={e => {
        e.preventDefault();
        const next = addPset(psets, newSet);
        if ('error' in next) { setError(next.error); return; }
        save(next, `Jeu ${newSet.trim()}`);
        setDraft(d => ({ ...d, set: newSet.trim() }));
        setNewSet('');
      }}>
        <input aria-label="Nom du nouveau jeu de propriétés" list="psets-usuels" placeholder={commonPsetName(cls)} value={newSet} onChange={e => setNewSet(e.target.value)} className={`${field} min-w-0 flex-1`} />
        <datalist id="psets-usuels"><option value={commonPsetName(cls)} /></datalist>
        <button type="submit" aria-label="Ajouter le jeu de propriétés" className="rounded-sm border border-border px-2 py-1 text-xs text-foreground hover:bg-accent">Nouveau jeu</button>
      </form>
      {error && <p role="alert" data-testid="proprietes-erreur" className="mt-1 text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
