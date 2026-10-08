import { useState } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/providers/trpc';
import { ROLE_LABEL, SYNC_META, shareUrl, type CloudRole, type SyncStatus } from '@/types/cloud';
import type { Project } from '@contracts/types';

interface Props {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  currentId: number | null;
  currentRevision: number | null;
  /** Droit sur le projet ouvert (lot 8.4). */
  currentRole: CloudRole | null;
  userId: number | null;
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
  /** Le compte a quitté le projet partagé ouvert. */
  onLeave?: () => void;
}

/**
 * Partage du projet ouvert (lot 8.4) : le propriétaire crée des liens en lecture ou en écriture,
 * change ou retire un droit ; un membre voit les participants et peut quitter le projet.
 */
function SharePanel({ projectId, role, userId, onLeft }: { projectId: number; role: CloudRole; userId: number | null; onLeft: () => void }) {
  const utils = trpc.useUtils();
  const members = trpc.projects.members.useQuery({ id: projectId });
  const refresh = () => utils.projects.members.invalidate({ id: projectId });
  const share = trpc.projects.share.useMutation();
  const setRole = trpc.projects.setMemberRole.useMutation({ onSuccess: refresh });
  const remove = trpc.projects.removeMember.useMutation({ onSuccess: refresh });
  const [link, setLink] = useState<{ role: 'lecture' | 'ecriture'; url: string; expiresAt: Date } | null>(null);
  const owner = role === 'proprietaire';

  const createLink = async (r: 'lecture' | 'ecriture') => {
    const invite = await share.mutateAsync({ id: projectId, role: r });
    const url = shareUrl(invite.token);
    setLink({ role: r, url, expiresAt: new Date(invite.expiresAt) });
    try { await navigator.clipboard.writeText(url); } catch { /* copie manuelle depuis le champ */ }
  };

  return (
    <div className="mt-4 rounded-sm border border-border bg-background/40 p-3" data-testid="partage">
      <p className="ui-label mb-2">Partage</p>
      {owner && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => void createLink('lecture')} disabled={share.isPending}
              className="rounded-sm border border-border px-2 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50">
              Lien lecture
            </button>
            <button onClick={() => void createLink('ecriture')} disabled={share.isPending}
              className="rounded-sm border border-cyan-400/40 px-2 py-1.5 font-mono text-[10px] text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50">
              Lien écriture
            </button>
          </div>
          {link && (
            <div className="mt-2">
              <input readOnly aria-label="Lien d'invitation" value={link.url} onFocus={e => e.currentTarget.select()}
                className="w-full rounded-sm border border-input bg-background px-2 py-1 font-mono text-[10px]" />
              <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                Droit {ROLE_LABEL[link.role].toLowerCase()} · valable jusqu’au {link.expiresAt.toLocaleDateString('fr-FR')} · à transmettre à la personne invitée.
              </p>
            </div>
          )}
          {share.error && <p className="mt-1 font-mono text-[10px] text-rose-300">Lien non créé : {share.error.message}</p>}
        </>
      )}
      <p className="ui-label mt-3 mb-1">Membres</p>
      {members.isLoading ? (
        <p className="font-mono text-[10px] text-muted-foreground">Chargement…</p>
      ) : (members.data?.length ?? 0) === 0 ? (
        <p className="font-mono text-[10px] text-muted-foreground">Aucun membre : projet non partagé.</p>
      ) : (
        members.data!.map(m => (
          <div key={m.userId} className="flex items-center gap-1.5 py-0.5 text-[11px]">
            <span className="min-w-0 flex-1 truncate">{m.name ?? `compte ${m.userId}`}</span>
            {owner ? (
              <select aria-label={`Droit de ${m.name ?? m.userId}`} value={m.role}
                onChange={e => setRole.mutate({ id: projectId, userId: m.userId, role: e.target.value as 'lecture' | 'ecriture' })}
                className="rounded-sm border border-input bg-background px-1 py-0.5 text-[10px]">
                <option value="lecture">Lecture</option>
                <option value="ecriture">Écriture</option>
              </select>
            ) : (
              <span className="font-mono text-[9px] uppercase text-muted-foreground">{ROLE_LABEL[m.role]}</span>
            )}
            {(owner || m.userId === userId) && (
              <button
                onClick={() => {
                  const self = m.userId === userId;
                  if (!window.confirm(self ? 'Quitter ce projet partagé ?' : `Retirer l’accès de ${m.name ?? `compte ${m.userId}`} ?`)) return;
                  remove.mutate({ id: projectId, userId: m.userId }, { onSuccess: () => { if (self) { void utils.projects.list.invalidate(); onLeft(); } } });
                }}
                className="rounded-sm border border-red-400/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-red-400 hover:bg-red-400/10">
                {m.userId === userId ? 'Quitter' : 'Retirer'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default function CloudProjectsPanel(p: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const list = trpc.projects.list.useQuery(undefined, { enabled: p.open && p.isAuthenticated });
  const meta = SYNC_META[p.status];
  const readOnly = p.currentId !== null && p.currentRole === 'lecture';

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
                {p.currentId !== null && p.currentRole && (
                  <p data-testid="droit-projet" className="mt-1 font-mono text-[10px] text-cyan-300">
                    Droit : {ROLE_LABEL[p.currentRole]}{readOnly ? ' — lecture seule, synchronisation désactivée' : ''}
                  </p>
                )}
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
                  disabled={p.status === 'saving' || readOnly}
                  title={readOnly ? 'Projet partagé en lecture seule' : undefined}
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

              {p.currentId !== null && p.currentRole && (
                <SharePanel projectId={p.currentId} role={p.currentRole} userId={p.userId} onLeft={() => p.onLeave?.()} />
              )}

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
                      <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase ${project.role === 'proprietaire' ? 'border-border text-muted-foreground' : 'border-cyan-400/40 text-cyan-300'}`}>
                        {project.role === 'proprietaire' ? 'Le mien' : `Partagé · ${ROLE_LABEL[project.role]}`}
                      </span>
                      {project.role === 'proprietaire' && <>
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
                      </>}
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
