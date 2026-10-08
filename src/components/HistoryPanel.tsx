// Panneau des modifications — repère permanent UX1 : historique Git-like (Concept §8)
// microversions, versions nommées immuables, diagnostics (T07).
import { useState } from 'react';
import type { MicroVersion } from '@/types/cad';
import type { BranchInfo } from '@/lib/branches';

interface Props {
  versions: MicroVersion[];
  pointer: number;
  diagnostics: { level: 'info' | 'avertissement'; text: string }[];
  onGoTo: (index: number) => void;
  onNameVersion: (name: string) => void;
  compact: boolean;
  syncLabel: string;
  syncColor: string;
  /** Variantes (lot 14.1) : branches du projet, l'active d'abord. */
  branches?: BranchInfo[];
  onCreateVariant?: (name: string) => string | null;
  onSwitchVariant?: (id: string) => string | null;
  onRemoveVariant?: (id: string) => string | null;
}

export default function HistoryPanel({ versions, pointer, diagnostics, onGoTo, onNameVersion, compact, syncLabel, syncColor, branches, onCreateVariant, onSwitchVariant, onRemoveVariant }: Props) {
  const [variant, setVariant] = useState('');
  const [variantError, setVariantError] = useState<string | null>(null);
  const active = branches?.find(b => b.active);
  const [tab, setTab] = useState<'modifs' | 'problemes'>('modifs');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const shown = [...versions].reverse();

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-title">
        <div className="flex gap-3">
          <button onClick={() => setTab('modifs')} className={tab === 'modifs' ? 'text-cyan-400' : ''}>Modifications</button>
          <button onClick={() => setTab('problemes')} className={tab === 'problemes' ? 'text-cyan-400' : ''}>
            Problèmes <span className="text-amber-400">{diagnostics.filter(d => d.level === 'avertissement').length || ''}</span>
          </button>
        </div>
        {tab === 'modifs' && !compact && (
          naming ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && name.trim()) { onNameVersion(name.trim()); setNaming(false); setName(''); }
                  if (e.key === 'Escape') setNaming(false);
                }}
                placeholder="Nom du jalon…"
                className="w-36 rounded-sm border border-input bg-background px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal outline-none focus:border-cyan-400"
              />
            </span>
          ) : (
            <button onClick={() => setNaming(true)} className="font-mono text-[10px] uppercase tracking-[0.15em] text-emerald-400 hover:text-emerald-300">
              + Version nommée
            </button>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'modifs' ? (
          <div>
            {branches && onCreateVariant && (
              <div data-testid="variantes" className="space-y-1 border-b border-border/60 px-3 py-2 font-mono text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="uppercase tracking-[0.12em]">Variante</span>
                  <select aria-label="Variante active" value={active?.id} onChange={e => setVariantError(onSwitchVariant?.(e.target.value) ?? null)}
                    className="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0.5 text-foreground">
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.versions} v.)</option>)}
                  </select>
                  {branches.length > 1 && !compact && (
                    <select aria-label="Supprimer une variante" value="" onChange={e => { if (e.target.value && window.confirm(`Supprimer la variante « ${branches.find(b => b.id === e.target.value)?.name} » et son historique ?`)) setVariantError(onRemoveVariant?.(e.target.value) ?? null); }}
                      className="w-8 rounded-sm border border-input bg-background px-0.5 py-0.5 text-red-300" title="Supprimer une variante rangée">
                      <option value="">×</option>
                      {branches.filter(b => !b.active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </div>
                {active?.from && <p>Partie de v{active.from.seq} de « {branches.find(b => b.id === active.from!.branchId)?.name ?? active.from.branchId} »</p>}
                <form className="flex items-center gap-1" onSubmit={e => { e.preventDefault(); const err = onCreateVariant(variant); setVariantError(err); if (!err) setVariant(''); }}>
                  <input aria-label="Nom de la nouvelle variante" placeholder={`Variante depuis v${versions[pointer].seq}`} value={variant} onChange={e => setVariant(e.target.value)}
                    className="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0.5 text-foreground" />
                  <button type="submit" aria-label="Créer la variante" className="rounded-sm border border-border px-1.5 py-0.5 text-foreground hover:bg-white/5">Créer</button>
                </form>
                {variantError && <p role="alert" className="text-red-300">{variantError}</p>}
              </div>
            )}
            {shown.map((v) => {
              const idx = versions.findIndex(candidate => candidate.seq === v.seq);
              const current = idx === pointer;
              return (
                <button
                  key={v.seq}
                  onClick={() => onGoTo(idx)}
                  className={`flex w-full items-center gap-3 border-b border-border/40 px-3 py-1.5 text-left transition-colors ${
                    current ? 'bg-cyan-400/10' : 'hover:bg-accent'
                  }`}
                >
                  <span className={`font-mono text-[10px] ${current ? 'text-cyan-400' : 'text-muted-foreground'}`}>
                    v{v.seq}
                  </span>
                  <span className={`truncate text-xs ${current ? 'text-foreground' : 'text-foreground/70'}`}>{v.label}</span>
                  {v.named && (
                    <span className="shrink-0 rounded-sm border border-emerald-400/50 bg-emerald-400/10 px-1.5 py-px font-mono text-[9px] text-emerald-400">
                      {v.named}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground/60">
                    {new Date(v.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-2">
            {diagnostics.map((d, i) => (
              <div
                key={i}
                className={`mb-1.5 border-l-2 px-2.5 py-1.5 text-xs leading-relaxed ${
                  d.level === 'avertissement'
                    ? 'border-amber-400 bg-amber-400/5 text-amber-200/90'
                    : 'border-cyan-400/60 bg-cyan-400/5 text-foreground/70'
                }`}
              >
                {d.text}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
          {versions.length} microversion{versions.length > 1 ? 's' : ''} · {versions.filter(v => v.named).length} nommée{versions.filter(v => v.named).length > 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px]" style={{ color: syncColor }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: syncColor }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: syncColor }} />
          </span>
          {syncLabel.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
