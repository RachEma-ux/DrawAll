// DrawAll v4.1 — application unique : atelier de dessin + documentation du dossier.
// Cinq repères permanents (UX1) : navigateur, zone de travail, commandes, inspecteur,
// panneau des modifications/problèmes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Route, Routes } from 'react-router';
import CloudProjectsPanel from '@/components/CloudProjectsPanel';
import Header from '@/components/Header';
import Navigator from '@/components/Navigator';
import CanvasView, { type ToolId } from '@/components/CanvasView';
import Inspector from '@/components/Inspector';
import HistoryPanel from '@/components/HistoryPanel';
import CommandPalette, { type Command } from '@/components/CommandPalette';
import DocsView from '@/docs/DocsView';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { useProject } from '@/store/project';
import type { DisplayLevel, ViewReading } from '@/types/cad';
import { SYNC_META, type SyncStatus } from '@/types/cloud';
import type { Project } from '@contracts/types';
import { fmt } from '@/types/cad';
import { exportToDxf, parseDxf } from '@/lib/dxf';
import type { SnapPoint } from '@/lib/geometry';

const TOOLS: { id: ToolId; label: string; key: string; levels: DisplayLevel[]; hint: string }[] = [
  { id: 'select', label: 'Sélection', key: 'V', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Sélectionner et déplacer' },
  { id: 'line', label: 'Ligne', key: 'L', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Deux points accrochés à la grille' },
  { id: 'rect', label: 'Rectangle', key: 'R', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Par deux coins opposés' },
  { id: 'circle', label: 'Cercle', key: 'C', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Centre puis rayon' },
  { id: 'polyline', label: 'Polyligne', key: 'P', levels: ['contextuel', 'complet'], hint: 'Points successifs — Entrée ou double-clic pour terminer' },
  { id: 'dimension', label: 'Cote', key: 'D', levels: ['contextuel', 'complet'], hint: 'Cliquez un objet pour créer une cote associative' },
  { id: 'measure', label: 'Mesure', key: 'M', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Cliquez-glissez pour mesurer une distance' },
  { id: 'block', label: 'Bloc', key: 'B', levels: ['contextuel', 'complet'], hint: 'Cliquez pour insérer le bloc actif' },
  { id: 'pan', label: 'Panoramique', key: 'H', levels: ['contextuel', 'complet'], hint: 'Déplacer la vue (molette : zoom)' },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Workbench />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function Workbench() {
  const project = useProject();
  const auth = useAuth();
  const utils = trpc.useUtils();
  const createCloudProject = trpc.projects.create.useMutation();
  const saveCloudProject = trpc.projects.save.useMutation();
  const renameCloudProject = trpc.projects.rename.useMutation();
  const deleteCloudProject = trpc.projects.remove.useMutation();
  const skipDirtyTracking = useRef(false);
  const [mode, setMode] = useState<'atelier' | 'docs'>('atelier');
  const [docsSub, setDocsSub] = useState<'concept' | 'architecture' | 'exigences'>('concept');
  const [focusReq, setFocusReq] = useState<string | null>(null);
  const [level, setLevel] = useState<DisplayLevel>('contextuel');
  const [view, setView] = useState<ViewReading>('batiment');
  const [tool, setTool] = useState<ToolId>('select');
  const [activeBlockId, setActiveBlockId] = useState<string | null>('BLQ-0001');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cursor, setCursor] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudProjectId, setCloudProjectId] = useState<number | null>(null);
  const [cloudRevision, setCloudRevision] = useState<number | null>(null);
  const [cloudName, setCloudName] = useState('Projet DrawAll');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [conflictServer, setConflictServer] = useState<Project | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [orthoEnabled, setOrthoEnabled] = useState(true);
  const [currentSnap, setCurrentSnap] = useState<SnapPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  const dxfInputRef = useRef<HTMLInputElement>(null);

  const selected = project.objects.find(o => o.id === project.selectedId) ?? null;

  const exportPackage = useCallback(() => {
    const pkg = {
      manifest: { format: 'drawall-package', version: '0.1.0-prototype', exportedAt: new Date().toISOString() },
      projet: { revision: project.current.seq, versions: project.versions.length },
      unites: 'millimetre',
      calques: project.layers,
      blocs: project.blocks,
      objets: project.objects,
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'drawall-projet.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [project]);

  const exportDxf = useCallback(() => {
    const content = exportToDxf(project.objects, project.layers, project.blocks);
    const blob = new Blob([content], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cloudName.trim() || 'drawall-projet'}.dxf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [cloudName, project.objects, project.layers, project.blocks]);

  const importDxfFile = useCallback(async (file: File) => {
    const text = await file.text();
    const result = parseDxf(text, {
      objectStart: project.state.counter,
      layerStart: project.state.layerCounter,
      createdSeq: project.current.seq,
      existingLayers: project.layers,
    });
    const count = project.importObjects(result.objects, result.layers, `Importer ${file.name}`);
    if (result.warnings.length > 0) window.alert(result.warnings.join('\n'));
    if (count > 0) setMode('atelier');
  }, [project]);

  const openRequirement = useCallback((id: string) => {
    setFocusReq(id);
    setDocsSub('exigences');
    setMode('docs');
  }, []);

  const prepareBlockInsertion = useCallback((blockId: string) => {
    setActiveBlockId(blockId);
    setMode('atelier');
    setTool('block');
  }, []);

  const createBlockFromSelection = useCallback((objectId: string) => {
    const blockId = project.createBlockFromObject(objectId);
    if (blockId) setActiveBlockId(blockId);
  }, [project]);

  const applyCloudProject = useCallback((remote: Project) => {
    skipDirtyTracking.current = true;
    project.loadState(remote.data);
    setCloudProjectId(remote.id);
    setCloudRevision(remote.revision);
    setCloudName(remote.name);
    setConflictServer(null);
    setSyncStatus('synced');
  }, [project]);

  const saveToCloud = useCallback(async (saveAsNew = false, expectedRevisionOverride?: number) => {
    if (!auth.isAuthenticated) {
      setCloudOpen(true);
      return;
    }
    const name = cloudName.trim() || 'Projet DrawAll';
    const data = project.state as unknown as Record<string, unknown>;
    setSyncStatus('saving');
    try {
      if (saveAsNew || cloudProjectId === null) {
        const created = await createCloudProject.mutateAsync({ name, data });
        skipDirtyTracking.current = true;
        setCloudProjectId(created.id);
        setCloudRevision(created.revision);
        setCloudName(created.name);
        setConflictServer(null);
        setSyncStatus('synced');
      } else {
        const expectedRevision = expectedRevisionOverride ?? cloudRevision;
        if (!expectedRevision) throw new Error('Révision cloud absente');
        const result = await saveCloudProject.mutateAsync({
          id: cloudProjectId,
          data,
          expectedRevision,
        });
        if (result.status === 'conflict') {
          setConflictServer(result.project);
          setSyncStatus('conflict');
          setCloudOpen(true);
          return;
        }
        setCloudRevision(result.project.revision);
        setConflictServer(null);
        setSyncStatus('synced');
      }
      await utils.projects.list.invalidate();
    } catch {
      setSyncStatus('error');
      setCloudOpen(true);
    }
  }, [auth.isAuthenticated, cloudName, cloudProjectId, cloudRevision, createCloudProject, saveCloudProject, project.state, utils.projects.list]);

  const loadCloudProject = useCallback(async (id: number) => {
    setSyncStatus('saving');
    try {
      const remote = await utils.projects.get.fetch({ id });
      applyCloudProject(remote);
      setMode('atelier');
    } catch {
      setSyncStatus('error');
    }
  }, [applyCloudProject, utils.projects.get]);

  const renameCloud = useCallback(async (id: number, name: string) => {
    const renamed = await renameCloudProject.mutateAsync({ id, name });
    if (id === cloudProjectId) {
      setCloudName(renamed.name);
      setCloudRevision(renamed.revision);
    }
    await utils.projects.list.invalidate();
  }, [cloudProjectId, renameCloudProject, utils.projects.list]);

  const deleteCloud = useCallback(async (id: number) => {
    await deleteCloudProject.mutateAsync({ id });
    if (id === cloudProjectId) {
      setCloudProjectId(null);
      setCloudRevision(null);
      setConflictServer(null);
      setSyncStatus('local');
    }
    await utils.projects.list.invalidate();
  }, [cloudProjectId, deleteCloudProject, utils.projects.list]);

  const useCloudVersion = useCallback(() => {
    if (conflictServer) applyCloudProject(conflictServer);
  }, [applyCloudProject, conflictServer]);

  const keepLocalVersion = useCallback(() => {
    if (conflictServer) void saveToCloud(false, conflictServer.revision);
  }, [conflictServer, saveToCloud]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setCloudProjectId(null);
      setCloudRevision(null);
      setConflictServer(null);
      setSyncStatus('local');
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (!auth.isAuthenticated || cloudProjectId === null) return;
    if (skipDirtyTracking.current) {
      skipDirtyTracking.current = false;
      return;
    }
    setSyncStatus(s => (s === 'saving' || s === 'conflict' ? s : 'dirty'));
  }, [auth.isAuthenticated, cloudProjectId, project.state]);

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
        dimension: ['cote', 'cotation', 'dimension', 'mesure associative'],
        measure: ['mesure', 'distance', 'mesurer'],
        block: ['bloc', 'symbole', 'inserer', 'occurrence'],
        pan: ['panoramique', 'pan', 'deplacer la vue', 'main', 'hand'],
      }[t.id],
      run: () => { setMode('atelier'); setTool(t.id); },
    })),
    { id: 'view-bat', title: 'Basculer en lecture bâtiment', hint: 'Vue bâtiment — murs, niveaux, zones (Concept §1)', keywords: ['batiment', 'architecture', 'vue'], run: () => { setMode('atelier'); setView('batiment'); } },
    { id: 'view-ind', title: 'Basculer en lecture industrie', hint: 'Vue industrie — pièces, tôles, assemblages (Concept §1)', keywords: ['industrie', 'mecanique', 'tole', 'vue'], run: () => { setMode('atelier'); setView('industrie'); } },
    { id: 'undo', title: 'Annuler', hint: 'Revenir à la microversion précédente', keywords: ['annuler', 'undo', 'ctrl+z'], run: project.undo },
    { id: 'redo', title: 'Rétablir', hint: 'Revenir à la microversion suivante', keywords: ['retablir', 'redo'], run: project.redo },
    { id: 'cloud-save', title: 'Synchroniser le projet cloud', hint: 'Sauvegarde en base avec contrôle de révision', keywords: ['cloud', 'sauvegarder', 'synchroniser', 'compte'], run: () => void saveToCloud(false) },
    { id: 'cloud-list', title: 'Ouvrir Mes projets cloud', hint: 'Charger, renommer ou supprimer les projets du compte', keywords: ['projets', 'cloud', 'charger', 'compte'], run: () => setCloudOpen(true) },
    { id: 'toggle-snap', title: 'Basculer l’accrochage objet', hint: 'Extrémités, milieux, centres, quadrants et intersections (F9)', keywords: ['snap', 'accrochage', 'precision'], run: () => setSnapEnabled(v => !v) },
    { id: 'toggle-ortho', title: 'Basculer le mode ortho', hint: 'Contraint le tracé horizontalement ou verticalement (F8)', keywords: ['ortho', 'horizontal', 'vertical', 'precision'], run: () => setOrthoEnabled(v => !v) },
    { id: 'import-dxf', title: 'Importer un fichier DXF', hint: 'LINE, CIRCLE et LWPOLYLINE — conversion vers les objets DrawAll', keywords: ['dxf', 'import', 'autocad', 'interoperabilite'], run: () => dxfInputRef.current?.click() },
    { id: 'export-dxf', title: 'Exporter en DXF', hint: 'Exporte les primitives, calques, cotes aplaties et blocs aplatis', keywords: ['dxf', 'export', 'autocad', 'interoperabilite'], run: exportDxf },
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
      if (e.key === 'F8') { e.preventDefault(); setOrthoEnabled(v => !v); return; }
      if (e.key === 'F9') { e.preventDefault(); setSnapEnabled(v => !v); return; }
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
        onExportDxf={exportDxf}
        onImportDxf={() => dxfInputRef.current?.click()}
        onReset={() => { if (confirm('Réinitialiser le projet au démonstrateur initial ? Les microversions locales seront effacées.')) project.reset(); }}
        onCloud={() => setCloudOpen(o => !o)}
        syncStatus={syncStatus}
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
            <Navigator
              objects={project.objects}
              layers={project.layers}
              blocks={project.blocks}
              selectedId={project.selectedId}
              activeLayerId={project.activeLayerId}
              onSelect={project.setSelectedId}
              onAddLayer={project.addLayer}
              onUpdateLayer={project.updateLayer}
              onRemoveLayer={project.removeLayer}
              onSetActiveLayer={project.setActiveLayerId}
              onInsertBlock={prepareBlockInsertion}
              onCreateBlock={createBlockFromSelection}
              onRemoveBlock={project.removeBlock}
            />
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
              <span className="mx-2 h-4 w-px bg-border" />
              <button
                onClick={() => setSnapEnabled(v => !v)}
                title="Accrochage objet : extrémités, milieux, centres, quadrants et intersections (F9)"
                className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  snapEnabled ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Snap <span className="opacity-50">F9</span>
              </button>
              <button
                onClick={() => setOrthoEnabled(v => !v)}
                title="Contrainte horizontale / verticale (F8)"
                className={`rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  orthoEnabled ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Ortho <span className="opacity-50">F8</span>
              </button>
              <span className="ml-3 hidden min-w-0 flex-1 truncate font-mono text-[9px] text-muted-foreground/60 xl:inline">
                {tool === 'polyline' ? 'Cliquez les points — Entrée/double-clic pour valider, Échap pour annuler' :
                 tool === 'select' ? 'Cliquez un objet pour le sélectionner, glissez pour le déplacer, Suppr pour l’effacer' :
                 tool === 'dimension' ? 'Cliquez une ligne, un rectangle ou un cercle : la cote restera associative' :
                 tool === 'measure' ? 'Cliquez-glissez : distance, ΔX et ΔY en millimètres' :
                 tool === 'block' ? (activeBlockId ? `Cliquez pour insérer ${activeBlockId}` : 'Choisissez un bloc dans le navigateur') :
                 tool === 'pan' ? 'Glissez pour déplacer la vue' :
                 'Cliquez-glissez : l’aperçu précède la validation (UX3)'}
              </span>
              <span className="ml-auto hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground 2xl:inline">
                {currentSnap ? `${currentSnap.label} · ` : ''}{snapEnabled ? 'accrochage objet + grille 10 mm' : 'grille 10 mm'}
              </span>
            </div>

            <div className="min-h-0 flex-1">
              <CanvasView
                objects={project.objects}
                layers={project.layers}
                blocks={project.blocks}
                activeLayerId={project.activeLayerId}
                activeBlockId={activeBlockId}
                tool={tool}
                view={view}
                selectedId={project.selectedId}
                snapEnabled={snapEnabled}
                orthoEnabled={orthoEnabled}
                onSelect={project.setSelectedId}
                onAdd={project.addObject}
                onAddDimension={project.addDimension}
                onInsertBlock={project.insertBlock}
                onMove={(id, patch) => project.updateObject(id, patch, 'Déplacer')}
                onCursor={(x, y) => setCursor({ x, y })}
                onSnapChange={setCurrentSnap}
                onZoomChange={setZoom}
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
                syncLabel={SYNC_META[syncStatus].label}
                syncColor={SYNC_META[syncStatus].color}
              />
            </div>

            {/* Barre d'état */}
            <div className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-[#0c1220]/90 px-3 font-mono text-[10px] text-muted-foreground">
              <span className="text-cyan-400">
                {cursor.x === null ? '—' : `X ${fmt(cursor.x)} mm`} · {cursor.y === null ? '—' : `Y ${fmt(cursor.y)} mm`}
              </span>
              <span>{project.objects.length} objet{project.objects.length > 1 ? 's' : ''}</span>
              <span>{project.layers.find(l => l.id === project.activeLayerId)?.name ?? 'Calque'}</span>
              <span>{project.blocks.length} bloc{project.blocks.length > 1 ? 's' : ''}</span>
              <span>v{project.current.seq}{project.current.named ? ` · ${project.current.named}` : ''}</span>
              <span>zoom {(zoom * 100).toFixed(0)} %</span>
              <span>{orthoEnabled ? 'ORTHO' : 'libre'} · {snapEnabled ? 'SNAP objet' : 'SNAP grille'}</span>
              <span className="ml-auto">unités : millimètre · référentiel : local projet · DXF : Y ascendant</span>
            </div>
          </main>

          {/* Inspecteur — repère permanent 4 */}
          <aside className="w-64 shrink-0 border-l border-border">
            <Inspector
              obj={selected}
              objects={project.objects}
              layers={project.layers}
              blocks={project.blocks}
              view={view}
              level={level}
              onUpdate={project.updateObject}
              onRemove={project.removeObject}
              onCreateBlock={createBlockFromSelection}
            />
          </aside>
        </div>
      )}

      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf,text/plain"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void importDxfFile(file);
          e.currentTarget.value = '';
        }}
      />
      <CloudProjectsPanel
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        isAuthenticated={auth.isAuthenticated}
        currentId={cloudProjectId}
        currentRevision={cloudRevision}
        status={syncStatus}
        projectName={cloudName}
        setProjectName={setCloudName}
        conflictServer={conflictServer}
        onSave={saveToCloud}
        onLoad={loadCloudProject}
        onDelete={deleteCloud}
        onRename={renameCloud}
        onUseCloudVersion={useCloudVersion}
        onKeepLocalVersion={keepLocalVersion}
      />
      <CommandPalette key={paletteOpen ? 'open' : 'closed'} open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} onOpenRequirement={openRequirement} />
    </div>
  );
}
