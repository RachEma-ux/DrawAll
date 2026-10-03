// En-tête : marque, bascule atelier/documentation, niveaux d'affichage (UX1),
// lecture bâtiment/industrie (Concept §1), annulation et export du paquet.
import type { DisplayLevel, ViewReading } from '@/types/cad';

interface Props {
  mode: 'atelier' | 'docs';
  setMode: (m: 'atelier' | 'docs') => void;
  level: DisplayLevel;
  setLevel: (l: DisplayLevel) => void;
  view: ViewReading;
  setView: (v: ViewReading) => void;
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void;
  onPalette: () => void;
  onExport: () => void;
  onReset: () => void;
  versionLabel: string;
}

const LEVELS: { id: DisplayLevel; label: string }[] = [
  { id: 'essentiel', label: 'Essentiel' },
  { id: 'contextuel', label: 'Contextuel' },
  { id: 'complet', label: 'Complet' },
];

export default function Header(p: Props) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-[#0c1220]/90 px-3">
      <div className="flex items-center gap-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" />
          <path d="M3 12h18M12 3v18" strokeWidth="0.75" opacity="0.6" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground">DRAWALL</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">v4.1 · base de développement</span>
      </div>

      <nav className="ml-2 flex gap-1">
        {(['atelier', 'docs'] as const).map(m => (
          <button
            key={m}
            onClick={() => p.setMode(m)}
            className={`rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
              p.mode === m ? 'bg-cyan-400/15 text-cyan-300' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === 'atelier' ? 'Atelier' : 'Documentation'}
          </button>
        ))}
      </nav>

      <div className="mx-auto flex items-center gap-3">
        {p.mode === 'atelier' && (
          <>
            <div className="flex overflow-hidden rounded-sm border border-border">
              {LEVELS.map(l => (
                <button
                  key={l.id}
                  onClick={() => p.setLevel(l.id)}
                  className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                    p.level === l.id ? 'bg-cyan-400 text-[#050810]' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-sm border border-border">
              <button
                onClick={() => p.setView('batiment')}
                className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                  p.view === 'batiment' ? 'bg-cyan-400/15 text-cyan-300' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Lecture bâtiment
              </button>
              <button
                onClick={() => p.setView('industrie')}
                className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                  p.view === 'industrie' ? 'bg-emerald-400/15 text-emerald-300' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Lecture industrie
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {p.mode === 'atelier' && (
          <>
            <button onClick={p.onUndo} disabled={!p.canUndo} title="Annuler (Ctrl+Z)"
              className="rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">↩</button>
            <button onClick={p.onRedo} disabled={!p.canRedo} title="Rétablir (Ctrl+Maj+Z)"
              className="rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">↪</button>
            <span className="mx-1 h-4 w-px bg-border" />
          </>
        )}
        <button onClick={p.onPalette}
          className="flex items-center gap-2 rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-cyan-400/50 hover:text-foreground">
          Rechercher <kbd className="rounded-sm border border-border bg-background px-1 text-[9px]">⌘K</kbd>
        </button>
        {p.mode === 'atelier' && p.level === 'complet' && (
          <>
            <button onClick={p.onExport}
              className="rounded-sm border border-emerald-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-400 transition-colors hover:bg-emerald-400/10">
              Exporter
            </button>
            <button onClick={p.onReset}
              className="rounded-sm border border-red-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-red-400 transition-colors hover:bg-red-400/10">
              Réinitialiser
            </button>
          </>
        )}
        <span className="ml-1 hidden font-mono text-[9px] text-muted-foreground/60 lg:inline">{p.versionLabel}</span>
      </div>
    </header>
  );
}
