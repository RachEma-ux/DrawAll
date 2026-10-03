// Panneau des modifications — repère permanent UX1 : historique Git-like (Concept §8)
// microversions, versions nommées immuables, diagnostics (T07).
import { useState } from 'react';
import type { MicroVersion } from '@/types/cad';

interface Props {
  versions: MicroVersion[];
  pointer: number;
  diagnostics: { level: 'info' | 'avertissement'; text: string }[];
  onGoTo: (index: number) => void;
  onNameVersion: (name: string) => void;
  compact: boolean;
}

export default function HistoryPanel({ versions, pointer, diagnostics, onGoTo, onNameVersion, compact }: Props) {
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
            {shown.map((v) => {
              const idx = v.seq; // seq croissant = index dans versions
              const active = idx === pointer;
              return (
                <button
                  key={v.seq}
                  onClick={() => onGoTo(idx)}
                  className={`flex w-full items-center gap-3 border-b border-border/40 px-3 py-1.5 text-left transition-colors ${
                    active ? 'bg-cyan-400/10' : 'hover:bg-accent'
                  }`}
                >
                  <span className={`font-mono text-[10px] ${active ? 'text-cyan-400' : 'text-muted-foreground'}`}>
                    v{v.seq}
                  </span>
                  <span className={`truncate text-xs ${active ? 'text-foreground' : 'text-foreground/70'}`}>{v.label}</span>
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
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          LOCAL · SYNCHRONISÉ
        </span>
      </div>
    </div>
  );
}
