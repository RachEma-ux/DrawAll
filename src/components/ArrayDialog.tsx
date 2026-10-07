import { useState } from 'react';

export type ArrayParams =
  | { mode: 'rect'; rows: number; cols: number; dx: number; dy: number }
  | { mode: 'polar'; count: number; angle: number; cx: number; cy: number };

interface Props {
  mode: 'rect' | 'polar';
  /** Centre proposé pour le réseau polaire (centre de la sélection). */
  center: { x: number; y: number };
  /** Applique le réseau ; renvoie un message d'erreur, ou null en cas de succès. */
  onApply: (params: ArrayParams) => string | null;
  onClose: () => void;
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
const round = (v: number) => String(Math.round(v * 100) / 100);

/** Saisie des paramètres d'un réseau rectangulaire ou polaire. */
export default function ArrayDialog({ mode, center, onApply, onClose }: Props) {
  const [f, setF] = useState({ rows: '2', cols: '3', dx: '100', dy: '100', count: '6', angle: '360', cx: round(center.x), cy: round(center.y) });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: ArrayParams = mode === 'rect'
      ? { mode, rows: num(f.rows), cols: num(f.cols), dx: num(f.dx), dy: num(f.dy) }
      : { mode, count: num(f.count), angle: num(f.angle), cx: num(f.cx), cy: num(f.cy) };
    const err = onApply(params);
    if (err) setError(err);
    else onClose();
  };

  const field = (k: keyof typeof f, label: string, unit = '') => (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input aria-label={label} inputMode="decimal" value={f[k]} onChange={set(k)}
          className="w-20 rounded-sm border border-border bg-background px-1.5 py-1 text-right text-foreground" />
        <span className="w-6 text-muted-foreground/70">{unit}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-label={mode === 'rect' ? 'Réseau rectangulaire' : 'Réseau polaire'}
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
        className="w-full max-w-xs space-y-2 rounded-sm border border-border bg-[#0c1220] p-4 font-mono text-[11px] text-muted-foreground shadow-xl"
      >
        <h2 className="text-[10px] uppercase tracking-[0.15em] text-cyan-300">{mode === 'rect' ? 'Réseau rectangulaire' : 'Réseau polaire'}</h2>
        {mode === 'rect' ? (
          <>
            {field('rows', 'Lignes')}
            {field('cols', 'Colonnes')}
            {field('dx', 'Pas X', 'mm')}
            {field('dy', 'Pas Y', 'mm')}
            <p className="text-[10px] text-muted-foreground/70">Exemplaires comptés original compris ; Y positif vers le bas de l’écran.</p>
          </>
        ) : (
          <>
            {field('count', 'Exemplaires')}
            {field('angle', 'Angle total', '°')}
            {field('cx', 'Centre X', 'mm')}
            {field('cy', 'Centre Y', 'mm')}
            <p className="text-[10px] text-muted-foreground/70">Original compris ; angle positif dans le sens antihoraire ; 360° = tour complet.</p>
          </>
        )}
        {error && <p role="alert" className="text-amber-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-sm px-3 py-1.5 uppercase tracking-[0.12em] hover:bg-accent">Annuler</button>
          <button type="submit" className="rounded-sm bg-cyan-400 px-3 py-1.5 uppercase tracking-[0.12em] text-[#050810]">Créer</button>
        </div>
      </form>
    </div>
  );
}
