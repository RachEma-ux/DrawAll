// DrawAll v4.1 — application unique : atelier de dessin + documentation du dossier.
// Cinq repères permanents (UX1) : navigateur, zone de travail, commandes, inspecteur,
// panneau des modifications/problèmes.
import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import Navigator from '@/components/Navigator';
import CanvasView, { type ToolId } from '@/components/CanvasView';
import Inspector from '@/components/Inspector';
import HistoryPanel from '@/components/HistoryPanel';
import CommandPalette, { type Command } from '@/components/CommandPalette';
import DocsView from '@/docs/DocsView';
import { useProject } from '@/store/project';
import type { DisplayLevel, ViewReading } from '@/types/cad';
import { fmt } from '@/types/cad';

const TOOLS: { id: ToolId; label: string; key: string; levels: DisplayLevel[]; hint: string }[] = [
  { id: 'select', label: 'Sélection', key: 'V', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Sélectionner et déplacer' },
  { id: 'line', label: 'Ligne', key: 'L', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Deux points accrochés à la grille' },
  { id: 'rect', label: 'Rectangle', key: 'R', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Par deux coins opposés' },
  { id: 'circle', label: 'Cercle', key: 'C', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Centre puis rayon' },
  { id: 'polyline', label: 'Polyligne', key: 'P', levels: ['contextuel', 'complet'], hint: 'Points successifs — Entrée ou double-clic pour terminer' },
  { id: 'pan', label: 'Panoramique', key: 'H', levels: ['contextuel', 'complet'], hint: 'Déplacer la vue (molette : zoom)' },
];

export default function App() {
  const project = useProject();
  const [mode, setMode] = useState<'atelier' | 'docs'>('atelier');
  const [docsSub, setDocsSub] = useState<'concept' | 'architecture' | 'exigences'>('concept');
  const [focusReq, setFocusReq] = useState<string | null>(null);
  const [level, setLevel] = useState<DisplayLevel>('contextuel');
  const [view, setView] = useState<ViewReading>('batiment');
  const [tool, setTool] = useState<ToolId>('select');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  const selected = project.objects.find(o => o.id === project.selectedId) ?? null;

  const exportPackage = useCallback(() => {
    const pkg = {
      manifest: { format: 'drawall-package', version: '0.1.0-prototype', exportedAt: new Date().toISOString() },
      projet: { revision: project.current.seq, versions: project.versions.length },
      unites: 'millimetre',
      objets: project.objects,
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'drawall-projet.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [project]);

  const openRequirement = useCallback((id: string) => {
    setFocusReq(id);
    setDocsSub('exigences');
    setMode('docs');
  }, []);

  const commands: Command[] = [
    ...TOOLS.map(t => ({
      id: `tool-${t.id}`,
      title: `Outil ${t.label}`,
      hint: `${t.hint} · raccourci ${t.key}`,
      keywords: {
        select: ['selection', 'selectionner', 'fleche', 'move', 'deplacer'],
        line: ['ligne', 'trait', 'segment', 'line'],
        rect: ['rectangle', 'cadre', 'box', 'rect'],
        circle: ['cercle', 'arc', 'circle', 'rond'],
        polyline: ['polyligne', 'polyline', 'contour', 'profil'],
        pan: ['panoramique', 'pan', 'deplacer la vue', 'main', 'hand'],
      }[t.id],
      run: () => { setMode('atelier'); setTool(t.id); },
    })),
    { id: 'view-bat', title: 'Basculer en lecture bâtiment', hint: 'Vue bâtiment — murs, niveaux, zones (Concept §1)', keywords: ['batiment', 'architecture', 'vue'], run: () => { setMode('atelier'); setView('batiment'); } },
    { id: 'view-ind', title: 'Basculer en lecture industrie', hint: 'Vue industrie — pièces, tôles, assemblages (Concept §1)', keywords: ['industrie', 'mecanique', 'tole', 'vue'], run: () => { setMode('atelier'); setView('industrie'); } },
    { id: 'undo', title: 'Annuler', hint: 'Revenir à la microversion précédente', keywords: ['annuler', 'undo', 'ctrl+z'], run: project.undo },
    { id: 'redo', title: 'Rétablir', hint: 'Revenir à la microversion suivante', keywords: ['retablir', 'redo'], run: project.redo },
    { id: 'export', title: 'Exporter le paquet du projet', hint: 'Manifeste versionné + objets + unités (JSON)', keywords: ['exporter', 'export', 'paquet', 'sauvegarder', 'json'], run: exportPackage },
    { id: 'docs-concept', title: 'Documentation — Concept produit', hint: 'Vision, engagements, parcours de preuve', keywords: ['concept', 'vision', 'documentation', 'aide'], run: () => { setDocsSub('concept'); setMode('docs'); } },
    { id: 'docs-arch', title: "Documentation — Architecture de référence", hint: 'Contrats, transactions, décisions D1–D6', keywords: ['architecture', 'contrats', 'transactions'], run: () => { setDocsSub('architecture'); setMode('docs'); } },
    { id: 'docs-req', title: 'Documentation — 324 exigences', hint: 'Annexe B : traçabilité intégrale DA-01-01 → DA-22-10', keywords: ['exigences', 'requirements', 'annexe', 'tracabilite'], run: () => { setDocsSub('exigences'); setMode('docs'); } },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); return; }
      if (paletteOpen || mode !== 'atelier') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) project.redo(); else project.undo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && project.selectedId) { project.removeObject(project.selectedId); return; }
      const t = TOOLS.find(t => t.key.toLowerCase() === e.key.toLowerCase());
      if (t && t.levels.includes(level)) setTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, mode, level, project]);

  const visibleTools = TOOLS.filter(t => t.levels.includes(level));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        mode={mode} setMode={setMode}
        level={level} setLevel={setLevel}
        view={view} setView={setView}
        canUndo={project.canUndo} canRedo={project.canRedo}
        onUndo={project.undo} onRedo={project.redo}
        onPalette={() => setPaletteOpen(true)}
        onExport={exportPackage}
        onReset={() => { if (confirm('Réinitialiser le projet au démonstrateur initial ? Les microversions locales seront effacées.')) project.reset(); }}
        versionLabel={`révision v${project.current.seq}`}
      />

      {mode === 'docs' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-1 border-b border-border bg-[#0c1220]/60 px-6 py-1.5">
            {([
              ['concept', 'Concept produit'],
              ['architecture', 'Architecture de référence'],
              ['exigences', 'Exigences — 324 entrées + T01–T20'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => { setDocsSub(id); setFocusReq(null); }}
                className={`rounded-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
                  docsSub === id ? 'bg-accent text-cyan-300' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DocsView sub={docsSub} focusId={focusReq} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Navigateur — repère permanent 1 */}
          <aside className="w-56 shrink-0">
            <Navigator objects={project.objects} selectedId={project.selectedId} onSelect={project.setSelectedId} />
          </aside>

          {/* Zone de travail + commandes — repères permanents 2 et 3 */}
          <main className="flex min-w-0 flex-1 flex-col border-l border-border">
            <div className="flex shrink-0 items-center gap-1 border-b border-border bg-[#0c1220]/60 px-2 py-1">
              {visibleTools.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  title={`${t.hint} (${t.key})`}
                  className={`rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                    tool === t.id ? 'bg-cyan-400 text-[#050810]' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {t.label} <span className="opacity-50">{t.key}</span>
                </button>
              ))}
              <span className="ml-3 hidden font-mono text-[9px] text-muted-foreground/60 md:inline">
                {tool === 'polyline' ? 'Cliquez les points — Entrée/double-clic pour valider, Échap pour annuler' :
                 tool === 'select' ? 'Cliquez un objet pour le sélectionner, glissez pour le déplacer, Suppr pour l’effacer' :
                 tool === 'pan' ? 'Glissez pour déplacer la vue' :
                 'Cliquez-glissez : l’aperçu précède la validation (UX3)'}
              </span>
              <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                accrochage grille 10 mm
              </span>
            </div>

            <div className="min-h-0 flex-1">
              <CanvasView
                objects={project.objects}
                tool={tool}
                view={view}
                selectedId={project.selectedId}
                onSelect={project.setSelectedId}
                onAdd={project.addObject}
                onMove={(id, patch) => project.updateObject(id, patch, 'Déplacer')}
                onCursor={(x, y) => setCursor({ x, y })}
                onZoomChange={() => {}}
              />
            </div>

            {/* Panneau des modifications / problèmes — repère permanent 5 */}
            <div className="h-44 shrink-0 border-t border-border">
              <HistoryPanel
                versions={project.versions}
                pointer={project.pointer}
                diagnostics={project.diagnostics}
                onGoTo={project.goTo}
                onNameVersion={project.nameVersion}
                compact={level === 'essentiel'}
              />
            </div>

            {/* Barre d'état */}
            <div className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-[#0c1220]/90 px-3 font-mono text-[10px] text-muted-foreground">
              <span className="text-cyan-400">
                {cursor.x === null ? '—' : `X ${fmt(cursor.x)} mm`} · {cursor.y === null ? '—' : `Y ${fmt(cursor.y)} mm`}
              </span>
              <span>{project.objects.length} objet{project.objects.length > 1 ? 's' : ''}</span>
              <span>v{project.current.seq}{project.current.named ? ` · ${project.current.named}` : ''}</span>
              <span className="ml-auto">unités : millimètre · référentiel : local projet</span>
            </div>
          </main>

          {/* Inspecteur — repère permanent 4 */}
          <aside className="w-64 shrink-0 border-l border-border">
            <Inspector
              obj={selected}
              view={view}
              level={level}
              onUpdate={project.updateObject}
              onRemove={project.removeObject}
            />
          </aside>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} onOpenRequirement={openRequirement} />
    </div>
  );
}
