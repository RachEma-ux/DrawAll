// Géoréférencement (lot 17.3) : point de base (E, N, altitude), système de coordonnées déclaré,
// rotation du nord. Aucune valeur proposée par défaut : tout est saisi.
import { useState } from 'react';
import type { Georef } from '@/types/cad';
import { formatGeoref, georefError, modelToMap } from '@/lib/georef';

interface Props {
  georef: Georef | undefined;
  onSave: (g: Georef | null) => string | null;
  onClose: () => void;
}

const field = 'w-40 rounded-sm border border-border bg-background px-1.5 py-1 text-right text-foreground';
const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.trim().replace(/\s/g, '').replace(',', '.')));

export default function GeorefPanel({ georef, onSave, onClose }: Props) {
  const init = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));
  const [draft, setDraft] = useState({ crs: georef?.crs ?? '', e: init(georef?.e), n: init(georef?.n), h: init(georef?.h), north: init(georef?.north) });
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const candidate: Partial<Georef> = { crs: draft.crs.trim(), e: num(draft.e), n: num(draft.n), h: num(draft.h), north: num(draft.north) };
  const error = georefError(candidate);
  const sample = !error ? modelToMap({ x: 10000, y: 0, z: 0 }, candidate as Georef) : null;
  const input = (key: keyof typeof draft, label: string, unit: string, placeholder = '') => (
    <label className="flex items-center justify-between gap-2">
      {label}
      <span className="flex items-center gap-1">
        <input aria-label={label} placeholder={placeholder} value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} className={field} /> {unit}
      </span>
    </label>
  );
  return (
    <div role="dialog" aria-label="Géoréférencement" className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[75vh] max-w-md flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Géoréférencement</h2>
        <button type="button" onClick={onClose} aria-label="Fermer le géoréférencement" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      <p className="text-[11px]">Le point (0 ; 0) du dessin, à l’altitude 0, est placé en (E, N, altitude) du système déclaré. Le nord du quadrillage est donné depuis le haut du plan, dans le sens horaire.</p>
      {input('crs', 'Système de coordonnées', '', 'EPSG:…')}
      {input('e', 'Est (E) du point de base', 'm')}
      {input('n', 'Nord (N) du point de base', 'm')}
      {input('h', 'Altitude du point de base', 'm')}
      {input('north', 'Nord du quadrillage', '°')}
      {sample && <p data-testid="georef-exemple" className="text-[11px]">Contrôle : le point (10 m ; 0) du dessin est en E {sample.E.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} · N {sample.N.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}.</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!!error} className="rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40" onClick={() => {
          const err = onSave(candidate as Georef);
          setMessage(err ? { error: true, text: err } : { error: false, text: `Géoréférencé : ${formatGeoref(candidate as Georef)}.` });
        }}>Enregistrer</button>
        {georef && <button type="button" className="rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5" onClick={() => { onSave(null); setMessage({ error: false, text: 'Géoréférencement retiré : repère local seul.' }); }}>Retirer</button>}
      </div>
      {(message || error) && <p role={message?.error || (!message && error) ? 'alert' : 'status'} data-testid="georef-message" className={message && !message.error ? 'text-emerald-300' : 'text-amber-300'}>{message?.text ?? error}</p>}
    </div>
  );
}
