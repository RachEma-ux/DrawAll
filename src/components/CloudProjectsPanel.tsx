import { useState } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/providers/trpc';
import { SYNC_META, type SyncStatus } from '@/types/cloud';
import type { Project } from '@contracts/types';

interface Props {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  currentId: number | null;
  currentRevision: number | null;
  status: SyncStatus;
  projectName: string;
  setProjectName: (name: string) => void;
  conflictServer: Project | null;
  onSave: (saveAsNew: boolean) => void | Promise<void>;
  onLoad: (id: number) => void | Promise<void>;
  onDelete: (id: number) => void | Promise<void>;
  onRename: (id: number, name: string) => void | Promise<void>;
  onUseCloudVersion: () => void;
  onKeepLocalVersion: () => void;
}

export default function CloudProjectsPanel(p: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const list = trpc.projects.list.useQuery(undefined, { enabled: p.open && p.isAuthenticated });
  const meta = SYNC_META[p.status];

  if (!p.open) return null;

  const load = async (id: number) => {
    setBusyId(id);
    try { await p.onLoad(id); } finally { setBusyId(null); }
  };

  return (
    <div className="absolute inset-x-0 top-11 z-40 flex justify-center border-b border-border bg-[#050810]/95 px-4 py-3 backdrop-blur">
      <div className="w-full max-w-4xl border border-border bg-[#0c1220] shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Projets cloud</p>
            <p className="mt-0.5 text-xs text-foreground/80">
              Sauvegarde par compte Kimi, révision serveur et brouillon local explicite.
            </p>
          </div>
          <button onClick={p.onClose} className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
            Fermer
          </button>
        </div>

        {!p.isAuthenticated ? (
          <div className="flex items-center justify-between gap-4 px-4 py-5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Le dessin reste disponible comme brouillon local. Connectez-vous pour le persister en base cloud,
              le retrouver sur un autre poste et activer la détection de conflit.
            </p>
            <Link to="/login" className="shrink-0 rounded-sm border border-cyan-400/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300 hover:bg-cyan-400/10">
              Connexion Kimi
            </Link>
          </div>
        ) : (
          <div className="grid gap-0 md:grid-cols-[280px_1fr]">
            <div className="border-b border-border p-4 md:border-b-0 md:border-r">
              <p className="ui-label mb-2">État de synchronisation</p>
              <div className="rounded-sm border border-border bg-background/40 p-3">
                <span className="flex items-center gap-2 font-mono text-[11px]" style={{ color: meta.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {p.currentId ? `Projet #${p.currentId} · révision ${p.currentRevision ?? '—'}` : 'Aucune copie cloud liée à ce brouillon.'}
                </p>
              </div>

              <label className="ui-label mt-4 mb-1.5 block">Nom du projet</label>
              <input
                value={p.projectName}
                onChange={e => p.setProjectName(e.target.value)}
                className="w-full rounded-sm border border-input bg-background px-2.5 py-2 text-xs outline-none focus:border-cyan-400"
                placeholder="Nom du projet DrawAll"
              />
              <div className="mt-3 grid gap-2">
                <button
                  onClick={() => p.onSave(false)}
                  disabled={p.status === 'saving'}
                  className="rounded-sm bg-cyan-400 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#050810] transition-colors hover:bg-cyan-300 disabled:opacity-50"
                >
                  {p.currentId ? 'Synchroniser' : 'Créer dans le cloud'}
                </button>
                <button
                  onClick={() => p.onSave(true)}
                  disabled={p.status === 'saving'}
                  className="rounded-sm border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-cyan-400/50 hover:text-foreground disabled:opacity-50"
                >
                  Enregistrer comme nouveau
                </button>
              </div>

              {p.status === 'conflict' && p.conflictServer && (
                <div className="mt-4 border-l-2 border-rose-400 bg-rose-400/5 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-rose-300">Conflit détecté</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/80">
                    Le serveur est à la révision {p.conflictServer.revision}. Votre copie se base sur une révision plus ancienne.
                  </p>
                  <div className="mt-3 grid gap-1.5">
                    <button onClick={p.onUseCloudVersion} className="rounded-sm border border-cyan-400/40 px-2 py-1.5 font-mono text-[10px] text-cyan-300 hover:bg-cyan-400/10">
                      Charger la version cloud
                    </button>
                    <button onClick={p.onKeepLocalVersion} className="rounded-sm border border-amber-400/40 px-2 py-1.5 font-mono text-[10px] text-amber-300 hover:bg-amber-400/10">
                      Conserver mon état local
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {list.isLoading ? (
                <p className="p-4 text-xs text-muted-foreground">Chargement des projets…</p>
              ) : list.error ? (
                <p className="p-4 text-xs text-rose-300">Impossible de charger les projets cloud.</p>
              ) : (list.data?.length ?? 0) === 0 ? (
                <p className="p-4 text-xs leading-relaxed text-muted-foreground">
                  Aucun projet cloud pour ce compte. Créez la première révision depuis le brouillon courant.
                </p>
              ) : (
                list.data?.map(project => (
                  <div
                    key={project.id}
                    className={`mb-1.5 rounded-sm border px-3 py-2 ${
                      project.id === p.currentId ? 'border-cyan-400/50 bg-cyan-400/5' : 'border-border/70 bg-background/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => load(project.id)}
                        disabled={busyId !== null}
                        className="min-w-0 flex-1 text-left"
                        title="Charger ce projet dans l'atelier"
                      >
                        <p className="truncate text-xs font-medium text-foreground">{project.name}</p>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                          #{project.id} · révision {project.revision} · {new Date(project.updatedAt).toLocaleString('fr-FR')}
                        </p>
                      </button>
                      <button
                        onClick={() => {
                          const name = window.prompt('Renommer le projet', project.name);
                          if (name?.trim()) p.onRename(project.id, name.trim());
                        }}
                        className="rounded-sm border border-border px-2 py-1 font-mono text-[9px] uppercase text-muted-foreground hover:text-foreground"
                      >
                        Renommer
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Supprimer définitivement « ${project.name} » du cloud ?`)) p.onDelete(project.id);
                        }}
                        className="rounded-sm border border-red-400/40 px-2 py-1 font-mono text-[9px] uppercase text-red-400 hover:bg-red-400/10"
                      >
                        Suppr.
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
