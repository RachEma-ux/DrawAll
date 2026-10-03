// Documentation — Concept produit V4 et Architecture de référence V4,
// restitués dans l'application (produit unique : outil et dossier dans le même environnement).
import { MODULES } from '@/data/requirements';
import RequirementsExplorer from './RequirementsExplorer';

interface Props { sub: 'concept' | 'architecture' | 'exigences'; focusId?: string | null }

export default function DocsView({ sub, focusId }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {sub === 'concept' && <Concept />}
      {sub === 'architecture' && <Architecture />}
      {sub === 'exigences' && <RequirementsExplorer focusId={focusId} />}
    </div>
  );
}

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-3">
      <span className="font-mono text-[10px] tracking-[0.2em] text-cyan-400">{n}</span>
      <span className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-foreground">{children}</span>
    </h2>
  );
}

function Concept() {
  return (
    <div className="space-y-8">
      <div>
        <p className="ui-label mb-2">Concept produit V4 — 3 octobre 2026</p>
        <h1 className="max-w-3xl text-2xl font-bold leading-snug">
          Un atelier web commun au bâtiment et à l'industrie.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Dessiner un bâtiment, concevoir une pièce, assembler une machine, organiser les raccordements et produire les
          documents de construction ou de fabrication — dans un même environnement. Principe fondateur :
          <span className="text-foreground"> un projet commun, des objets identifiés, plusieurs représentations métier cohérentes.</span>
        </p>
      </div>

      <div>
        <SectionTitle n="§1">Un objet, deux lectures</SectionTitle>
        <div className="panel overflow-hidden p-4">
          <svg viewBox="0 0 760 240" className="w-full">
            <defs>
              <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="#3b4a6b" />
              </marker>
            </defs>
            <rect x="260" y="20" width="240" height="64" fill="#0c1220" stroke="#22d3ee" strokeWidth="1.2" />
            <text x="380" y="44" textAnchor="middle" fill="#22d3ee" fontSize="11" fontFamily="JetBrains Mono" letterSpacing="2">MODÈLE DRAWALL</text>
            <text x="380" y="62" textAnchor="middle" fill="#8b93a7" fontSize="9" fontFamily="JetBrains Mono">objets identifiés · paramètres · relations</text>
            {[
              { x: 30, c: '#22d3ee', t: 'VUE BÂTIMENT', d: 'murs · niveaux · zones · réseaux · IFC' },
              { x: 290, c: '#34d399', t: 'VUE INDUSTRIE', d: 'pièces · tôles · assemblages · STEP' },
              { x: 550, c: '#fbbf24', t: 'VUE DOCUMENT', d: 'plans · cotes · nomenclatures' },
            ].map(v => (
              <g key={v.t}>
                <line x1={380} y1={84} x2={v.x + 90} y2={130} stroke="#3b4a6b" strokeWidth="1" markerEnd="url(#arr)" />
                <rect x={v.x} y={132} width="180" height="64" fill="#0c1220" stroke={v.c} strokeWidth="1" />
                <text x={v.x + 90} y={156} textAnchor="middle" fill={v.c} fontSize="10" fontFamily="JetBrains Mono" letterSpacing="1.5">{v.t}</text>
                <text x={v.x + 90} y={176} textAnchor="middle" fill="#8b93a7" fontSize="8.5" fontFamily="JetBrains Mono">{v.d}</text>
              </g>
            ))}
            <text x="380" y="224" textAnchor="middle" fill="#5f6b85" fontSize="9" fontFamily="JetBrains Mono">
              une modification se propage aux deux lectures et à leurs documents dérivés
            </text>
          </svg>
        </div>
      </div>

      <div>
        <SectionTitle n="§1">Cinq engagements</SectionTitle>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {[
            ['01', 'Continuité du projet', 'Objets, documents et résultats conservent leurs liens et leurs versions.'],
            ['02', 'Cohérence des gestes', 'Sélectionner, renseigner, prévisualiser, contrôler et valider suivent les mêmes principes.'],
            ['03', 'Profondeur métier', 'Les fonctions spécialisées restent disponibles avec leurs règles et paramètres propres.'],
            ['04', 'Maîtrise des modifications', "L'utilisateur comprend les éléments touchés, les conflits et les résultats à recalculer."],
            ['05', 'Ouverture contrôlée', "Les données sont exportables et les pertes d'un échange sont signalées."],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-sm border border-border bg-[#0c1220] p-3">
              <p className="font-mono text-[10px] text-cyan-400">{n}</p>
              <p className="mt-1 text-xs font-semibold">{t}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle n="§6">Dix-sept modules, une application</SectionTitle>
        <div className="grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
          {MODULES.map(m => (
            <div key={m.id} className="bg-[#0c1220] p-3">
              <p className="font-mono text-[10px] text-emerald-400">{m.id}</p>
              <p className="mt-0.5 text-xs font-medium">{m.name}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{m.responsibility}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground/70">
          Modules = responsabilités logicielles internes à la même application — jamais des éditions distinctes.
        </p>
      </div>

      <div>
        <SectionTitle n="§10">Parcours de preuve</SectionTitle>
        <div className="overflow-hidden rounded-sm border border-border">
          {[
            ['1', 'Créer le bâtiment et les niveaux', 'Plans et vues cohérents.'],
            ['2', 'Concevoir le support et ses ancrages', 'Paramètres, assemblage et cotations correctement liés.'],
            ['3', "Implanter l'ensemble", "Identité de l'équipement conservée entre produit et implantation."],
            ['4', "Concevoir l'armoire et les raccordements", 'Représentations mécaniques et électriques coordonnées.'],
            ['5', 'Modifier une dimension déterminante', 'Dépendances affectées identifiées ; résultats périmés signalés.'],
            ['6', 'Régénérer et contrôler les livrables', 'Plans et nomenclatures issus de la bonne révision.'],
            ['7', 'Publier le dossier', 'Ensemble cohérent, reproductible et traçable.'],
          ].map(([n, a, pr]) => (
            <div key={n} className="flex items-baseline gap-3 border-b border-border/40 px-3 py-2 last:border-0 hover:bg-accent/40">
              <span className="font-mono text-[10px] text-cyan-400">{n}</span>
              <span className="w-64 shrink-0 text-xs font-medium">{a}</span>
              <span className="text-[11px] text-muted-foreground">{pr}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle n="§12">Développement par étapes</SectionTitle>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['P0', 'Faisabilité', 'Géométrie, contraintes, dépendances, import et interface.', '#f87171'],
            ['P1', 'Socle universel', 'Dessin, pièces, assemblages simples, bâtiment essentiel, documents et versions.', '#34d399'],
            ['P2', 'Approfondissement', 'Structure, bois, tôlerie, réseaux, surfaces et coordination.', '#fbbf24'],
            ['P3', 'Ingénierie avancée', 'Électricité complète, PCB, calculs, FAO et production.', '#e879f9'],
          ].map(([p, t, d, c]) => (
            <div key={p} className="rounded-sm border border-border bg-[#0c1220] p-3" style={{ borderTop: `2px solid ${c}` }}>
              <p className="font-mono text-sm font-semibold" style={{ color: c }}>{p}</p>
              <p className="mt-0.5 text-xs font-medium">{t}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Architecture() {
  return (
    <div className="space-y-8">
      <div>
        <p className="ui-label mb-2">Architecture de référence V4</p>
        <h1 className="max-w-3xl text-2xl font-bold leading-snug">Continuité des données, modularité, fiabilité des modifications.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Architecture cible proposée, à éprouver par les prototypes P0 et P1. Arbitrages normatifs : décisions D1–D6
          de l'annexe D du document Exigences et sources.
        </p>
      </div>

      <div>
        <SectionTitle n="§2">Architecture logique</SectionTitle>
        <div className="panel overflow-hidden p-4">
          <svg viewBox="0 0 760 300" className="w-full">
            <defs>
              <marker id="arr2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="#3b4a6b" />
              </marker>
            </defs>
            {[
              { x: 30, y: 20, w: 200, t: 'CLIENT', d: 'interface · aperçus · calcul local', c: '#22d3ee' },
              { x: 300, y: 20, w: 200, t: 'API COMMANDES', d: 'synchronisation · intentions', c: '#22d3ee' },
              { x: 300, y: 120, w: 200, t: 'AUTORITÉ DU PROJET', d: 'droits · règles · versions', c: '#fbbf24' },
              { x: 30, y: 120, w: 200, t: 'MOTEURS ISOLÉS', d: 'géométrie · contraintes', c: '#34d399' },
              { x: 560, y: 120, w: 180, t: 'TRAVAUX', d: 'traduction · analyse · fabrication', c: '#34d399' },
              { x: 180, y: 220, w: 180, t: 'OBJETS MÉTIER', d: 'identités · relations', c: '#8b93a7' },
              { x: 420, y: 220, w: 180, t: 'VOLUMES IMMUABLES', d: 'géométrie · résultats', c: '#8b93a7' },
            ].map(n => (
              <g key={n.t}>
                <rect x={n.x} y={n.y} width={n.w} height="56" fill="#0c1220" stroke={n.c} strokeWidth="1" />
                <text x={n.x + n.w / 2} y={n.y + 22} textAnchor="middle" fill={n.c} fontSize="9.5" fontFamily="JetBrains Mono" letterSpacing="1">{n.t}</text>
                <text x={n.x + n.w / 2} y={n.y + 40} textAnchor="middle" fill="#8b93a7" fontSize="8.5" fontFamily="JetBrains Mono">{n.d}</text>
              </g>
            ))}
            {[
              [130, 76, 130, 120], [230, 48, 300, 48], [400, 76, 400, 120],
              [300, 148, 230, 148], [500, 148, 560, 148], [360, 176, 290, 220], [440, 176, 490, 220],
            ].map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b4a6b" strokeWidth="1" markerEnd="url(#arr2)" />
            ))}
          </svg>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Une opération peut disposer d'un aperçu local puis d'une validation serveur ; la différence entre aperçu et
          résultat validé reste visible. Les processus de calcul peuvent être interrompus ou redémarrés sans corrompre le projet.
        </p>
      </div>

      <div>
        <SectionTitle n="D">Décisions normatives — annexe D</SectionTitle>
        <div className="overflow-hidden rounded-sm border border-border">
          {[
            ['D1', 'Noyau', 'occt-wasm comme noyau de référence du prototype ; vigilance licence LGPL ; une seule géométrie canonique par objet.'],
            ['D2', 'Rendu', 'WebGL2 par défaut, WebGPU activable avec repli automatique ; budget de trame p95 ≤ 16,7 ms.'],
            ['D3', 'Collaboration', 'CRDT (Yjs/Automerge) pour texte et métadonnées légères ; réservation/branches avec fusion validée pour la géométrie.'],
            ['D4', 'Assistant IA', 'Boucle contrôlée : séquence inspectable → validation déterministe → aperçu → exécution après accord ; auto-correction bornée à trois itérations.'],
            ['D5', 'Interopérabilité', 'IFC 4.3 (ISO 16739-1:2024) validé en continu ; STEP AP242 Éd.3 dès P2 ; connecteurs objets-en-flux.'],
            ['D6', 'Points à mesurer en P0', 'Contraintes WASM 32 bits ; plafonds mémoire GPU (streaming LOD = exigence) ; cadcore/CADara en veille uniquement.'],
          ].map(([id, t, d]) => (
            <div key={id} className="flex gap-3 border-b border-border/40 px-3 py-2.5 last:border-0 hover:bg-accent/40">
              <span className="font-mono text-[10px] font-semibold text-amber-400">{id}</span>
              <span className="w-32 shrink-0 text-xs font-medium">{t}</span>
              <span className="text-[11px] leading-relaxed text-muted-foreground">{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle n="§6">Cycle transactionnel d'une commande</SectionTitle>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['1', 'Intention', 'commande, contrat, paramètres, cibles, révision de départ'],
            ['2', 'Vérifications', 'autorisations, unités, types, préconditions'],
            ['3', 'Résultat provisoire', 'produit sur un instantané cohérent'],
            ['4', 'Évaluation', 'contraintes, références, dépendances, conflits présentés'],
            ['5', 'Transaction', 'changements métier + références vers volumes immuables'],
            ['6', 'Événements', 'travaux dérivés enregistrés sans intervalle non notifié'],
            ['7', 'Diffusion', 'état validé reçu ; vues actualisées ou marquées à recalculer'],
            ['⟳', 'Idempotence', 'une requête répétée ne produit qu’une modification validée'],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-sm border border-border bg-[#0c1220] p-3">
              <p className="font-mono text-[10px] text-cyan-400">{n}</p>
              <p className="mt-0.5 text-xs font-medium">{t}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle n="§9">Données et stockage</SectionTitle>
        <div className="overflow-hidden rounded-sm border border-border">
          {[
            ['Identités, propriétés, relations, révisions', 'PostgreSQL — colonnes typées, JSONB validé', 'Données métier validées et contraintes d’intégrité'],
            ['Géométrie, scans, résultats volumineux', 'Stockage objet immuable', 'Références identifiées depuis les révisions métier'],
            ['Recherche et navigation', 'Index et caches dérivés', 'Reconstructibles — ne remplacent pas les données métier'],
            ['Événements et travaux', 'File de travaux + outbox transactionnelle', 'Traitement idempotent, progression et reprise explicites'],
            ['Travail navigateur', 'IndexedDB / OPFS', 'Cache et commandes locales, état de synchronisation visible'],
          ].map(([a, b, c]) => (
            <div key={a} className="flex flex-wrap gap-3 border-b border-border/40 px-3 py-2.5 last:border-0 hover:bg-accent/40">
              <span className="w-64 shrink-0 text-xs font-medium">{a}</span>
              <span className="w-64 shrink-0 font-mono text-[10px] text-emerald-400">{b}</span>
              <span className="min-w-48 flex-1 text-[11px] text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
