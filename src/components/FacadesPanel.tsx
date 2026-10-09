// Façades et coupes de bâtiment (lot 16.2) : générées depuis le modèle 3D (murs, dalles, poteaux,
// poutres, toitures, solides), recalculées quand il change, posées sur une feuille par une fenêtre.
import { useState } from 'react';
import type { CadObject, DrawingScale, ElevationObj, ElevationView, Sheet } from '@/types/cad';
import { ELEVATION_LABEL, elevationLabel, placedAny } from '@/lib/projection';
import { STANDARD_SCALES, formatScale } from '@/lib/sheet';

interface Props {
  objects: CadObject[];
  sheets: Sheet[];
  /** Identifiants des vues créées ; undefined : commande refusée (calque actif verrouillé…). */
  onGenerate: (views: { view: ElevationView; markId?: string }[]) => string[] | undefined;
  onPlace: (sheetId: string, elevation: ElevationObj, center: { x: number; y: number }, scale: DrawingScale, name: string) => void;
  onClose: () => void;
}

const field = 'rounded-sm border border-border bg-background px-1.5 py-1 text-foreground';
const button = 'rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40';
const FACADES = ['sud', 'nord', 'est', 'ouest'] as const;

export default function FacadesPanel({ objects, sheets, onGenerate, onPlace, onClose }: Props) {
  const marks = objects.filter(o => o.kind === 'section');
  const elevations = objects.filter((o): o is ElevationObj => o.kind === 'elevation');
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [place, setPlace] = useState({ sheet: '', scale: '1:100' });
  const toggle = (k: string, on: boolean) => setChosen(c => (on ? [...c, k] : c.filter(x => x !== k)));

  const generate = () => {
    const views = chosen.map(k => (k.startsWith('coupe:') ? { view: 'coupe' as const, markId: k.slice(6) } : { view: k as ElevationView }));
    const made = onGenerate(views);
    if (!made) { setMessage({ error: true, text: 'Génération refusée : le calque actif est verrouillé (déverrouillez-le ou choisissez-en un autre).' }); return; }
    setMessage(made.length
      ? { error: false, text: `${made.length} vue${made.length > 1 ? 's' : ''} générée${made.length > 1 ? 's' : ''} sous le bâtiment.` }
      : { error: true, text: 'Rien à générer : aucun élément en volume (murs, dalles, toitures… ou solides), ou aucune vue choisie.' });
    if (made.length) setChosen([]);
  };

  const scaleOf = (label: string) => STANDARD_SCALES.find(s => formatScale(s) === label) ?? STANDARD_SCALES[0];
  const sheetId = place.sheet || sheets[0]?.id || '';
  const put = (e: ElevationObj) => {
    const v = placedAny(e, objects);
    if (!v || v.state === 'erreur') { setMessage({ error: true, text: `Vue non posée : ${v?.error ?? 'indisponible'}.` }); return; }
    if (!sheetId) { setMessage({ error: true, text: 'Aucune feuille : créez d’abord une feuille.' }); return; }
    const name = elevationLabel(e, objects);
    onPlace(sheetId, e, { x: v.frame.x + v.frame.w / 2, y: v.frame.y + v.frame.h / 2 }, scaleOf(place.scale), name);
    setMessage({ error: false, text: `${name} posée sur ${sheets.find(s => s.id === sheetId)?.name ?? sheetId} au ${place.scale}.` });
  };

  return (
    <div role="dialog" aria-label="Façades et coupes" className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[75vh] max-w-lg flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Façades et coupes</h2>
        <button type="button" onClick={onClose} aria-label="Fermer les façades" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      <section aria-label="Générer" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Depuis le modèle 3D (hauteurs du §8.11), arêtes vues</span>
        {FACADES.map(f => (
          <label key={f} className="flex items-center gap-1"><input type="checkbox" checked={chosen.includes(f)} onChange={e => toggle(f, e.target.checked)} /> {ELEVATION_LABEL[f]}</label>
        ))}
        {marks.map(m => m.kind === 'section' && (
          <label key={m.id} className="flex items-center gap-1"><input type="checkbox" checked={chosen.includes(`coupe:${m.id}`)} onChange={e => toggle(`coupe:${m.id}`, e.target.checked)} /> Coupe {m.label || 'A'}–{m.label || 'A'}</label>
        ))}
        {!marks.length && <span className="w-full text-[11px]">Pour une coupe, posez d’abord un repère de coupe (outil Symbole).</span>}
        <button type="button" className={button} disabled={!chosen.length} onClick={generate}>Générer</button>
      </section>
      {elevations.length > 0 && (
        <section aria-label="Poser sur une feuille" className="flex flex-col gap-1.5 rounded-sm border border-border p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-foreground">Poser sur</span>
            <select aria-label="Feuille" value={sheetId} onChange={e => setPlace(p => ({ ...p, sheet: e.target.value }))} className={field}>
              {!sheets.length && <option value="">Aucune feuille</option>}
              {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select aria-label="Échelle de la fenêtre" value={place.scale} onChange={e => setPlace(p => ({ ...p, scale: e.target.value }))} className={field}>
              {STANDARD_SCALES.map(s => <option key={formatScale(s)} value={formatScale(s)}>{formatScale(s)}</option>)}
            </select>
          </div>
          <ul className="flex flex-col gap-1">
            {elevations.map(e => {
              const v = placedAny(e, objects);
              return (
                <li key={e.id} data-facade={e.id} className="flex items-center gap-2">
                  <span className="flex-1">{elevationLabel(e, objects)}{v?.state === 'calcul' ? ' — calcul…' : v?.state === 'erreur' ? ` — ${v.error}` : ''}</span>
                  <button type="button" aria-label={`Poser ${elevationLabel(e, objects)} sur la feuille`} className={button} onClick={() => put(e)}>Poser</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {message && <p role={message.error ? 'alert' : 'status'} data-testid="facades-message" className={message.error ? 'text-red-300' : 'text-emerald-300'}>{message.text}</p>}
    </div>
  );
}
