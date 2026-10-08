// Zones (lot 13.3) : regroupements de pièces, couleur et surface cumulée.
import { useState } from 'react';
import type { CadObject, Zone } from '@/types/cad';
import { zoneSummaries } from '@/lib/zones';
import { formatM2 } from '@/lib/rooms';

interface Props {
  zones: Zone[];
  objects: CadObject[];
  /** Pièces sélectionnées sur le dessin (pour créer une zone avec elles). */
  selectedRoomIds: string[];
  onAdd: (name: string, color: string, roomIds: string[]) => string | null;
  onUpdate: (id: string, patch: Partial<Pick<Zone, 'name' | 'color'>>) => string | null;
  onRemove: (id: string) => void;
  onRoomZone: (roomId: string, zoneId: string | undefined) => void;
  onClose: () => void;
}

const field = 'rounded-sm border border-border bg-background px-1.5 py-1 text-foreground';

export default function ZonesPanel({ zones, objects, selectedRoomIds, onAdd, onUpdate, onRemove, onRoomZone, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', color: '#22d3ee' });
  const summaries = zoneSummaries(objects, zones);

  return (
    <div role="dialog" aria-label="Zones" className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[75vh] max-w-lg flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Zones</h2>
        <button type="button" onClick={onClose} aria-label="Fermer les zones" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      {summaries.map(({ zone, rooms, totalM2, unevaluated }) => (
        <section key={zone.id} data-zone={zone.id} className="rounded-sm border border-border p-2">
          <div className="flex items-center gap-1.5">
            <input aria-label={`Couleur de ${zone.name}`} type="color" value={zone.color} onChange={e => setError(onUpdate(zone.id, { color: e.target.value }))} className="h-6 w-8 rounded-sm border border-border bg-transparent" />
            <input aria-label={`Nom de ${zone.name}`} defaultValue={zone.name} key={`${zone.id}-${zone.name}`} className={`${field} min-w-0 flex-1`}
              onBlur={e => { const err = onUpdate(zone.id, { name: e.target.value }); setError(err); if (err) e.target.value = zone.name; }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            <span data-zone-total className="text-foreground">{unevaluated ? 'au moins ' : ''}{formatM2(totalM2)}</span>
            <button type="button" aria-label={`Supprimer la zone ${zone.name}`} onClick={() => onRemove(zone.id)} className="px-1 hover:text-red-300">×</button>
          </div>
          <ul className="mt-1 flex flex-col gap-0.5 pl-1 text-[11px]">
            {rooms.length === 0 && <li>Aucune pièce.</li>}
            {rooms.map(r => (
              <li key={r.id} data-zone-piece={r.id} className="flex items-center gap-2">
                <span className="flex-1 truncate">{r.name}</span>
                <span>{r.areaM2 === null ? 'pièce non fermée : non évaluée' : formatM2(r.areaM2)}</span>
                <button type="button" aria-label={`Retirer ${r.name} de la zone`} onClick={() => onRoomZone(r.id, undefined)} className="px-1 hover:text-red-300">×</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <form className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2" onSubmit={e => {
        e.preventDefault();
        const err = onAdd(draft.name, draft.color, selectedRoomIds);
        setError(err);
        if (!err) setDraft(d => ({ ...d, name: '' }));
      }}>
        <input aria-label="Couleur de la nouvelle zone" type="color" value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} className="h-7 w-9 rounded-sm border border-border bg-transparent" />
        <input aria-label="Nom de la nouvelle zone" placeholder="Nom" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className={`${field} min-w-0 flex-1`} />
        <button type="submit" aria-label="Créer la zone" className="rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5">
          Créer{selectedRoomIds.length ? ` avec ${selectedRoomIds.length} pièce${selectedRoomIds.length > 1 ? 's' : ''}` : ''}
        </button>
      </form>
      {error && <p role="alert" data-testid="zones-erreur" className="text-red-300">{error}</p>}
    </div>
  );
}
