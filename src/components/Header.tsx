// En-tête : marque, bascule atelier/documentation, niveaux d'affichage (UX1),
// lecture bâtiment/industrie (Concept §1), annulation, export et compte Kimi.
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { SYNC_META, type SyncStatus } from '@/types/cloud';
import type { DisplayLevel, ViewReading } from '@/types/cad';

interface Props {
  mode: 'atelier' | 'feuilles' | 'docs';
  setMode: (m: 'atelier' | 'feuilles' | 'docs') => void;
  level: DisplayLevel;
  setLevel: (l: DisplayLevel) => void;
  view: ViewReading;
  setView: (v: ViewReading) => void;
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void;
  onPalette: () => void;
  onExport: () => void;
  /** Paquet natif (lot 8.2) : restaurer un projet depuis son paquet. */
  onImportPackage?: () => void;
  onExportDxf: () => void;
  /** Fond de plan : image ou PDF (lot 6.2). */
  onImportUnderlay?: () => void;
  onImportDxf: () => void;
  onReset: () => void;
  onCloud: () => void;
  syncStatus: SyncStatus;
  versionLabel: string;
}

const LEVELS: { id: DisplayLevel; label: string }[] = [
  { id: 'essentiel', label: 'Essentiel' },
  { id: 'contextuel', label: 'Contextuel' },
  { id: 'complet', label: 'Complet' },
];

export default function Header(p: Props) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const sync = SYNC_META[p.syncStatus];

  const [menuOpen, setMenuOpen] = useState(false);

  // Réglages d'affichage (niveaux UX1, lectures) — dans la barre sur grand écran, dans le menu sur téléphone.
  const displayControls = p.mode === 'atelier' && (
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
  );

  const actions = (
    <>
      <button onClick={p.onCloud}
        title="Projets cloud et synchronisation"
        className="flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] transition-colors hover:border-cyan-400/50">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sync.color }} />
        <span style={{ color: sync.color }}>{sync.label}</span>
      </button>
      <button onClick={p.onPalette}
        className="flex items-center gap-2 rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-cyan-400/50 hover:text-foreground">
        Rechercher <kbd className="rounded-sm border border-border bg-background px-1 text-[9px]">⌘K</kbd>
      </button>
      {p.mode === 'atelier' && (
        <>
          <button onClick={p.onImportDxf}
            title="Importer un DXF : traits, cercles, arcs, polylignes, textes, blocs, cotes, hachures, splines, ellipses. Un DWG est reconnu, et la marche à suivre (l’enregistrer en DXF) indiquée."
            className="rounded-sm border border-cyan-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 transition-colors hover:bg-cyan-400/10">
            Importer DXF / DWG
          </button>
          {p.onImportUnderlay && (
            <button onClick={p.onImportUnderlay}
              title="Importer une image ou un PDF comme fond de plan, à caler par deux points"
              className="rounded-sm border border-cyan-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 transition-colors hover:bg-cyan-400/10">
              Fond de plan
            </button>
          )}
          <button onClick={p.onExportDxf}
            title="Exporter les primitives, calques, cotes et blocs aplaties en DXF"
            className="rounded-sm border border-cyan-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 transition-colors hover:bg-cyan-400/10">
            DXF
          </button>
        </>
      )}
      {p.mode === 'atelier' && p.level === 'complet' && (
        <>
          <button onClick={p.onExport}
            title="Exporter le paquet DrawAll : projet entier, historique, feuilles, styles, ressources"
            className="rounded-sm border border-emerald-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-400 transition-colors hover:bg-emerald-400/10">
            Paquet
          </button>
          {p.onImportPackage && (
            <button onClick={p.onImportPackage}
              title="Restaurer un projet depuis son paquet DrawAll (remplace le projet courant)"
              className="rounded-sm border border-emerald-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-400 transition-colors hover:bg-emerald-400/10">
              Restaurer
            </button>
          )}
          <button onClick={p.onReset}
            className="rounded-sm border border-red-400/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-red-400 transition-colors hover:bg-red-400/10">
            Réinitialiser
          </button>
        </>
      )}
      <span className="ml-1 hidden font-mono text-[9px] text-muted-foreground/60 lg:inline">{p.versionLabel}</span>
      <span className="mx-1 h-4 w-px bg-border" />
      {isLoading ? (
        <span className="font-mono text-[10px] text-muted-foreground">compte…</span>
      ) : isAuthenticated && user ? (
        <span className="flex items-center gap-1.5 rounded-sm border border-border px-1.5 py-1">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-4 w-4 rounded-full" />
          ) : (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400/20 font-mono text-[9px] text-cyan-300">
              {(user.name ?? 'U').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="hidden max-w-28 truncate font-mono text-[10px] text-foreground xl:inline">{user.name ?? 'Compte Kimi'}</span>
          <button onClick={logout} title="Se déconnecter" className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:text-red-300">
            quitter
          </button>
        </span>
      ) : (
        <Link
          to="/login"
          className="rounded-sm border border-cyan-400/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 transition-colors hover:bg-cyan-400/10"
        >
          Connexion Kimi
        </Link>
      )}
    </>
  );

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-2 border-b border-border bg-[#0c1220]/90 px-2 sm:gap-3 sm:px-3">
      <div className="flex shrink-0 items-center gap-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" />
          <path d="M3 12h18M12 3v18" strokeWidth="0.75" opacity="0.6" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="font-mono text-sm font-semibold tracking-[0.2em] text-foreground">DRAWALL</span>
        <span className="hidden font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground 2xl:inline">v4.1 · base de développement</span>
      </div>

      <nav className="flex gap-1 sm:ml-2">
        {(['atelier', 'feuilles', 'docs'] as const).map(m => (
          <button
            key={m}
            onClick={() => p.setMode(m)}
            className={`rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors sm:px-2.5 sm:tracking-[0.15em] ${
              p.mode === m ? 'bg-cyan-400/15 text-cyan-300' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {m === 'atelier' ? 'Atelier' : m === 'feuilles' ? 'Feuilles' : <><span className="sm:hidden">Docs</span><span className="hidden sm:inline">Documentation</span></>}
          </button>
        ))}
      </nav>

      <div className="mx-auto hidden items-center gap-3 xl:flex">
        {displayControls}
      </div>

      <div className="ml-auto flex items-center gap-1.5 2xl:ml-0">
        {/* Les feuilles sont versionnées avec le projet : annuler et rétablir aussi en mode Feuilles. */}
        {(p.mode === 'atelier' || p.mode === 'feuilles') && (
          <>
            <button onClick={p.onUndo} disabled={!p.canUndo} title="Annuler (Ctrl+Z)"
              className="rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">↩</button>
            <button onClick={p.onRedo} disabled={!p.canRedo} title="Rétablir (Ctrl+Maj+Z)"
              className="rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30">↪</button>
          </>
        )}
        <div className="hidden items-center gap-1.5 2xl:flex">
          <span className="mx-1 h-4 w-px bg-border" />
          {actions}
        </div>
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-expanded={menuOpen}
          aria-label="Menu"
          className={`rounded-sm border px-2.5 py-1 font-mono text-xs transition-colors 2xl:hidden ${menuOpen ? 'border-cyan-400/60 text-cyan-300' : 'border-border text-muted-foreground'}`}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {menuOpen && (
        <div
          className="absolute inset-x-0 top-11 z-50 flex flex-col gap-3 border-b border-border bg-[#0c1220] p-3 shadow-2xl shadow-black/50 2xl:hidden"
          onClick={e => { if ((e.target as HTMLElement).closest('button, a')) setMenuOpen(false); }}
        >
          {displayControls && <div className="flex flex-wrap items-center gap-2 xl:hidden">{displayControls}</div>}
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
    </header>
  );
}
