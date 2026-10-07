import { OBJECT_SNAP_TYPES, snapLabel, type ObjectSnapType } from '@/lib/geometry';

interface Props {
  active: readonly ObjectSnapType[];
  onChange: (types: ObjectSnapType[]) => void;
  onClose: () => void;
}

const HINT: Record<ObjectSnapType, string> = {
  endpoint: 'Bouts des lignes, arcs et polylignes',
  midpoint: 'Milieu des segments et des arcs',
  center: 'Centre des cercles, arcs et rectangles',
  intersection: 'Croisement de deux objets',
  corner: 'Coins des rectangles',
  quadrant: 'Points à 0°, 90°, 180°, 270° des cercles',
  insertion: 'Point d’insertion des textes et des blocs',
  perpendicular: 'Pied de la perpendiculaire depuis le point précédent',
  tangent: 'Point de tangence à un cercle ou un arc depuis le point précédent',
  nearest: 'Point de l’objet le plus proche du curseur',
};

/** Activation des accrochages objet, type par type. La grille reste toujours active. */
export default function SnapSettings({ active, onChange, onClose }: Props) {
  const set = new Set(active);
  const toggle = (t: ObjectSnapType) => {
    const next = new Set(set);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange(OBJECT_SNAP_TYPES.filter(x => next.has(x)));
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Accrochages objet"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
        className="w-full max-w-sm rounded-sm border border-border bg-[#0c1220] p-4 font-mono text-[11px] text-muted-foreground shadow-xl"
      >
        <h2 className="mb-2 text-[10px] uppercase tracking-[0.15em] text-cyan-300">Accrochages objet</h2>
        <div className="grid gap-1">
          {OBJECT_SNAP_TYPES.map(t => (
            <label key={t} className="flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1 hover:bg-accent/40">
              <input type="checkbox" checked={set.has(t)} onChange={() => toggle(t)} className="mt-0.5 accent-cyan-400" />
              <span>
                <span className="text-foreground">{snapLabel(t)}</span>
                <span className="block text-[10px] text-muted-foreground/70">{HINT[t]}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/70">La grille accroche toujours en l’absence d’objet. F9 coupe ou rétablit tous les accrochages objet.</p>
        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="rounded-sm bg-cyan-400 px-3 py-1.5 uppercase tracking-[0.12em] text-[#050810]">Fermer</button>
        </div>
      </div>
    </div>
  );
}
