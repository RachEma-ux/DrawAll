// Solides (lot 15.2) : extrusion et révolution d'un contour fermé, booléens de deux solides,
// perçage. Chaque recette est contrôlée par le noyau OCCT (volume non nul) avant d'entrer au projet.
import { useEffect, useState } from 'react';
import type { CadObject, SolidObj } from '@/types/cad';
import type { SolidRecipe } from '@/lib/kernel/recipe';
import { kernelDeviation, kernelVolume } from '@/lib/kernel/client';
import { BOOLEAN_LABEL, contourOf, extrudeRecipe, holeRecipe, loftCheckPoints, loftRecipe, parseLevels, pathOf, recipeSteps, revolveRecipe, sweepRecipe, type BooleanOp, type Contour, type SolidResult } from '@/lib/solids';

interface Props {
  objects: CadObject[];
  /** Sélection, dans l'ordre où elle a été faite (le premier solide est celui que l'on garde). */
  selectedIds: string[];
  /** Crée un solide à partir d'un objet source (calque, classification et niveau repris). */
  onCreate: (from: CadObject, recipe: SolidRecipe, label: string) => void;
  onUpdate: (id: string, recipe: SolidRecipe, label: string) => void;
  onCombine: (aId: string, bId: string, op: BooleanOp) => void;
  onClose: () => void;
}

const field = 'w-20 rounded-sm border border-border bg-background px-1.5 py-1 text-right text-foreground';
const button = 'rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40';
const parse = (s: string) => Number(s.trim().replace(',', '.'));
const m3 = (mm3: number) => `${(mm3 / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 6 })} m³`;

export default function SolidsPanel({ objects, selectedIds, onCreate, onUpdate, onCombine, onClose }: Props) {
  const selected = selectedIds.map(id => objects.find(o => o.id === id)).filter((o): o is CadObject => !!o);
  const solids = selected.filter((o): o is SolidObj => o.kind === 'solid');
  const contours = selected.filter(o => o.kind !== 'solid' && !('error' in contourOf(o)));
  const lines = selected.filter(o => o.kind === 'line');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [extr, setExtr] = useState({ height: '', z: '0' });
  const [angle, setAngle] = useState('360');
  const [sweepZ, setSweepZ] = useState('0');
  const [loft, setLoft] = useState({ levels: '', ruled: true });
  const [hole, setHole] = useState({ x: '', y: '', d: '', depth: '' });

  // Volume du solide sélectionné, calculé par le noyau.
  const one = solids.length === 1 && selected.length === 1 ? solids[0] : null;
  const [volume, setVolume] = useState<{ id: string; recipe: SolidRecipe; v: number } | { id: string; recipe: SolidRecipe; error: string } | null>(null);
  useEffect(() => {
    if (!one) return;
    let live = true;
    kernelVolume(one.recipe).then(r => { if (live) setVolume({ id: one.id, recipe: one.recipe, v: r.volume }); },
      e => { if (live) setVolume({ id: one.id, recipe: one.recipe, error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [one]);
  const shownVolume = one && volume && volume.id === one.id && volume.recipe === one.recipe ? volume : null;

  /** Contrôle par le noyau, puis application. `check` : contrôle supplémentaire (texte, ou erreur). */
  const run = async (res: SolidResult, apply: (r: SolidRecipe) => void, done: string, check?: (r: SolidRecipe) => Promise<{ ok: boolean; text: string }>) => {
    if ('error' in res) { setMessage({ error: true, text: res.error }); return; }
    setBusy(true);
    try {
      const { volume: v } = await kernelVolume(res.recipe);
      if (!(v > 1e-9)) { setMessage({ error: true, text: 'Résultat vide : le solide n’a aucun volume (rien n’est créé).' }); return; }
      const extra = check ? await check(res.recipe) : null;
      if (extra && !extra.ok) { setMessage({ error: true, text: extra.text }); return; }
      apply(res.recipe);
      setMessage({ error: false, text: `${done}${extra ? ` — ${extra.text}` : ''} — volume ${m3(v)}.` });
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  const extrude = () => {
    const src = contours[0], c = contourOf(src);
    if ('error' in c) return;
    void run(extrudeRecipe(c, parse(extr.height), parse(extr.z || '0')), r => onCreate(src, r, 'Extruder'), 'Extrusion créée');
  };
  const revolve = () => {
    const src = contours[0], c = contourOf(src), ax = lines.find(l => l.id !== src.id);
    if ('error' in c || ax?.kind !== 'line') return;
    void run(revolveRecipe(c, { x: ax.x1, y: ax.y1 }, { x: ax.x2, y: ax.y2 }, parse(angle)), r => onCreate(src, r, 'Révolution'), 'Révolution créée');
  };
  // Balayage : le premier désigné est le profil (contour fermé), le second le trajet.
  const [first, second] = selected;
  const sweepProfile = first && first.kind !== 'solid' ? contourOf(first) : null;
  const sweepPath = second ? pathOf(second) : null;
  const canSweep = selected.length === 2 && !!sweepProfile && !('error' in sweepProfile) && !!sweepPath && !('error' in sweepPath);
  const sweep = () => {
    if (!sweepProfile || 'error' in sweepProfile || !sweepPath || 'error' in sweepPath) return;
    const len = sweepPath.length.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
    void run(sweepRecipe(sweepProfile, sweepPath.path, parse(sweepZ || '0')), r => onCreate(first, r, 'Balayer'), `Balayage créé (trajet de ${len} mm)`);
  };
  // Lissage : toutes les sections sélectionnées sont des contours fermés, dans l'ordre de désignation.
  const loftContours = selected.map(o => (o.kind === 'solid' ? null : contourOf(o)));
  const canLoft = selected.length >= 2 && loftContours.every(c => c && !('error' in c));
  const doLoft = () => {
    const cs = loftContours.filter((c): c is Contour => !!c && !('error' in c));
    void run(loftRecipe(cs, parseLevels(loft.levels), loft.ruled), r => onCreate(selected[0], r, 'Lisser'), `Lissage créé par ${cs.length} sections`, async r => {
      if (r.op !== 'loft') return { ok: true, text: '' };
      // Les sections doivent être retrouvées sur le bord du solide (10⁻⁶ mm).
      const dev = await kernelDeviation(r, loftCheckPoints(r.sections));
      return dev <= 1e-6 ? { ok: true, text: 'sections retrouvées à 10⁻⁶ mm' } : { ok: false, text: `Lissage refusé : une section s’écarte du solide de ${dev.toLocaleString('fr-FR', { maximumSignificantDigits: 3 })} mm.` };
    });
  };
  const combine = (op: BooleanOp) => {
    const [a, b] = solids;
    void run({ recipe: { op, a: a.recipe, b: b.recipe } }, () => onCombine(a.id, b.id, op), `${BOOLEAN_LABEL[op]} faite`);
  };
  const drill = () => {
    const s = solids[0], depth = hole.depth.trim() === '' ? undefined : parse(hole.depth);
    void run(holeRecipe(s.recipe, parse(hole.x), parse(hole.y), parse(hole.d), depth), r => onUpdate(s.id, r, 'Percer'), 'Perçage fait');
  };

  const canExtrude = contours.length === 1 && selected.length === 1;
  const canRevolve = contours.length >= 1 && lines.some(l => l.id !== contours[0].id) && selected.length === 2;
  const canCombine = solids.length === 2 && selected.length === 2;

  return (
    <div role="dialog" aria-label="Solides" className="fixed inset-x-3 top-16 z-50 mx-auto flex max-h-[75vh] max-w-lg flex-col gap-2 overflow-y-auto rounded-md border border-border bg-[#0c1220] p-3 font-mono text-[12px] text-muted-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-foreground">Solides</h2>
        <button type="button" onClick={onClose} aria-label="Fermer les solides" className="rounded-sm px-2 py-0.5 hover:text-foreground">×</button>
      </div>
      <p className="text-[11px]">
        {selected.length === 0 ? 'Sélectionnez un contour fermé (rectangle, cercle, polyligne fermée), un contour et une ligne d’axe, un ou deux solides.' : `Sélection : ${selected.map(o => o.name).join(', ')}.`}
      </p>

      <section aria-label="Extrusion" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Extrusion d’un contour fermé</span>
        <label className="flex items-center gap-1">Hauteur <input aria-label="Hauteur d’extrusion (mm)" inputMode="decimal" value={extr.height} onChange={e => setExtr(x => ({ ...x, height: e.target.value }))} className={field} /> mm</label>
        <label className="flex items-center gap-1">Base <input aria-label="Cote de la base (mm)" inputMode="decimal" value={extr.z} onChange={e => setExtr(x => ({ ...x, z: e.target.value }))} className={field} /> mm</label>
        <button type="button" className={button} disabled={!canExtrude || busy} onClick={extrude}>Extruder</button>
      </section>

      <section aria-label="Révolution" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Révolution d’un contour autour d’une ligne (sélectionnez les deux)</span>
        <label className="flex items-center gap-1">Angle <input aria-label="Angle de révolution (°)" inputMode="decimal" value={angle} onChange={e => setAngle(e.target.value)} className={field} /> °</label>
        <button type="button" className={button} disabled={!canRevolve || busy} onClick={revolve}>Tourner</button>
      </section>

      <section aria-label="Balayage" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Balayage (Follow Me) : un profil fermé, puis son trajet (ligne, arc, polyligne, spline)</span>
        <label className="flex items-center gap-1">Cote du trajet <input aria-label="Cote du trajet (mm)" inputMode="decimal" value={sweepZ} onChange={e => setSweepZ(e.target.value)} className={field} /> mm</label>
        <button type="button" className={button} disabled={!canSweep || busy} onClick={sweep}>Balayer</button>
      </section>

      <section aria-label="Lissage" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Lissage par sections (contours fermés, dans l’ordre de désignation)</span>
        <label className="flex items-center gap-1">Cotes <input aria-label="Cotes des sections (mm, séparées par ;)" placeholder="0 ; 1000 ; 2500" value={loft.levels} onChange={e => setLoft(l => ({ ...l, levels: e.target.value }))} className={`${field} w-32 text-left`} /> mm</label>
        <label className="flex items-center gap-1"><input type="checkbox" aria-label="Surfaces réglées" checked={loft.ruled} onChange={e => setLoft(l => ({ ...l, ruled: e.target.checked }))} /> réglées (sinon lisses)</label>
        <button type="button" className={button} disabled={!canLoft || busy} onClick={doLoft}>Lisser</button>
      </section>

      <section aria-label="Booléens" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Booléens de deux solides {canCombine ? `(${solids[0].name} puis ${solids[1].name})` : ''}</span>
        {(['union', 'cut', 'intersect'] as const).map(op => (
          <button key={op} type="button" className={button} disabled={!canCombine || busy} onClick={() => combine(op)}>{op === 'cut' ? 'Différence (1er − 2e)' : BOOLEAN_LABEL[op]}</button>
        ))}
      </section>

      <section aria-label="Perçage" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Perçage vertical depuis le dessus</span>
        <label className="flex items-center gap-1">X <input aria-label="X du perçage (mm)" inputMode="decimal" value={hole.x} onChange={e => setHole(h => ({ ...h, x: e.target.value }))} className={field} /></label>
        <label className="flex items-center gap-1">Y <input aria-label="Y du perçage (mm)" inputMode="decimal" value={hole.y} onChange={e => setHole(h => ({ ...h, y: e.target.value }))} className={field} /></label>
        <label className="flex items-center gap-1">Ø <input aria-label="Diamètre du perçage (mm)" inputMode="decimal" value={hole.d} onChange={e => setHole(h => ({ ...h, d: e.target.value }))} className={field} /></label>
        <label className="flex items-center gap-1">Profondeur <input aria-label="Profondeur du perçage (mm)" placeholder="traversant" inputMode="decimal" value={hole.depth} onChange={e => setHole(h => ({ ...h, depth: e.target.value }))} className={field} /></label>
        <button type="button" className={button} disabled={!one || busy} onClick={drill}>Percer</button>
      </section>

      {one && (
        <p data-testid="solide-volume" data-volume={shownVolume && 'v' in shownVolume ? shownVolume.v : undefined} className="text-foreground">
          {one.name} : {recipeSteps(one.recipe).join(' → ')} ; volume (noyau OCCT) : {shownVolume ? ('v' in shownVolume ? m3(shownVolume.v) : `non évalué (${shownVolume.error})`) : 'calcul…'}
        </p>
      )}
      {busy && <p role="status">Contrôle par le noyau 3D…</p>}
      {message && <p role={message.error ? 'alert' : 'status'} data-testid="solides-message" className={message.error ? 'text-red-300' : 'text-emerald-300'}>{message.text}</p>}
    </div>
  );
}
