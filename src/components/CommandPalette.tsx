// Palette de commandes commune (UX2) : outils, actions, objets, paramètres et aide.
// Accepte les synonymes courants et les termes issus d'autres logiciels.
import { useEffect, useMemo, useRef, useState } from 'react';
import { REQUIREMENTS, MODULES, CATEGORIES } from '@/data/requirements';

export interface Command {
  id: string;
  title: string;
  hint: string;
  keywords: string[];
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  onOpenRequirement: (id: string) => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function CommandPalette({ open, onClose, commands, onOpenRequirement }: Props) {
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const nq = norm(q.trim());
    const cmds = commands
      .filter(c => !nq || norm(c.title + ' ' + c.keywords.join(' ')).includes(nq))
      .slice(0, 7)
      .map(c => ({ type: 'command' as const, id: c.id, title: c.title, hint: c.hint, run: c.run }));
    if (!nq) return cmds;
    const reqs = REQUIREMENTS
      .filter(r => norm(`${r.id} ${r.label}`).includes(nq))
      .slice(0, 6)
      .map(r => ({
        type: 'requirement' as const,
        id: r.id,
        title: `${r.id} — ${r.label}`,
        hint: `${r.module} · ${r.step} · ${CATEGORIES.find(c => c.num === r.category)?.name ?? ''}`,
        run: () => onOpenRequirement(r.id),
      }));
    const mods = MODULES
      .filter(m => norm(`${m.id} ${m.name}`).includes(nq))
      .slice(0, 3)
      .map(m => ({ type: 'module' as const, id: m.id, title: `${m.id} — ${m.name}`, hint: m.responsibility, run: () => onOpenRequirement(m.id) }));
    return [...cmds, ...reqs, ...mods];
  }, [q, commands, onOpenRequirement]);

  const activeIndex = Math.min(index, Math.max(0, results.length - 1));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[12vh]" onClick={onClose}>
      <div className="panel w-[560px] max-w-[92vw] overflow-hidden shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <span className="font-mono text-xs text-cyan-400">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setIndex(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
              if (e.key === 'Enter' && results[activeIndex]) { results[activeIndex].run(); onClose(); }
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Rechercher un outil, une exigence (DA-07-10), un module (M05)…"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="max-h-[46vh] overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={r.type + r.id}
              onClick={() => { r.run(); onClose(); }}
              onMouseEnter={() => setIndex(i)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === activeIndex ? 'bg-cyan-400/10' : ''}`}
            >
              <span className={`font-mono text-[9px] uppercase tracking-[0.12em] ${
                r.type === 'command' ? 'text-cyan-400' : r.type === 'requirement' ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {r.type === 'command' ? 'Action' : r.type === 'requirement' ? 'Exigence' : 'Module'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs text-foreground">{r.title}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{r.hint}</span>
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Aucun résultat — la palette accepte les synonymes courants et les termes d'autres logiciels.
            </p>
          )}
        </div>
        <div className="flex justify-between border-t border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60">
          <span>↑↓ naviguer · ↵ exécuter · esc fermer</span>
          <span>324 exigences · 17 modules indexés</span>
        </div>
      </div>
    </div>
  );
}
