// Exécution de commandes l'une après l'autre hors du fil des événements (scripts, lot 18.2 ;
// assistant, lot 18.3) : chaque commande attend le rendu qui suit la précédente, de sorte qu'elle
// voie l'état du projet laissé par celle-ci.
import { useCallback, useEffect, useRef } from 'react';
import type { useProject } from '@/store/project';

export type Project = ReturnType<typeof useProject>;

export function useCommandRunner(project: Project) {
  const projectRef = useRef(project);
  const waiters = useRef<(() => void)[]>([]);
  useEffect(() => {
    projectRef.current = project;
    const w = waiters.current;
    waiters.current = [];
    w.forEach(f => f());
  }, [project]);

  /** Exécute une commande par son nom ; une commande refusée lève une erreur avec sa raison. */
  const exec = useCallback(async (type: string, args: unknown[]) => {
    const rendered = new Promise<void>(r => { waiters.current.push(r); });
    const r = projectRef.current.execute(type, args);
    // Une commande acceptée ou refusée par sa validation est journalisée : un rendu suit. Une commande
    // inconnue, non ouverte aux scripts ou mal appelée n'est pas journalisée : aucun rendu n'est attendu.
    if (r.ok || r.journaled) await rendered;
    if (!r.ok) throw new Error(r.error);
    return r.result;
  }, []);

  return { projectRef, exec };
}
