// Commentaires partagés d'un objet (lot 8.4) : visibles par tous les membres du projet cloud,
// ajoutés par tout membre, résolus par leur auteur ou par un droit d'écriture.
import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import type { CloudRole } from '@/types/cloud';

interface Props {
  projectId: number;
  objectId: string;
  role: CloudRole;
  userId: number | null;
}

export default function ObjectComments({ projectId, objectId, role, userId }: Props) {
  const utils = trpc.useUtils();
  const list = trpc.projects.comments.useQuery({ id: projectId });
  const refresh = () => utils.projects.comments.invalidate({ id: projectId });
  const add = trpc.projects.comment.useMutation({ onSuccess: refresh });
  const resolve = trpc.projects.resolveComment.useMutation({ onSuccess: refresh });
  const [text, setText] = useState('');
  const comments = (list.data ?? []).filter(c => c.objectId === objectId);
  const canResolve = (authorId: number) => role !== 'lecture' || authorId === userId;

  return (
    <div className="space-y-1.5" data-testid="commentaires-objet">
      <p className="ui-label mb-1.5">Commentaires partagés</p>
      {list.isLoading && <p className="font-mono text-[10px] text-muted-foreground">Chargement…</p>}
      {list.error && <p className="font-mono text-[10px] text-rose-300">Commentaires indisponibles.</p>}
      {!list.isLoading && !list.error && comments.length === 0 && <p className="font-mono text-[10px] text-muted-foreground">Aucun commentaire sur {objectId}.</p>}
      {comments.map(c => (
        <div key={c.id} className={`rounded-sm border px-2 py-1.5 ${c.resolved ? 'border-border/50 opacity-60' : 'border-amber-400/40'}`}>
          <p className="whitespace-pre-wrap text-[11px] text-foreground">{c.text}</p>
          <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[9px] text-muted-foreground">
            <span>{c.authorName ?? `compte ${c.authorId}`} · {new Date(c.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            {canResolve(c.authorId) && (
              <button disabled={resolve.isPending} onClick={() => resolve.mutate({ commentId: c.id, resolved: !c.resolved })}
                className="rounded-sm border border-border px-1.5 py-0.5 uppercase hover:text-foreground">
                {c.resolved ? 'Rouvrir' : 'Résoudre'}
              </button>
            )}
          </div>
        </div>
      ))}
      <textarea aria-label="Nouveau commentaire" value={text} rows={2} onChange={e => setText(e.target.value)}
        placeholder="Commenter cet objet…"
        className="w-full rounded-sm border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground" />
      <button disabled={!text.trim() || add.isPending}
        onClick={() => add.mutate({ id: projectId, objectId, text: text.trim() }, { onSuccess: () => setText('') })}
        className="w-full rounded-sm border border-cyan-400/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50">
        Commenter
      </button>
      {add.error && <p className="font-mono text-[10px] text-rose-300">Commentaire non envoyé : {add.error.message}</p>}
    </div>
  );
}
