// Explorateur des 324 exigences candidates (annexe B) + exigences transversales T01–T20.
// Recherche plein texte, filtres par module M01–M17 et étape cible P1–P3.
import { useEffect, useMemo, useRef, useState } from 'react';
import { REQUIREMENTS, MODULES, TRANSVERSE } from '@/data/requirements';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

interface Props { focusId?: string | null }

export default function RequirementsExplorer({ focusId }: Props) {
  const [q, setQ] = useState('');
  const [mod, setMod] = useState<string>('all');
  const [step, setStep] = useState<string>('all');
  const focusRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!focusId) return;
    const req = REQUIREMENTS.find(r => r.id === focusId);
    if (req) { setQ(focusId); setMod('all'); setStep('all'); }
    const mod = MODULES.find(m => m.id === focusId);
    if (mod) { setMod(focusId); setQ(''); setStep('all'); }
    setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }, [focusId]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return REQUIREMENTS.filter(r =>
      (mod === 'all' || r.module === mod) &&
      (step === 'all' || r.step === step) &&
      (!nq || norm(`${r.id} ${r.label} ${r.interpretation ?? ''}`).includes(nq))
    );
  }, [q, mod, step]);

  const counts = useMemo(() => ({
    P1: REQUIREMENTS.filter(r => r.step === 'P1').length,
    P2: REQUIREMENTS.filter(r => r.step === 'P2').length,
    P3: REQUIREMENTS.filter(r => r.step === 'P3').length,
  }), []);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-5">
        {[
          ['324', 'exigences candidates DA'],
          ['22', "catégories d'origine"],
          [String(counts.P1), 'étape P1 — socle universel'],
          [String(counts.P2), 'étape P2 — approfondissement'],
          [String(counts.P3), 'étape P3 — ingénierie avancée'],
        ].map(([v, l]) => (
          <div key={l} className="bg-[#0c1220] px-4 py-3">
            <p className="font-mono text-xl font-semibold text-cyan-300">{v}</p>
            <p className="ui-label mt-1">{l}</p>
          </div>
        ))}
      </div>

      <p className="border-l-2 border-amber-400 bg-amber-400/5 px-3 py-2 text-xs leading-relaxed text-amber-200/90">
        Statut : aucune ligne ne constitue une fonction déjà implémentée. Chaque entrée doit recevoir une fiche de capacité
        avant développement ; une correspondance documentaire n'est ni une équivalence avec un produit tiers, ni un indicateur d'avancement.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Rechercher (ex. stairs, DA-07-10, soudure…)"
          className="w-64 rounded-sm border border-input bg-[#0c1220] px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400"
        />
        <select value={mod} onChange={e => setMod(e.target.value)}
          className="rounded-sm border border-input bg-[#0c1220] px-2 py-1.5 font-mono text-xs outline-none focus:border-cyan-400">
          <option value="all">Tous les modules</option>
          {MODULES.map(m => <option key={m.id} value={m.id}>{m.id} — {m.name}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-sm border border-border">
          {['all', 'P1', 'P2', 'P3'].map(s => (
            <button key={s} onClick={() => setStep(s)}
              className={`px-2.5 py-1.5 font-mono text-[10px] ${step === s ? 'bg-cyan-400 text-[#050810]' : 'text-muted-foreground hover:text-foreground'}`}>
              {s === 'all' ? 'P1–P3' : s}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{filtered.length} / 324</span>
      </div>

      <div className="overflow-hidden rounded-sm border border-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-[#0c1220]">
              <th className="ui-label px-3 py-2 font-normal">ID</th>
              <th className="ui-label px-3 py-2 font-normal">Libellé (inventaire consolidé)</th>
              <th className="ui-label px-3 py-2 font-normal">Module</th>
              <th className="ui-label px-3 py-2 font-normal">Étape</th>
              <th className="ui-label hidden px-3 py-2 font-normal lg:table-cell">Interprétation</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map(r => (
              <tr key={r.id} ref={r.id === focusId ? focusRef : undefined}
                className={`border-b border-border/40 ${r.id === focusId ? 'bg-cyan-400/10' : 'hover:bg-accent/40'}`}>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[10px] text-cyan-400">{r.id}</td>
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">{r.module}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-sm px-1.5 py-px font-mono text-[9px] ${
                    r.step === 'P1' ? 'bg-emerald-400/10 text-emerald-400' : r.step === 'P2' ? 'bg-amber-400/10 text-amber-400' : 'bg-fuchsia-400/10 text-fuchsia-300'
                  }`}>{r.step}</span>
                </td>
                <td className="hidden px-3 py-1.5 text-[11px] text-muted-foreground lg:table-cell">{r.interpretation ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <p className="bg-[#0c1220] px-3 py-2 text-center font-mono text-[10px] text-muted-foreground">
            200 premiers résultats affichés — affinez la recherche.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-foreground">Exigences transversales T01–T20</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {TRANSVERSE.map(t => (
            <div key={t.id} className="rounded-sm border border-border bg-[#0c1220] p-3">
              <p className="font-mono text-[10px] text-amber-400">{t.id}</p>
              <p className="mt-0.5 text-xs font-medium">{t.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t.proof}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-sm border border-border bg-[#0c1220] p-4">
        <p className="ui-label mb-2">Exemple de fiche initiale — DA-07-10 · Escaliers · M05 · P2</p>
        <div className="grid gap-x-6 gap-y-1.5 text-xs md:grid-cols-2">
          {[
            ['Situation', 'Relier deux niveaux par un escalier droit paramétrique.'],
            ['Entrées', 'Niveaux bas/haut, largeur, nombre de contremarches ou hauteur cible, emprise et paliers ; unités explicites.'],
            ['Comportement', 'Calculer une proposition compatible ; afficher les valeurs retenues et les contradictions.'],
            ['Dépendances', 'M03 contraintes, M02 géométrie, M11 vues et quantités ; coordination explicite des objets hébergés.'],
            ['Modification', "Changer l'altitude du niveau supérieur ; recalculer ou signaler sans déplacer silencieusement les objets adjacents."],
            ['Recette', 'Somme des hauteurs, continuité géométrique, emprise, références des vues et état des documents après modification.'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
              <span className="leading-relaxed text-foreground/80">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
