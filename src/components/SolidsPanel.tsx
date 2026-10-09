// Solides (lot 15.2) : extrusion et révolution d'un contour fermé, booléens de deux solides,
// perçage. Chaque recette est contrôlée par le noyau OCCT (volume non nul) avant d'entrer au projet.
import { useEffect, useRef, useState } from 'react';
import type { CadObject, SolidObj } from '@/types/cad';
import type { FaceRef, ProjView, SolidRecipe } from '@/lib/kernel/recipe';
import { VIEW_LABEL } from '@/lib/projection';
import { MATE_LABEL, fixeMate, frameOf, type Mate } from '@/lib/assembly';
import { kernelDeviation, kernelVolume } from '@/lib/kernel/client';
import { BOOLEAN_LABEL, effectiveSolid, partInstances, contourOf, extrudeRecipe, faceChoices, holeRecipe, loftCheckPoints, pushPullRecipe, shellRecipe, loftRecipe, parseLevels, pathOf, recipeSteps, revolveRecipe, sweepRecipe, type BooleanOp, type Contour, type SolidResult } from '@/lib/solids';

interface Props {
  objects: CadObject[];
  /** Sélection, dans l'ordre où elle a été faite (le premier solide est celui que l'on garde). */
  selectedIds: string[];
  /** Crée un solide à partir d'un objet source (calque, classification et niveau repris). */
  onCreate: (from: CadObject, recipe: SolidRecipe, label: string) => void;
  onUpdate: (id: string, recipe: SolidRecipe, label: string) => void;
  onCombine: (aId: string, bId: string, op: BooleanOp) => void;
  /** Pose des vues projetées du solide (lot 16.1). */
  onProject?: (sourceId: string, views: ProjView[]) => void;
  /** Pièces et occurrences (lot 16.3). */
  onMakePart?: (id: string) => number | null;
  onAddOccurrence?: (defId: string, x: number, y: number, z: number, angle: number) => string | null;
  /** Liaison d'une occurrence (lot 16.4) ; `undefined` délie. Renvoie l'erreur éventuelle. */
  onSetMate?: (occId: string, mate: Mate | undefined) => string | null;
  onClose: () => void;
}

const field = 'w-20 rounded-sm border border-border bg-background px-1.5 py-1 text-right text-foreground';
const button = 'rounded-sm border border-border px-2 py-1 text-foreground hover:bg-white/5 disabled:opacity-40';
const parse = (s: string) => Number(s.trim().replace(',', '.'));
const m3 = (mm3: number) => `${(mm3 / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 6 })} m³`;

export default function SolidsPanel({ objects, selectedIds, onCreate, onUpdate, onCombine, onProject, onMakePart, onAddOccurrence, onSetMate, onClose }: Props) {
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
  const [shell, setShell] = useState<{ thickness: string; open: string[] }>({ thickness: '', open: [] });
  const [push, setPush] = useState({ face: '', distance: '' });
  const [views, setViews] = useState<ProjView[]>(['dessus', 'face', 'cote']);
  const [occ, setOcc] = useState({ x: '', y: '', z: '', angle: '0' });
  const [mate, setMateDraft] = useState<{ type: Mate['type']; face: string; toFace: string; offset: string }>({ type: 'appui', face: '', toFace: '', offset: '0' });
  // Liaison : l'occurrence d'abord, puis sa référence (pièce type ou autre occurrence).
  const dep = selected[0]?.kind === 'occurrence' ? selected[0] : null;
  const refObj = dep && selected.length === 2 && frameOf(selected[1]) ? selected[1] : null;
  const depFaces = dep ? faceChoicesOf(dep) : [], refFaces = refObj ? faceChoicesOf(refObj) : [];
  function faceChoicesOf(o: CadObject) { const s = effectiveSolid(o, objects); return s ? faceChoices(s.recipe) : []; }
  const doMate = () => {
    if (!dep || dep.kind !== 'occurrence' || !refObj || !onSetMate) return;
    let m: Mate | null;
    if (mate.type === 'fixe') m = fixeMate(dep, refObj);
    else {
      const f = depFaces.find(c => key(c.ref) === mate.face)?.ref, t = refFaces.find(c => key(c.ref) === mate.toFace)?.ref;
      if (!f || !t) { setMessage({ error: true, text: 'Liaison : désignez une face de chaque côté.' }); return; }
      m = mate.type === 'coaxiale' ? { type: 'coaxiale', to: refObj.id, face: f, toFace: t } : { type: 'appui', to: refObj.id, face: f, toFace: t, offset: parse(mate.offset || '0') };
    }
    if (!m) return;
    const err = onSetMate(dep.id, m);
    setMessage(err ? { error: true, text: err } : { error: false, text: `Liaison ${MATE_LABEL[m.type].toLowerCase()} : ${dep.id} suit ${refObj.id}.` });
  };
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

  // Objets du projet tels qu'au dernier rendu : le calcul du noyau est asynchrone, l'atelier reste utilisable.
  const latest = useRef(objects);
  useEffect(() => { latest.current = objects; }, [objects]);
  /**
   * Contrôle par le noyau, puis application. `operands` : objets dont part l'opération ; s'ils ont changé
   * (ou disparu) pendant le calcul, rien n'est appliqué. `check` : contrôle supplémentaire (texte, ou erreur).
   */
  const run = async (res: SolidResult, operands: CadObject[], apply: (r: SolidRecipe) => void, done: string, check?: (r: SolidRecipe) => Promise<{ ok: boolean; text: string }>) => {
    if ('error' in res) { setMessage({ error: true, text: res.error }); return; }
    const before = operands.map(o => JSON.stringify(o));
    setBusy(true);
    try {
      const { volume: v } = await kernelVolume(res.recipe);
      if (!(v > 1e-9)) { setMessage({ error: true, text: 'Résultat vide : le solide n’a aucun volume (rien n’est créé).' }); return; }
      const extra = check ? await check(res.recipe) : null;
      if (extra && !extra.ok) { setMessage({ error: true, text: extra.text }); return; }
      const changed = operands.find((o, i) => JSON.stringify(latest.current.find(x => x.id === o.id)) !== before[i]);
      if (changed) { setMessage({ error: true, text: `${changed.id} a changé pendant le calcul : rien n’est appliqué, recommencez.` }); return; }
      apply(res.recipe);
      setMessage({ error: false, text: `${done}${extra ? ` — ${extra.text}` : ''} — volume ${m3(v)}.` });
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  const extrude = () => {
    const src = contours[0], c = contourOf(src);
    if ('error' in c) return;
    // La fonction porte le nom de l'objet source : ses faces deviennent désignables (coque).
    void run(extrudeRecipe(c, parse(extr.height), parse(extr.z || '0'), src.id), [src], r => onCreate(src, r, 'Extruder'), 'Extrusion créée');
  };
  const revolve = () => {
    const src = contours[0], c = contourOf(src), ax = lines.find(l => l.id !== src.id);
    if ('error' in c || ax?.kind !== 'line') return;
    void run(revolveRecipe(c, { x: ax.x1, y: ax.y1 }, { x: ax.x2, y: ax.y2 }, parse(angle)), [src, ax], r => onCreate(src, r, 'Révolution'), 'Révolution créée');
  };
  // Balayage : le premier désigné est le profil (contour fermé), le second le trajet.
  const [first, second] = selected;
  const sweepProfile = first && first.kind !== 'solid' ? contourOf(first) : null;
  const sweepPath = second ? pathOf(second) : null;
  const canSweep = selected.length === 2 && !!sweepProfile && !('error' in sweepProfile) && !!sweepPath && !('error' in sweepPath);
  const sweep = () => {
    if (!sweepProfile || 'error' in sweepProfile || !sweepPath || 'error' in sweepPath) return;
    const len = sweepPath.length.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
    void run(sweepRecipe(sweepProfile, sweepPath.path, parse(sweepZ || '0')), [first, second], r => onCreate(first, r, 'Balayer'), `Balayage créé (trajet de ${len} mm)`);
  };
  // Lissage : toutes les sections sélectionnées sont des contours fermés, dans l'ordre de désignation.
  const loftContours = selected.map(o => (o.kind === 'solid' ? null : contourOf(o)));
  const canLoft = selected.length >= 2 && loftContours.every(c => c && !('error' in c));
  const doLoft = () => {
    const cs = loftContours.filter((c): c is Contour => !!c && !('error' in c));
    void run(loftRecipe(cs, parseLevels(loft.levels), loft.ruled), selected, r => onCreate(selected[0], r, 'Lisser'), `Lissage créé par ${cs.length} sections`, async r => {
      if (r.op !== 'loft') return { ok: true, text: '' };
      // Les sections doivent être retrouvées sur le bord du solide (10⁻⁶ mm).
      const dev = await kernelDeviation(r, loftCheckPoints(r.sections));
      return dev <= 1e-6 ? { ok: true, text: 'sections retrouvées à 10⁻⁶ mm' } : { ok: false, text: `Lissage refusé : une section s’écarte du solide de ${dev.toLocaleString('fr-FR', { maximumSignificantDigits: 3 })} mm.` };
    });
  };
  const faces = one ? faceChoices(one.recipe) : [];
  const key = (f: FaceRef) => `${f.feature}.${f.role}`;
  const doShell = () => {
    if (!one) return;
    const open = faces.filter(f => shell.open.includes(key(f.ref))).map(f => f.ref);
    void run(shellRecipe(one.recipe, parse(shell.thickness), open), [one], r => onUpdate(one.id, r, 'Coque'), `Coque faite (${open.length} face${open.length > 1 ? 's' : ''} ouverte${open.length > 1 ? 's' : ''})`);
  };
  const doPush = () => {
    const f = faces.find(c => key(c.ref) === push.face);
    if (!one) return;
    if (!f) { setMessage({ error: true, text: 'Pousser / tirer : désignez une face.' }); return; }
    const d = parse(push.distance);
    void run(pushPullRecipe(one.recipe, f.ref, d), [one], r => onUpdate(one.id, r, d > 0 ? 'Tirer' : 'Pousser'), `${d > 0 ? 'Face tirée' : 'Face poussée'} (${f.label})`);
  };
  const combine = (op: BooleanOp) => {
    const [a, b] = solids;
    void run({ recipe: { op, a: a.recipe, b: b.recipe } }, [a, b], () => onCombine(a.id, b.id, op), `${BOOLEAN_LABEL[op]} faite`);
  };
  const drill = () => {
    const s = solids[0], depth = hole.depth.trim() === '' ? undefined : parse(hole.depth);
    void run(holeRecipe(s.recipe, parse(hole.x), parse(hole.y), parse(hole.d), depth), [s], r => onUpdate(s.id, r, 'Percer'), 'Perçage fait');
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

      <section aria-label="Coque" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Coque : évidement à épaisseur donnée, faces ouvertes désignées</span>
        <label className="flex items-center gap-1">Épaisseur <input aria-label="Épaisseur de la coque (mm)" inputMode="decimal" value={shell.thickness} onChange={e => setShell(s => ({ ...s, thickness: e.target.value }))} className={field} /> mm</label>
        {one && !faces.length && <span className="w-full text-[11px]">Aucune face nommée sur ce solide (seules les extrusions nommées à leur création en ont).</span>}
        {faces.length > 0 && (
          <fieldset className="flex w-full flex-col gap-0.5 text-[11px]">
            <legend className="sr-only">Faces ouvertes</legend>
            {faces.map(f => (
              <label key={key(f.ref)} className="flex items-center gap-1.5">
                <input type="checkbox" checked={shell.open.includes(key(f.ref))} onChange={e => setShell(s => ({ ...s, open: e.target.checked ? [...s.open, key(f.ref)] : s.open.filter(k => k !== key(f.ref)) }))} />
                {f.label}
              </label>
            ))}
          </fieldset>
        )}
        <button type="button" className={button} disabled={!one || busy} onClick={doShell}>Évider</button>
      </section>

      <section aria-label="Pousser / tirer" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
        <span className="w-full text-foreground">Pousser / tirer une face plane (distance positive : tirer ; négative : pousser)</span>
        <select aria-label="Face à pousser ou tirer" value={push.face} onChange={e => setPush(p => ({ ...p, face: e.target.value }))} className={`${field} w-auto max-w-full text-left`}>
          <option value="">Face…</option>
          {faces.filter(f => f.ref.role !== 'wall').map(f => <option key={key(f.ref)} value={key(f.ref)}>{f.label}</option>)}
        </select>
        <label className="flex items-center gap-1">Distance <input aria-label="Distance (mm)" inputMode="decimal" value={push.distance} onChange={e => setPush(p => ({ ...p, distance: e.target.value }))} className={field} /> mm</label>
        <button type="button" className={button} disabled={!one || busy} onClick={doPush}>Appliquer</button>
      </section>

      {onMakePart && onAddOccurrence && (
        <section aria-label="Pièce" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
          <span className="w-full text-foreground">
            Pièce et occurrences{one?.partDef ? ` — repère ${one.partDef.no}, ${partInstances(one.id, objects).length} exemplaire${partInstances(one.id, objects).length > 1 ? 's' : ''} (pièce type comprise)` : ''}
          </span>
          {one && !one.partDef && (
            <button type="button" className={button} onClick={() => { const no = onMakePart(one.id); if (no) setMessage({ error: false, text: `${one.name} devient la pièce n° ${no}.` }); }}>Définir comme pièce</button>
          )}
          {one?.partDef && (
            <>
              <label className="flex items-center gap-1">X <input aria-label="X de l’occurrence (mm)" inputMode="decimal" value={occ.x} onChange={e => setOcc(o => ({ ...o, x: e.target.value }))} className={field} /></label>
              <label className="flex items-center gap-1">Y <input aria-label="Y de l’occurrence (mm)" inputMode="decimal" value={occ.y} onChange={e => setOcc(o => ({ ...o, y: e.target.value }))} className={field} /></label>
              <label className="flex items-center gap-1">Z <input aria-label="Z de l’occurrence (mm)" inputMode="decimal" placeholder={String(one.partDef.origin[2]).replace('.', ',')} value={occ.z} onChange={e => setOcc(o => ({ ...o, z: e.target.value }))} className={field} /></label>
              <label className="flex items-center gap-1">Angle <input aria-label="Angle de l’occurrence (°)" inputMode="decimal" value={occ.angle} onChange={e => setOcc(o => ({ ...o, angle: e.target.value }))} className={field} /> °</label>
              <button type="button" className={button} onClick={() => {
                const [x, y] = [parse(occ.x), parse(occ.y)], z = occ.z.trim() === '' ? one.partDef!.origin[2] : parse(occ.z), a = parse(occ.angle || '0');
                if (occ.x.trim() === '' || occ.y.trim() === '') { setMessage({ error: true, text: 'Occurrence : X et Y du point de base attendus.' }); return; }
                const id = onAddOccurrence(one.id, x, y, z, a);
                setMessage(id ? { error: false, text: `Occurrence ${id} de la pièce n° ${one.partDef!.no} posée.` } : { error: true, text: 'Occurrence : nombres finis attendus.' });
              }}>Poser une occurrence</button>
            </>
          )}
        </section>
      )}

      {onSetMate && (
        <section aria-label="Liaison" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
          <span className="w-full text-foreground">Liaison : une occurrence, puis sa référence (pièce ou occurrence)</span>
          <select aria-label="Type de liaison" value={mate.type} onChange={e => setMateDraft(m => ({ ...m, type: e.target.value as Mate['type'] }))} className={`${field} w-auto text-left`}>
            {(['fixe', 'coaxiale', 'appui'] as const).map(t => <option key={t} value={t}>{MATE_LABEL[t]}</option>)}
          </select>
          {mate.type !== 'fixe' && (
            <>
              <select aria-label="Face de l’occurrence" value={mate.face} onChange={e => setMateDraft(m => ({ ...m, face: e.target.value }))} className={`${field} w-auto max-w-full text-left`}>
                <option value="">Face de l’occurrence…</option>
                {depFaces.map(f => <option key={key(f.ref)} value={key(f.ref)}>{f.label}</option>)}
              </select>
              <select aria-label="Face de la référence" value={mate.toFace} onChange={e => setMateDraft(m => ({ ...m, toFace: e.target.value }))} className={`${field} w-auto max-w-full text-left`}>
                <option value="">Face de la référence…</option>
                {refFaces.map(f => <option key={key(f.ref)} value={key(f.ref)}>{f.label}</option>)}
              </select>
            </>
          )}
          {mate.type === 'appui' && <label className="flex items-center gap-1">Écart <input aria-label="Écart de l’appui (mm)" inputMode="decimal" value={mate.offset} onChange={e => setMateDraft(m => ({ ...m, offset: e.target.value }))} className={field} /> mm</label>}
          <button type="button" className={button} disabled={!refObj} onClick={doMate}>Lier</button>
          {dep?.kind === 'occurrence' && dep.mate && selected.length === 1 && (
            <button type="button" className={button} onClick={() => { const err = onSetMate(dep.id, undefined); setMessage(err ? { error: true, text: err } : { error: false, text: `${dep.id} déliée.` }); }}>Délier</button>
          )}
        </section>
      )}

      {onProject && (
        <section aria-label="Vues projetées" className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border p-2">
          <span className="w-full text-foreground">Vues projetées (arêtes cachées en interrompu, associées au solide)</span>
          {(['dessus', 'face', 'cote'] as const).map(v => (
            <label key={v} className="flex items-center gap-1">
              <input type="checkbox" checked={views.includes(v)} onChange={e => setViews(vs => (e.target.checked ? [...vs, v] : vs.filter(x => x !== v)))} /> {VIEW_LABEL[v]}
            </label>
          ))}
          <button type="button" className={button} disabled={!one || !views.length || busy} onClick={() => { if (one) { onProject(one.id, (['dessus', 'face', 'cote'] as const).filter(v => views.includes(v))); setMessage({ error: false, text: `${views.length} vue${views.length > 1 ? 's' : ''} posée${views.length > 1 ? 's' : ''} à droite du solide.` }); } }}>Poser les vues</button>
        </section>
      )}

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
