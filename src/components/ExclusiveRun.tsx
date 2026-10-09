// Exécution exclusive (scripts, lot 18.2 ; assistant, lot 18.3) : tant que des commandes s'enchaînent
// hors du fil des événements, l'atelier est gelé (ni clic ni raccourci clavier). Une annulation
// rétablit l'état d'avant l'exécution : aucune modification faite entre-temps ne peut s'y perdre.
import { useEffect, type RefObject } from 'react';

export default function ExclusiveRun({ active, within }: { active: boolean; within: RefObject<HTMLElement | null> }) {
  useEffect(() => {
    if (!active) return;
    // Phase de capture sur la fenêtre : avant tout autre écouteur (raccourcis de l'atelier, palette).
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      // Dans le panneau, la frappe reste permise (zone de texte) ; ailleurs, rien ne passe.
      if (!within.current?.contains(e.target as Node)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, within]);
  if (!active) return null;
  return <div data-testid="atelier-gele" aria-hidden className="fixed inset-0 z-[60] cursor-wait bg-black/20" />;
}
