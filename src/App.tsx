// DrawAll v4.1 — application unique : atelier de dessin + documentation du dossier.
// Cinq repères permanents (UX1) : navigateur, zone de travail, commandes, inspecteur,
// panneau des modifications/problèmes.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import CloudProjectsPanel from '@/components/CloudProjectsPanel';
import Header from '@/components/Header';
import Navigator from '@/components/Navigator';
import CanvasView, { type ColorMode, type ToolId } from '@/components/CanvasView';
import Inspector from '@/components/Inspector';
import HistoryPanel from '@/components/HistoryPanel';
import CommandPalette, { type Command } from '@/components/CommandPalette';
import DocsView from '@/docs/DocsView';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { useProject } from '@/store/project';
import type { CadObject, DisplayLevel, OpeningObj, PointDimensionMode, PointDimensionObj, RoughnessObj, SectionMarkObj, UnderlayObj, ViewReading, WallObj } from '@/types/cad';
import { PENDING_SHARE_KEY, SHARE_PARAM, SYNC_META, type CloudRole, type SyncStatus } from '@/types/cloud';
import ObjectComments from '@/components/ObjectComments';
import type { Project } from '@contracts/types';
import { fmt } from '@/types/cad';
import { DEFAULT_TEXT_HEIGHT } from '@/lib/text';
import { extendObject, trimObject } from '@/lib/edit';
import { chamferLines, filletLines } from '@/lib/fillet';
import { offsetObject as offsetCurve } from '@/lib/offset';
import { pointInPolygon, slabContour, slabQuantities } from '@/lib/slab';
import { roofError, roofGeometry, roofInput } from '@/lib/roof';
import { beamError, columnError } from '@/lib/structure';
import { SCHEDULE_TITLE } from '@/lib/schedules';
import ParametersPanel from '@/components/ParametersPanel';
import ZonesPanel from '@/components/ZonesPanel';
import { zoneColors as zoneColorsOf } from '@/lib/zones';
import { evaluateWith, resolveParameters } from '@/lib/params/expr';
import { CONSTRAINT_LABEL, CONSTRAINT_PICKS, constraintAnchors, constraintGlyph, diagnose, makeConstraint, type Pick } from '@/lib/constraints/model';
import type { GeoConstraint, PolylineObj, RoofObj } from '@/types/cad';
import { expandToGroups } from '@/lib/groups';
import { kernelVolume } from '@/lib/kernel/client';
import { polarArray, rectangularArray, translation, withDependencies } from '@/lib/array';
import { DISPLAY_UNITS, GRID_SIZES, formatArea, formatLength, fromMm, toMm, unitDecimals, type DisplayUnit } from '@/lib/input';
import { fromPackage, toPackage } from '@/lib/package';
import { encodeHistory } from '@/lib/history';
import { assetRoom, calibrate, fitEncoding, fitPixels, imageSizeMm, pdfPageSizeMm } from '@/lib/underlay';
import { detectDwg, dwgRefusal } from '@/lib/dwg';
import { measurePolygon, type Measure } from '@/lib/area';
import { PROFILES, withProfile, withProfileBlocks, type ViewContext } from '@/lib/materials';
import { openingFits, positionOnWall } from '@/lib/opening';
import { areaM2, detectRoom, formatM2, roomPolygons } from '@/lib/rooms';
import ArrayDialog, { type ArrayParams } from '@/components/ArrayDialog';
import SnapSettings from '@/components/SnapSettings';
import SheetEditor from '@/components/SheetEditor';
import { formatElevation, levelBelow, onLevel } from '@/lib/levels';
import { DXF_UNITS, dxfUnitByKey, exportDxf as exportDxfFile, formatExchangeReport, parseDxf } from '@/lib/dxf';
import { DEFAULT_SNAP_TYPES, OBJECT_SNAP_TYPES, type ObjectSnapType, type SnapPoint, mirrorObject, moveObject, objectBounds, offsetObject, rotateObject, scaleObject, selectionCenter, unionBounds } from '@/lib/geometry';

/** Largeur sous laquelle l'atelier passe en disposition compacte (tiroirs), en pixels CSS. */
const COMPACT_BREAKPOINT = 1024;

/** Outils toujours visibles sur petit écran ; les autres sont regroupés dans « Plus ». */
const PRIMARY_TOOLS: ToolId[] = ['select', 'line', 'rect', 'circle', 'polyline'];  // Texte, Cote, Mesure… dans « Plus »

const TOOLS: { id: ToolId; label: string; short?: string; key: string; levels: DisplayLevel[]; hint: string }[] = [
  { id: 'select', label: 'Sélection', short: 'Sél.', key: 'V', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Sélectionner et déplacer' },
  { id: 'line', label: 'Ligne', key: 'L', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Deux points accrochés à la grille' },
  { id: 'rect', label: 'Rectangle', short: 'Rect.', key: 'R', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Par deux coins opposés' },
  { id: 'circle', label: 'Cercle', key: 'C', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Centre puis rayon' },
  { id: 'arc', label: 'Arc 3 points', short: 'Arc', key: 'A', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Début, point de passage, fin' },
  { id: 'spline', label: 'Spline', key: 'S', levels: ['contextuel', 'complet'], hint: 'Points de contrôle, puis Terminer (Entrée ou double-clic) : courbe lisse de degré 3' },
  { id: 'freehand', label: 'Main levée', key: '', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Tracez librement à la souris, au stylet ou au doigt : polyligne simplifiée au relâcher' },
  { id: 'offset', label: 'Décaler', key: '', levels: ['contextuel', 'complet'], hint: 'Distance saisie, puis l’objet, puis un point du côté de la copie parallèle' },
  { id: 'constraint', label: 'Contrainte', key: '', levels: ['contextuel', 'complet'], hint: 'Type de contrainte, puis les éléments à contraindre (sommet, segment, cercle) : la géométrie est re-résolue' },
  { id: 'stretch', label: 'Étirer', key: '', levels: ['contextuel', 'complet'], hint: 'Deux coins de la fenêtre de capture, puis point de base et point d’arrivée : les sommets capturés se déplacent' },
  { id: 'ellipse', label: 'Ellipse', key: 'Z', levels: ['contextuel', 'complet'], hint: 'Centre, extrémité du premier axe, puis le second demi-axe' },
  { id: 'arcCenter', label: 'Arc par le centre', key: 'E', levels: ['contextuel', 'complet'], hint: 'Centre, début (rayon), fin — sens antihoraire' },
  { id: 'column', label: 'Poteau', key: '', levels: ['contextuel', 'complet'], hint: 'Section saisie (rectangulaire ou circulaire), puis le centre du poteau' },
  { id: 'beam', label: 'Poutre', key: '', levels: ['contextuel', 'complet'], hint: 'Section saisie, puis deux points de l’axe : traits interrompus (au-dessus du plan de coupe)' },
  { id: 'roof', label: 'Toiture', key: '', levels: ['contextuel', 'complet'], hint: 'Deux coins opposés du contour (nu extérieur des murs) ; type, pente, débord et axe dans le panneau' },
  { id: 'slab', label: 'Dalle', key: '', levels: ['contextuel', 'complet'], hint: 'Touchez l’intérieur d’une pièce pour reprendre son contour, ou tracez le contour point par point puis Terminer' },
  { id: 'wall', label: 'Mur', key: 'W', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Points successifs : un mur par segment, jonctions nettoyées — Entrée ou Terminer' },
  { id: 'opening', label: 'Ouverture', key: 'O', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Touchez un mur : porte ou fenêtre centrée sur ce point' },
  { id: 'room', label: 'Pièce', key: 'I', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Touchez l’intérieur d’une pièce fermée par des murs : nom et surface' },
  { id: 'note', label: 'Note', key: 'U', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Note de terrain : touchez un objet (elle le suit) ou un point, saisissez le texte ; photos dans l’inspecteur' },
  { id: 'calibrate', label: 'Caler le fond', key: 'G', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Fond de plan : touchez deux points de l’image, puis donnez leur distance réelle' },
  { id: 'symbol', label: 'Symbole', key: 'Y', levels: ['contextuel', 'complet'], hint: 'Nord, repère de coupe (deux points) ou cote de niveau en plan' },
  { id: 'polyline', label: 'Polyligne', short: 'Poly.', key: 'P', levels: ['contextuel', 'complet'], hint: 'Points successifs — Entrée ou double-clic pour terminer' },
  { id: 'dimension', label: 'Cote', key: 'D', levels: ['contextuel', 'complet'], hint: 'Cliquez un objet pour créer une cote associative' },
  { id: 'area', label: 'Aire', key: 'Q', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Points du contour, puis Terminer : aire et périmètre (rien n’est créé)' },
  { id: 'pdim', label: 'Cote par points', key: 'K', levels: ['contextuel', 'complet'], hint: 'Série, cumulée, angulaire ou niveau : désignez les points, puis Terminer' },
  { id: 'measure', label: 'Mesure', key: 'M', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Cliquez-glissez pour mesurer une distance' },
  { id: 'text', label: 'Texte', key: 'T', levels: ['essentiel', 'contextuel', 'complet'], hint: 'Touchez ou cliquez le point d’insertion, puis saisissez le texte' },
  { id: 'trim', label: 'Ajuster', key: 'J', levels: ['contextuel', 'complet'], hint: 'Touchez la portion à retirer entre deux arêtes' },
  { id: 'extend', label: 'Prolonger', key: 'X', levels: ['contextuel', 'complet'], hint: 'Touchez près de l’extrémité à prolonger jusqu’à la prochaine arête' },
  { id: 'fillet', label: 'Congé', key: 'F', levels: ['contextuel', 'complet'], hint: 'Touchez deux lignes du côté à conserver : raccord par un arc du rayon saisi' },
  { id: 'chamfer', label: 'Chanfrein', key: 'N', levels: ['contextuel', 'complet'], hint: 'Touchez deux lignes du côté à conserver : coin coupé aux distances saisies' },
  { id: 'block', label: 'Bloc', key: 'B', levels: ['contextuel', 'complet'], hint: 'Cliquez pour insérer le bloc actif' },
  { id: 'pan', label: 'Panoramique', short: 'Vue', key: 'H', levels: ['contextuel', 'complet'], hint: 'Déplacer la vue (molette : zoom)' },
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
  const joinSharedProject = trpc.projects.join.useMutation();
  const skipDirtyTracking = useRef(false);
  const [mode, setMode] = useState<'atelier' | 'feuilles' | 'docs'>('atelier');
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
  // Droit sur le projet cloud ouvert (lot 8.4) : en lecture, la synchronisation est refusée.
  const [cloudRole, setCloudRole] = useState<CloudRole | null>(null);
  const [cloudName, setCloudName] = useState('Projet DrawAll');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [conflictServer, setConflictServer] = useState<Project | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [orthoEnabled, setOrthoEnabled] = useState(true);
  const [currentSnap, setCurrentSnap] = useState<SnapPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  // Sous 1 024 px (téléphone, tablette en portrait), les repères permanents deviennent des tiroirs.
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < COMPACT_BREAKPOINT);
  const [panel, setPanel] = useState<'inspector' | 'history' | null>(null);
  const compactRef = useRef(compact);
  const [notice, setNotice] = useState<string | null>(null);
  // Objets tels qu'ils se dessinent avec le profil de dessin actif (motif tiré du matériau) ;
  // le modèle (project.objects) n'est pas modifié.
  const [viewContext, setViewContext] = useState<ViewContext>('coupe');
  const shownObjects = useMemo(() => withProfile(project.objects, project.profile, viewContext, project.blocks), [project.objects, project.profile, viewContext, project.blocks]);
  // Fond de plan (lot 4.4) : le niveau immédiatement inférieur, estompé, sous le niveau actif.
  const [underlayOn, setUnderlayOn] = useState(true);
  const levelUnder = levelBelow(project.levels, project.activeLevelId);
  const underlayObjects = useMemo(
    () => (underlayOn && levelUnder ? withProfile(onLevel(project.allObjects, levelUnder.id), project.profile, viewContext, project.blocks) : undefined),
    [underlayOn, levelUnder, project.allObjects, project.profile, viewContext, project.blocks],
  );
  const shownBlocks = useMemo(() => withProfileBlocks(project.blocks, project.profile, viewContext), [project.blocks, project.profile, viewContext]);
  // Incrémenté quand le projet est remplacé : le canevas oublie alors son dernier point posé.
  const [projectKey, setProjectKey] = useState(0);
  // Réglages d'affichage propres à ce navigateur : pas de grille et unité d'affichage.
  const [gridSize, setGridSize] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('drawall-grille')); return GRID_SIZES.includes(v) ? v : 10; } catch { return 10; }
  });
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>(() => {
    try { const v = localStorage.getItem('drawall-unite') as DisplayUnit | null; return DISPLAY_UNITS.some(u => u.key === v) ? v! : 'mm'; } catch { return 'mm'; }
  });
  useEffect(() => { try { localStorage.setItem('drawall-grille', String(gridSize)); } catch { /* préférence non conservée */ } }, [gridSize]);
  useEffect(() => { try { localStorage.setItem('drawall-unite', displayUnit); } catch { /* préférence non conservée */ } }, [displayUnit]);
  const [snapTypes, setSnapTypes] = useState<ObjectSnapType[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('drawall-accrochages') ?? 'null');
      return Array.isArray(v) ? OBJECT_SNAP_TYPES.filter(t => v.includes(t)) : DEFAULT_SNAP_TYPES;
    } catch { return DEFAULT_SNAP_TYPES; }
  });
  useEffect(() => { try { localStorage.setItem('drawall-accrochages', JSON.stringify(snapTypes)); } catch { /* préférence non conservée */ } }, [snapTypes]);
  const [snapPanelOpen, setSnapPanelOpen] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    try { return localStorage.getItem('drawall-couleurs') === 'metier' ? 'metier' : 'calque'; } catch { return 'calque'; }
  });
  useEffect(() => { try { localStorage.setItem('drawall-couleurs', colorMode); } catch { /* préférence non conservée */ } }, [colorMode]);
  // Hors ligne (lot 7.2) : état du réseau affiché ; le travail reste enregistré sur l'appareil.
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  // Réticule décalé au doigt (lot 7.1) : préférence de ce navigateur, désactivé par défaut.
  const [reticleOn, setReticleOn] = useState(() => { try { return localStorage.getItem('drawall-reticule') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('drawall-reticule', reticleOn ? '1' : '0'); } catch { /* préférence non conservée */ } }, [reticleOn]);
  const showCoord = (mm: number) => `${fmt(fromMm(mm, displayUnit), unitDecimals(displayUnit))} ${displayUnit}`;
  // Paramètres du congé et du chanfrein (mm), saisis dans le panneau de l'outil.
  const [cornerParams, setCornerParams] = useState({ r: '10', d1: '10', d2: '10' });
  // Distance du décalage (lot 10.4), saisie dans le panneau de l'outil.
  const [offsetDistance, setOffsetDistance] = useState('10');
  const noticeTimer = useRef<number | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  // Navigateur du projet : toujours présent, pliable ; plié par défaut sur petit écran.
  const [navOpen, setNavOpen] = useState(() => !(typeof window !== 'undefined' && window.innerWidth < COMPACT_BREAKPOINT));
  const dxfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onResize = () => {
      const next = window.innerWidth < COMPACT_BREAKPOINT;
      // Au passage du seuil, le navigateur reprend l'état par défaut de la nouvelle taille.
      if (next !== compactRef.current) setNavOpen(!next);
      compactRef.current = next;
      setCompact(next);
      if (!next) setPanel(null);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const selected = project.objects.find(o => o.id === project.selectedId) ?? null;

  // ─── Opérations d'édition sur la sélection ────────────────────────────────
  const selection = project.selectedIds;
  const hasSelection = selection.length > 0;
  const pivot = useCallback(
    () => selectionCenter(selection, project.objects, project.blocks),
    [selection, project.objects, project.blocks],
  );

  const nudgeSelection = useCallback((dx: number, dy: number) => {
    project.transformObjects(selection, o => moveObject(o, dx, dy), 'Déplacer');
  }, [project, selection]);

  const rotateSelection = useCallback((deg: number) => {
    const c = pivot();
    if (!c) return;
    project.transformObjects(selection, o => rotateObject(o, c.x, c.y, deg), `Rotation ${deg}°`);
  }, [project, selection, pivot]);

  const mirrorSelection = useCallback((axis: 'x' | 'y') => {
    const c = pivot();
    if (!c) return;
    project.transformObjects(selection, o => mirrorObject(o, axis, axis === 'x' ? c.x : c.y), axis === 'x' ? 'Miroir vertical' : 'Miroir horizontal');
  }, [project, selection, pivot]);

  const scaleSelection = useCallback((factor: number) => {
    const c = pivot();
    if (!c) return;
    project.transformObjects(selection, o => scaleObject(o, c.x, c.y, factor), `Échelle ×${factor}`);
  }, [project, selection, pivot]);

  const offsetSelection = useCallback((d: number) => {
    project.transformObjects(selection, o => offsetObject(o, d), `Décalage ${d > 0 ? '+' : ''}${d} mm`);
  }, [project, selection]);

  const duplicateSelection = useCallback(() => {
    project.duplicateObjects(selection);
  }, [project, selection]);

  /** Message bref affiché sur le canevas (sans boîte de dialogue). */
  const flash = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }, []);

  // Presse-papiers interne : instantané des objets copiés (et des cotes qui les suivent).
  const [clipboard, setClipboard] = useState<CadObject[] | null>(null);
  const pasteCount = useRef(0);
  const copySelection = useCallback(() => {
    if (selection.length === 0) return;
    const copied = withDependencies(project.objects, selection);
    setClipboard(copied);
    pasteCount.current = 0;
    flash(`${copied.length} objet${copied.length > 1 ? 's' : ''} copié${copied.length > 1 ? 's' : ''}.`);
  }, [project.objects, selection, flash]);

  /** Colle au pointeur s'il est sur le canevas, sinon avec un décalage de 20 mm par collage. */
  const pasteClipboard = useCallback(() => {
    if (!clipboard || clipboard.length === 0) return;
    // Une occurrence dont le bloc n'existe pas dans ce projet ou cette version n'est pas collée.
    const pastable = clipboard.filter(o => o.kind !== 'blockRef' || project.blocks.some(b => b.id === o.blockId));
    const orphans = clipboard.length - pastable.length;
    if (orphans > 0) flash(`${orphans} occurrence${orphans > 1 ? 's' : ''} de bloc non collée${orphans > 1 ? 's' : ''} : bloc absent de ce projet.`);
    if (pastable.length === 0) return;
    let dx: number, dy: number;
    const b = unionBounds(pastable.map(o => objectBounds(o, project.blocks, pastable)).filter((x): x is NonNullable<typeof x> => !!x));
    if (cursor.x !== null && cursor.y !== null && b) {
      dx = cursor.x - b.minX;
      dy = cursor.y - b.minY;
    } else {
      pasteCount.current += 1;
      dx = dy = 20 * pasteCount.current;
    }
    project.addCopies(pastable, [translation(dx, dy)], 'Coller');
  }, [clipboard, cursor, project, flash]);

  const [arrayMode, setArrayMode] = useState<'rect' | 'polar' | null>(null);
  const applyArray = useCallback((p: ArrayParams): string | null => {
    const sources = withDependencies(project.objects, selection);
    if (sources.length === 0) return 'Sélectionnez d’abord les objets à répéter.';
    if (p.mode === 'polar' && sources.some(o => o.kind === 'blockRef')) {
      return 'Les occurrences de blocs ne peuvent pas encore tourner : retirez-les de la sélection pour un réseau polaire.';
    }
    const out = p.mode === 'rect'
      ? rectangularArray(p.rows, p.cols, p.dx, p.dy, sources.length)
      : polarArray(p.count, p.angle, p.cx, p.cy, sources.length);
    if (!out.ok) return out.error;
    const created = project.addCopies(sources, out.placements, p.mode === 'rect' ? 'Réseau rectangulaire' : 'Réseau polaire');
    return created.length > 0 ? null : 'Aucune copie possible (calque verrouillé ?).';
  }, [project, selection]);

  const selectAll = useCallback(() => {
    const ids = project.objects
      .filter(o => project.layers.find(l => l.id === o.layerId)?.visible !== false)
      .map(o => o.id);
    project.setSelectedIds(ids);
  }, [project]);

  // Paquet natif (lot 8.2) : projet entier (historique, tous les niveaux, feuilles, styles, ressources).
  const exportPackage = useCallback(() => {
    const blob = new Blob([toPackage(project.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'drawall-projet.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [project]);
  const packageInputRef = useRef<HTMLInputElement>(null);
  const importPackage = useCallback(async (file: File) => {
    let text: string;
    try { text = await file.text(); } catch { window.alert('Paquet non restauré : fichier illisible.'); return; }
    const result = fromPackage(text);
    if (!result.ok) { window.alert(`Paquet non restauré : ${result.error}`); return; }
    if (!window.confirm(`Restaurer « ${file.name} » (${result.summary}) ? Le projet courant sera remplacé.`)) return;
    project.loadState(result.state);
    setProjectKey(k => k + 1);
    flash(`Projet restauré depuis ${file.name} : ${result.summary}.`);
  }, [project, flash]);

  const exportDxf = useCallback(() => {
    // Pas de hachure papier : convertis à l'échelle de la première fenêtre de feuille, sinon 1:1.
    const vp = project.sheets.flatMap(sh => sh.viewports)[0];
    const { content, report } = exportDxfFile(shownObjects, project.layers, shownBlocks, { hatchPaperScale: vp ? vp.scale.model / vp.scale.paper : 1 });
    // Un fichier DXF par niveau : seul le niveau actif est exporté, et le rapport le dit.
    if (project.levels.length > 1) {
      const active = project.levels.find(l => l.id === project.activeLevelId)!;
      const others = project.levels.filter(l => l.id !== active.id);
      report.transformed.unshift(`Niveau exporté : ${active.name} seulement ; non exportés : ${others.map(l => l.name).join(', ')} (exporter chaque niveau depuis ce niveau).`);
    }
    const blob = new Blob([content], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cloudName.trim() || 'drawall-projet'}.dxf`;
    a.click();
    // Le lien reste valide le temps du téléchargement ; le rapport s'affiche ensuite.
    const href = a.href;
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    if (report.transformed.length > 0 || report.lost.length > 0) {
      window.setTimeout(() => window.alert(formatExchangeReport('Export DXF (R2000, millimètres)', report)), 0);
    }
  }, [cloudName, shownObjects, shownBlocks, project.layers, project.sheets, project.levels, project.activeLevelId]);

  const importDxfFile = useCallback(async (file: File) => {
    // DWG : reconnu à sa signature et refusé avec la marche à suivre (convertisseur à décider, §7).
    const dwg = detectDwg(new Uint8Array(await file.slice(0, 6).arrayBuffer()));
    if (dwg) { window.alert(dwgRefusal(file.name, dwg)); return; }
    const text = await file.text();
    const options = {
      objectStart: project.state.counter,
      layerStart: project.state.layerCounter,
      createdSeq: project.current.seq,
      existingLayers: project.layers,
      blockStart: project.state.blockCounter,
    };
    let result = parseDxf(text, options);
    if (result.unitMissing) {
      // Unité absente ou inconnue : décision explicite de l'utilisateur (aucune unité supposée en silence).
      const choices = DXF_UNITS.map(u => u.key).join(', ');
      const answer = window.prompt(`Le fichier ${file.name} ne déclare pas d'unité exploitable.\nDans quelle unité ses coordonnées sont-elles exprimées ? (${choices})`, 'mm');
      if (answer === null) return;
      const unit = dxfUnitByKey(answer);
      if (!unit) {
        window.alert(`Unité « ${answer} » non reconnue. Import annulé.`);
        return;
      }
      result = parseDxf(text, { ...options, sourceUnit: unit.key });
    }
    const count = project.importObjects(result.objects, result.layers, `Importer ${file.name}`, result.blocks);
    const notes = result.warnings.filter(w => !w.startsWith('Entités DXF ignorées') && !w.startsWith('Le fichier ne déclare pas'));
    window.alert([formatExchangeReport(`Import DXF — ${file.name} (${count} objet${count > 1 ? 's' : ''})`, result.report), ...notes].join('\n'));
    if (count > 0) setMode('atelier');
  }, [project]);

  const openRequirement = useCallback((id: string) => {
    setFocusReq(id);
    setDocsSub('exigences');
    setMode('docs');
  }, []);

  // Texte : pose au point choisi, contenu saisi par l'utilisateur ; double-clic pour modifier.
  const placeText = useCallback((x: number, y: number) => {
    const content = window.prompt('Texte à poser', '');
    if (!content || !content.trim()) return;
    project.addObject({
      kind: 'text',
      classification: 'non-classifie',
      layerId: project.activeLayerId,
      hatch: 'none',
      x,
      y,
      content: content.trim(),
      height: DEFAULT_TEXT_HEIGHT,
      rotation: 0,
      align: 'left',
    }, content.trim().slice(0, 40));
  }, [project]);

  const editText = useCallback((id: string) => {
    const obj = project.objects.find(o => o.id === id);
    if (obj?.kind !== 'text') return;
    const content = window.prompt('Modifier le texte', obj.content);
    if (content === null || !content.trim() || content === obj.content) return;
    project.updateObject(id, { content: content.trim() }, 'Modifier texte');
  }, [project]);


  // Ajuster / prolonger : toutes les autres entités visibles servent d'arêtes.
  const trimExtend = useCallback((mode: 'trim' | 'extend', id: string, x: number, y: number) => {
    const target = project.objects.find(o => o.id === id);
    if (!target) return;
    const visible = project.objects.filter(o => project.layers.find(l => l.id === o.layerId)?.visible !== false);
    const result = mode === 'trim' ? trimObject(target, visible, { x, y }) : extendObject(target, visible, { x, y });
    if (!result) {
      flash(mode === 'trim'
        ? `${id} : aucune arête ne coupe l’objet à cet endroit.`
        : `${id} : rien à atteindre dans le prolongement (lignes, arcs et polylignes ouvertes seulement).`);
      return;
    }
    project.applyEdit(id, result, mode === 'trim' ? 'Ajuster' : 'Prolonger');
  }, [project, flash]);

  // Outil Mur : épaisseur et justification saisies dans le panneau de l'outil.
  // Dalles (lot 13.1) : depuis une pièce ou par contour ; épaisseur saisie.
  const [slabParams, setSlabParams] = useState<{ mode: 'piece' | 'contour'; thickness: string }>({ mode: 'piece', thickness: '200' });
  const slabThickness = useCallback(() => {
    const t = Number(slabParams.thickness.replace(',', '.'));
    if (!(t > 0) || !Number.isFinite(t)) { flash('Dalle : épaisseur positive attendue (mm).'); return null; }
    return t;
  }, [slabParams.thickness, flash]);
  const addSlab = useCallback((points: number[], roomId?: string) => {
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : déverrouillez-le pour créer une dalle.'); return; }
    const contour = slabContour(points);
    if (!contour) { flash('Dalle : contour fermé d’au moins trois sommets et d’aire non nulle attendu.'); return; }
    const thickness = slabThickness();
    if (thickness === null) return;
    project.addObject({ kind: 'slab', classification: 'architecture', layerId: layer.id, hatch: 'none', points: contour, thickness, ...(roomId ? { roomId } : {}) });
    const q = slabQuantities({ points: contour, thickness });
    flash(`Dalle créée : ${formatM2(q.areaM2)}, ${q.volumeM3.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³.`);
  }, [project, flash, slabThickness]);
  const addSlabFromRoom = useCallback((x: number, y: number) => {
    const polygons = roomPolygons(project.objects);
    for (const [roomId, poly] of polygons) {
      if (poly && pointInPolygon(poly, { x, y })) { addSlab(poly.flatMap(p => [p.x, p.y]), roomId); return; }
    }
    flash(polygons.size ? 'Aucune pièce fermée à cet endroit : touchez l’intérieur d’une pièce, ou tracez le contour.' : 'Aucune pièce dans ce niveau : placez d’abord une pièce (outil Pièce), ou tracez le contour.');
  }, [project.objects, addSlab, flash]);
  // Poteaux et poutres (lot 13.4) : sections saisies, aucun catalogue.
  const [structParams, setStructParams] = useState({ section: 'rect' as 'rect' | 'circle', b: '', h: '', d: '', height: '', beamB: '', beamH: '' });
  const structLayer = useCallback(() => {
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : déverrouillez-le pour créer un élément de structure.'); return null; }
    return layer;
  }, [project.layers, project.activeLayerId, flash]);
  const numOrNaN = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
  const addColumn = useCallback((x: number, y: number) => {
    const layer = structLayer();
    if (!layer) return;
    const section = structParams.section;
    const dims = section === 'circle' ? { d: numOrNaN(structParams.d) } : { b: numOrNaN(structParams.b), h: numOrNaN(structParams.h) };
    const err = columnError({ section, ...dims });
    if (err) { flash(`${err} Saisissez la section dans le panneau de l’outil.`); return; }
    const height = numOrNaN(structParams.height);
    if (structParams.height.trim() !== '' && !(height > 0)) { flash('Poteau : hauteur positive attendue (ou laissez vide).'); return; }
    project.addObject({ kind: 'column', classification: 'structure', layerId: layer.id, hatch: 'none', x, y, section, ...dims, ...(height > 0 ? { height } : {}) });
  }, [project, structParams, structLayer, flash]);
  const addBeam = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const layer = structLayer();
    if (!layer) return;
    const beam = { x1, y1, x2, y2, b: numOrNaN(structParams.beamB), h: numOrNaN(structParams.beamH) };
    const err = beamError(beam);
    if (err) { flash(`${err}${/section/.test(err) ? ' Saisissez la section dans le panneau de l’outil.' : ''}`); return; }
    project.addObject({ kind: 'beam', classification: 'structure', layerId: layer.id, hatch: 'none', ...beam });
  }, [project, structParams, structLayer, flash]);
  // Toitures (lot 13.2).
  const [roofParams, setRoofParams] = useState<{ type: RoofObj['roofType']; pitch: string; overhang: string; axis: 'x' | 'y'; highSide: 'min' | 'max' }>({ type: 'deux-pans', pitch: '30', overhang: '0', axis: 'x', highSide: 'min' });
  const addRoof = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : déverrouillez-le pour créer une toiture.'); return; }
    const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
    const roof = {
      x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      roofType: roofParams.type, pitch: num(roofParams.pitch), overhang: num(roofParams.overhang), axis: roofParams.axis,
      ...(roofParams.type === 'un-pan' ? { highSide: roofParams.highSide } : {}),
    };
    const err = roofError(roofInput(roof as RoofObj));
    if (err) { flash(err); return; }
    project.addObject({ kind: 'roof', classification: 'architecture', layerId: layer.id, hatch: 'none', ...roof });
    const g = roofGeometry(roofInput(roof as RoofObj));
    flash(`Toiture créée : faîtage à ${fmt(g.ridgeHeight)} mm au-dessus de l’égout${g.hipLengths.length ? `, arêtiers de ${fmt(g.hipLengths[0])} mm` : ''}.`);
  }, [project, flash, roofParams]);
  const [wallParams, setWallParams] = useState<{ thickness: string; justification: WallObj['justification'] }>({ thickness: '200', justification: 'axe' });
  const addWall = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : mur non créé.'); return; }
    const t = Number(wallParams.thickness.replace(',', '.'));
    if (!(t > 0)) { flash('Épaisseur de mur invalide.'); return; }
    project.addObject({ kind: 'wall', classification: 'architecture', layerId: layer.id, hatch: 'none', x1, y1, x2, y2, thickness: t, justification: wallParams.justification });
  }, [project, wallParams, flash]);

  // Outil Ouverture : type, largeur, charnière et côté d'ouverture.
  const [openingParams, setOpeningParams] = useState<{ type: OpeningObj['type']; width: string; hinge: OpeningObj['hinge']; side: OpeningObj['side'] }>(
    { type: 'porte', width: '900', hinge: 'debut', side: 'droite' },
  );
  const addOpening = useCallback((wallId: string, x: number, y: number) => {
    const wall = project.objects.find(o => o.id === wallId);
    if (wall?.kind !== 'wall') return;
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : ouverture non créée.'); return; }
    const width = Number(openingParams.width.replace(',', '.'));
    const position = positionOnWall(wall, { x, y });
    const problem = openingFits({ position, width }, wall);
    if (problem) { flash(problem); return; }
    project.addObject({
      kind: 'opening', classification: 'architecture', layerId: layer.id, hatch: 'none',
      hostId: wall.id, type: openingParams.type, position, width, hinge: openingParams.hinge, side: openingParams.side,
    });
  }, [project, openingParams, flash]);

  // Outil Pièce : la pièce fermée qui contient le point, nommée par l'utilisateur.
  // Note de terrain (lot 7.3) : texte saisi, jointe à l'objet touché ou au point.
  const addNote = useCallback((x: number, y: number, targetId?: string) => {
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!targetId && (!layer || layer.locked)) { flash('Calque actif verrouillé : note non créée.'); return; }
    const text = window.prompt(targetId ? `Note sur ${targetId}` : 'Note sur ce point', '');
    if (text === null) return;
    project.addNote(x, y, text.trim(), targetId);
    flash(targetId ? `Note jointe à ${targetId} — photos dans l’inspecteur.` : 'Note posée — photos dans l’inspecteur.');
  }, [project, flash]);

  /** Photo jointe à une note : réduite à 1 600 px de côté, puis encodée dans la place restante du projet. */
  const addNotePhoto = useCallback(async (noteId: string, file: File) => {
    try {
      const bitmap = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * k)); canvas.height = Math.max(1, Math.round(bitmap.height * k));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encoded = fitEncoding({ w: canvas.width, h: canvas.height }, assetRoom(project.assets), (w, h, q) => {
        let c = canvas;
        if (w !== canvas.width || h !== canvas.height) {
          c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
        }
        return q === null ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/jpeg', q);
      });
      if (!encoded) { window.alert('Photo non jointe : le stockage local du projet est plein. Retirez une photo ou un fond de plan, puis réessayez.'); return; }
      project.addNotePhoto(noteId, { name: file.name, dataUrl: encoded.dataUrl, px: { w: encoded.w, h: encoded.h }, source: 'image' });
      flash(`Photo jointe à ${noteId}.`);
    } catch (e) {
      window.alert(`Photo illisible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [project, flash]);

  const addRoom = useCallback((x: number, y: number) => {
    const walls = project.objects.filter((o): o is WallObj => o.kind === 'wall' && project.layers.find(l => l.id === o.layerId)?.visible !== false);
    const poly = detectRoom(walls, { x, y });
    if (!poly) { flash('Aucune pièce fermée par des murs à cet endroit.'); return; }
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : pièce non créée.'); return; }
    const count = project.objects.filter(o => o.kind === 'room').length + 1;
    const name = window.prompt(`Nom de la pièce (${formatM2(areaM2(poly))})`, `Pièce ${count}`);
    if (name === null || !name.trim()) return;
    project.addObject({ kind: 'room', classification: 'architecture', layerId: layer.id, hatch: 'none', x, y }, name.trim());
  }, [project, flash]);

  // ─── Fond de plan (lot 6.2) ──────────────────────────────────────────────────
  const underlayInputRef = useRef<HTMLInputElement>(null);
  /** Image ou première page d'un PDF : réduite à 4 096 px de côté et à 2 Mo environ (stockage local). */
  const importUnderlay = useCallback(async (file: File) => {
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      let canvas: HTMLCanvasElement;
      let size: { w: number; h: number };
      if (isPdf) {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const fit = fitPixels(base.width * (150 / 72), base.height * (150 / 72));
        const viewport = page.getViewport({ scale: fit.w / base.width });
        canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        size = pdfPageSizeMm({ w: base.width, h: base.height });
      } else {
        const bitmap = await createImageBitmap(file);
        const fit = fitPixels(bitmap.width, bitmap.height);
        canvas = document.createElement('canvas');
        canvas.width = fit.w; canvas.height = fit.h;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, fit.w, fit.h);
        size = imageSizeMm({ w: bitmap.width, h: bitmap.height });
      }
      // Stockage local borné : PNG si l'image reste légère, sinon JPEG de qualité décroissante, puis
      // image réduite, jusqu'à tenir dans la place laissée par les autres fonds de plan.
      const room = assetRoom(project.assets);
      const encoded = fitEncoding({ w: canvas.width, h: canvas.height }, room, (w, h, q) => {
        let c = canvas;
        if (w !== canvas.width || h !== canvas.height) {
          c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d')!;
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(canvas, 0, 0, w, h);
        }
        return q === null ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
      });
      if (!encoded) {
        window.alert('Fond de plan non importé : le stockage local du projet est plein. Supprimez un fond de plan existant, puis réessayez.');
        return;
      }
      project.addUnderlay({ name: file.name, dataUrl: encoded.dataUrl, px: { w: encoded.w, h: encoded.h }, source: isPdf ? 'pdf' : 'image' }, size);
      setMode('atelier');
      flash(`Fond de plan importé : ${fmt(size.w)} × ${fmt(size.h)} mm${isPdf ? ' (taille de la page)' : ' (96 ppp supposés)'} — calez-le avec l’outil « Caler le fond ».`);
    } catch (e) {
      window.alert(`Fond de plan illisible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [project, flash]);

  /** Calage : le fond sélectionné (ou le seul fond du niveau) prend l'échelle donnée par deux points et leur distance. */
  const calibrateUnderlay = useCallback((points: number[]) => {
    const selectedUnderlay = project.objects.find(o => o.id === project.selectedId && o.kind === 'underlay');
    const all = project.objects.filter((o): o is UnderlayObj => o.kind === 'underlay');
    const target = (selectedUnderlay as UnderlayObj | undefined) ?? (all.length === 1 ? all[0] : undefined);
    if (!target) { flash(all.length ? 'Sélectionnez le fond de plan à caler.' : 'Aucun fond de plan à caler : importez une image ou un PDF.'); return; }
    if (target.locked) { flash('Fond de plan verrouillé : déverrouillez-le pour le caler.'); return; }
    const a = { x: points[0], y: points[1] }, b = { x: points[2], y: points[3] };
    const measured = Math.hypot(b.x - a.x, b.y - a.y);
    const raw = window.prompt(`Distance réelle entre les deux points (${displayUnit}) — mesurée sur le fond : ${formatLength(measured, displayUnit, fmt)}`, '');
    if (raw === null) return;
    const real = toMm(Number(raw.trim().replace(',', '.')), displayUnit);
    const next = calibrate(target, a, b, real);
    if (!next) { flash('Distance illisible ou points confondus : rien n’est modifié.'); return; }
    project.updateObject(target.id, next, 'Caler le fond de plan');
    flash(`Fond de plan calé : ×${fmt(real / measured, 4)}.`);
  }, [project, displayUnit, flash]);

  // Outil Symbole (lot 4.5) : type et valeurs saisis dans le panneau de l'outil.
  const [symbolParams, setSymbolParams] = useState<{ kind: 'north' | 'section' | 'levelMark' | 'roughness'; rotation: string; label: string; flip: boolean; elevation: string; ra: string; process: RoughnessObj['process'] }>(
    { kind: 'north', rotation: '0', label: '', flip: false, elevation: '', ra: '', process: 'enlevement' },
  );
  const activeLevel = project.levels.find(l => l.id === project.activeLevelId)!;
  /** Prochain repère de coupe libre : A, B, C… puis A1, B1… */
  const nextSectionLabel = useMemo(() => {
    const used = new Set(project.allObjects.filter(o => o.kind === 'section').map(o => (o as SectionMarkObj).label));
    for (let i = 0; ; i++) { const l = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : ''); if (!used.has(l)) return l; }
  }, [project.allObjects]);
  const addSymbol = useCallback((points: number[]) => {
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : symbole non créé.'); return; }
    const num = (v: string) => Number(v.trim().replace(',', '.'));
    const base = { classification: 'architecture' as const, layerId: layer.id, hatch: 'none' as const };
    if (symbolParams.kind === 'roughness') {
      // État de surface : rugosité facultative ; une valeur saisie doit être un nombre positif.
      const ra = symbolParams.ra.trim() === '' ? undefined : num(symbolParams.ra);
      if (ra !== undefined && !(ra > 0)) { flash('Rugosité Ra illisible : saisir un nombre de µm, par exemple 3,2.'); return; }
      const rotation = num(symbolParams.rotation || '0');
      if (!Number.isFinite(rotation)) { flash('Angle illisible.'); return; }
      project.addObject({ ...base, classification: 'mecanique', kind: 'roughness', x: points[0], y: points[1], rotation, process: symbolParams.process, ...(ra !== undefined ? { ra } : {}) }, 'État de surface');
    } else if (symbolParams.kind === 'north') {
      const rotation = num(symbolParams.rotation || '0');
      if (!Number.isFinite(rotation)) { flash('Angle du nord illisible.'); return; }
      project.addObject({ ...base, kind: 'north', x: points[0], y: points[1], rotation }, 'Nord');
    } else if (symbolParams.kind === 'levelMark') {
      const m = symbolParams.elevation.trim() === '' ? activeLevel.elevation / 1000 : num(symbolParams.elevation);
      if (!Number.isFinite(m)) { flash('Altitude illisible : saisir des mètres, par exemple 2,80.'); return; }
      project.addObject({ ...base, kind: 'levelMark', x: points[0], y: points[1], elevation: Math.round(m * 1000) });
    } else {
      if (points.length < 4 || Math.hypot(points[2] - points[0], points[3] - points[1]) <= 1e-6) { flash('Repère de coupe : deux points distincts.'); return; }
      const label = symbolParams.label.trim() || nextSectionLabel;
      project.addObject({ ...base, kind: 'section', x1: points[0], y1: points[1], x2: points[2], y2: points[3], label, ...(symbolParams.flip ? { flip: true } : {}) }, `Coupe ${label}`);
      setSymbolParams(p => ({ ...p, label: '' }));
    }
  }, [project, symbolParams, activeLevel, nextSectionLabel, flash]);

  // Outil Cote par points : paramètres saisis dans le panneau de l'outil.
  const [pdimParams, setPdimParams] = useState<{ mode: PointDimensionMode; axis: PointDimensionObj['axis']; offset: string; reference: string }>(
    { mode: 'chain', axis: 'horizontal', offset: '500', reference: '0' },
  );
  const addPointDimension = useCallback((points: number[]) => {
    const layer = project.layers.find(l => l.id === project.activeLayerId);
    if (!layer || layer.locked) { flash('Calque actif verrouillé : cote non créée.'); return; }
    const num = (v: string) => Number(v.replace(',', '.'));
    const needed = pdimParams.mode === 'angular' ? 3 : pdimParams.mode === 'level' ? 1 : 2;
    if (points.length / 2 < needed) { flash(`Il faut au moins ${needed} point${needed > 1 ? 's' : ''} pour cette cote.`); return; }
    const offset = Number.isFinite(num(pdimParams.offset)) ? num(pdimParams.offset) : 500;
    const reference = Number.isFinite(num(pdimParams.reference)) ? num(pdimParams.reference) : 0;
    project.addObject({
      kind: 'pdim', classification: 'non-classifie', layerId: layer.id, hatch: 'none',
      mode: pdimParams.mode, axis: pdimParams.axis, points: pdimParams.mode === 'angular' ? points.slice(0, 6) : points,
      offset: pdimParams.mode === 'angular' && offset < 0 ? -offset : offset,
      ...(pdimParams.mode === 'level' ? { reference } : {}),
    });
  }, [project, pdimParams, flash]);

  // Outil Aire : résultat affiché sur le canevas jusqu'à la mesure suivante ou la fermeture.
  const [areaResult, setAreaResult] = useState<Measure | null>(null);
  const measureArea = useCallback((points: number[]) => setAreaResult(measurePolygon(points)), []);

  // Congé / chanfrein entre deux lignes ; refus explicite (message) sinon.
  const corner = useCallback((mode: 'fillet' | 'chamfer', first: { id: string; x: number; y: number }, second: { id: string; x: number; y: number }) => {
    const a = project.objects.find(o => o.id === first.id);
    const b = project.objects.find(o => o.id === second.id);
    if (!a || !b) return;
    if (a.kind !== 'line' || b.kind !== 'line') {
      flash('Congé et chanfrein s’appliquent entre deux lignes.');
      return;
    }
    const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
    const out = mode === 'fillet'
      ? filletLines(a, first, b, second, num(cornerParams.r))
      : chamferLines(a, first, b, second, num(cornerParams.d1), num(cornerParams.d2));
    if (!out.ok) { flash(out.error); return; }
    const { patchA, patchB, arc, line } = out.result;
    const added = arc ? [{ from: a.id, partial: { kind: 'arc' as const, ...arc } }]
      : line ? [{ from: a.id, partial: { kind: 'line' as const, ...line } }] : [];
    project.applyPatches([{ id: a.id, patch: patchA }, { id: b.id, patch: patchB }], added, mode === 'fillet' ? 'Congé' : 'Chanfrein');
  }, [project, flash, cornerParams]);

  // Essai du noyau 3D (lot 11.2) : chargement à la demande dans un Worker, volume de référence.
  const kernelTrial = useCallback(async () => {
    flash('Noyau 3D : chargement…');
    const t0 = performance.now();
    try {
      const { volume, loadMs } = await kernelVolume({ op: 'cut', a: { op: 'box', x: 100, y: 50, z: 20 }, b: { op: 'cylinder', r: 10, h: 40, at: [50, 25, -10] } });
      const total = Math.round(performance.now() - t0);
      setKernelResult({ volume, loadMs: Math.round(loadMs), totalMs: total });
      flash(`Noyau 3D prêt (module chargé en ${Math.round(loadMs)} ms, ${total} ms en tout) — pavé percé : ${volume.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} mm³`);
    } catch (e) {
      flash(`Noyau 3D indisponible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [flash]);
  const [kernelResult, setKernelResult] = useState<{ volume: number; loadMs: number; totalMs: number } | null>(null);

  // Groupes (lot 10.5) : désigner un membre sur le dessin désigne tout le groupe.
  const selectWithGroups = useCallback((ids: string[]) => project.setSelectedIds(expandToGroups(project.objects, ids)), [project]);
  const groupSelection = useCallback(() => {
    if (selection.length < 2) { flash('Grouper : désignez au moins deux objets.'); return; }
    const id = project.groupObjects(selection);
    if (id) flash(`Groupe ${id} créé (${expandToGroups(project.objects, selection).length} objets).`);
  }, [project, selection, flash]);
  const ungroupSelection = useCallback(() => {
    if (!project.ungroupObjects(selection)) flash('Dégrouper : aucun groupe dans la sélection.');
  }, [project, selection, flash]);

  // ─── Contraintes (lot 12.1) ─────────────────────────────────────────────────
  const [paramsOpen, setParamsOpen] = useState(false);
  const [zonesOpen, setZonesOpen] = useState(false);
  const zoneColors = useMemo(() => zoneColorsOf(project.objects, project.zones), [project.objects, project.zones]);
  const [constraintType, setConstraintType] = useState<GeoConstraint['type']>('horizontal');
  const [constraintValue, setConstraintValue] = useState('');
  const [constraintPicks, setConstraintPicks] = useState<Pick[]>([]);
  const constraintPolylines = useRef(new Map<string, PolylineObj>());
  useEffect(() => { setConstraintPicks([]); constraintPolylines.current = new Map(); }, [constraintType, tool]);
  const constraintDiagnosis = useMemo(() => diagnose(project.allObjects, project.constraints), [project.allObjects, project.constraints]);
  const constraintMarks = useMemo(() => project.constraints.map(k => ({
    id: k.id, glyph: constraintGlyph(k), at: constraintAnchors(project.objects, k), state: constraintDiagnosis.states[k.id] ?? 'satisfaite',
  })), [project.constraints, project.objects, constraintDiagnosis]);
  const pickForConstraint = useCallback((pick: Pick, polylines: Map<string, PolylineObj>) => {
    for (const [id, o] of polylines) constraintPolylines.current.set(id, o);
    const picks = [...constraintPicks, pick];
    const need = CONSTRAINT_PICKS[constraintType];
    if (picks.length < need.length) {
      if (pick.type !== need[picks.length - 1]) { flash(`${CONSTRAINT_LABEL[constraintType]} : ${need[picks.length - 1] === 'point' ? 'désignez un sommet ou une extrémité' : need[picks.length - 1] === 'seg' ? 'désignez un segment' : 'désignez un cercle ou un arc'}.`); return; }
      setConstraintPicks(picks);
      return;
    }
    setConstraintPicks([]);
    // Valeur saisie : un nombre, ou une expression de paramètres (cote pilotante, lot 12.2).
    const text = constraintValue.trim();
    const asNumber = Number(text.replace(',', '.'));
    let typed: number | undefined, expr: string | undefined;
    if (text !== '' && Number.isFinite(asNumber)) typed = asNumber;
    else if (text !== '') {
      const v = evaluateWith(text, resolveParameters(project.parameters));
      if ('error' in v) { flash(`${CONSTRAINT_LABEL[constraintType]} : ${v.error}`); return; }
      typed = v.value; expr = text;
    }
    // Les objets à jour des identifiants de sommets servent à lire les mesures actuelles.
    const objects = project.allObjects.map(o => constraintPolylines.current.get(o.id) ?? o);
    if (typed !== undefined && !(typed > 0)) { flash(`${CONSTRAINT_LABEL[constraintType]} : valeur positive attendue.`); return; }
    // L'identifiant est attribué par le projet.
    const made = makeConstraint('', constraintType, picks, objects, typed);
    if ('error' in made) { flash(made.error); return; }
    project.addConstraint(expr && 'value' in made ? { ...made, expr } as GeoConstraint : made, CONSTRAINT_LABEL[constraintType], constraintPolylines.current);
    constraintPolylines.current = new Map();
  }, [constraintPicks, constraintType, constraintValue, project, flash]);

  // Décalage à distance saisie (lot 10.4) : copie parallèle, propriétés de trait conservées.
  const offsetPicked = useCallback((id: string, side: { x: number; y: number }) => {
    const source = project.objects.find(o => o.id === id);
    if (!source) return;
    const d = offsetDistance.trim() === '' ? NaN : Number(offsetDistance.replace(',', '.'));
    const out = offsetCurve(source, d, side);
    if (!out.ok) { flash(out.reason); return; }
    const style = { ...(source.color ? { color: source.color } : {}), ...(source.lineType ? { lineType: source.lineType } : {}), ...(source.lineWeight ? { lineWeight: source.lineWeight } : {}) };
    project.applyPatches([], [{ from: source.id, partial: { ...style, ...out.partial } }], 'Décaler');
    if (out.approximated) flash('Courbe décalée approchée par une polyligne (écart ≤ 0,01 mm) : le décalé d’une ellipse ou d’une spline n’est ni une ellipse ni une spline.');
  }, [project, flash, offsetDistance]);

  const prepareBlockInsertion = useCallback((blockId: string) => {
    setActiveBlockId(blockId);
    setMode('atelier');
    setTool('block');
  }, []);

  const createBlockFromSelection = useCallback((objectId: string) => {
    const blockId = project.createBlockFromObject(objectId);
    if (blockId) setActiveBlockId(blockId);
  }, [project]);

  const applyCloudProject = useCallback((remote: Project & { role?: CloudRole }) => {
    skipDirtyTracking.current = true;
    if (remote.role) setCloudRole(remote.role);
    project.loadState(remote.data);
    setProjectKey(k => k + 1);
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
    if (!saveAsNew && cloudProjectId !== null && cloudRole === 'lecture') {
      flash('Projet partagé en lecture seule : « Enregistrer comme nouveau » crée votre propre copie.');
      setCloudOpen(true);
      return;
    }
    const name = cloudName.trim() || 'Projet DrawAll';
    // Historique par différences (lot 8.1) : le serveur reçoit l'état compact.
    const data = encodeHistory(project.state) as unknown as Record<string, unknown>;
    setSyncStatus('saving');
    try {
      if (saveAsNew || cloudProjectId === null) {
        const created = await createCloudProject.mutateAsync({ name, data });
        skipDirtyTracking.current = true;
        setCloudProjectId(created.id);
        setCloudRevision(created.revision);
        setCloudRole('proprietaire');
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
  }, [auth.isAuthenticated, cloudName, cloudProjectId, cloudRevision, cloudRole, flash, createCloudProject, saveCloudProject, project.state, utils.projects.list]);

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
      setCloudRole(null);
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
      setCloudRole(null);
      setConflictServer(null);
      setSyncStatus('local');
    }
  }, [auth.isAuthenticated]);

  // Invitation (lot 8.4) : `?partage=JETON` est retiré de l'adresse et gardé pour l'onglet le temps
  // de la connexion ; une fois connecté (et le brouillon local repris), le projet partagé s'ouvre.
  const [pendingShare, setPendingShare] = useState<string | null>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(SHARE_PARAM);
    try {
      if (fromUrl) sessionStorage.setItem(PENDING_SHARE_KEY, fromUrl);
      return fromUrl ?? sessionStorage.getItem(PENDING_SHARE_KEY);
    } catch { return fromUrl; }
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(SHARE_PARAM)) return;
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, []);
  const sharePrompted = useRef(false);
  useEffect(() => {
    if (!pendingShare || auth.isLoading || !project.hydrated) return;
    if (!auth.isAuthenticated) {
      // Demande unique : le panneau peut ensuite être fermé sans se rouvrir.
      if (!sharePrompted.current) {
        sharePrompted.current = true;
        flash('Invitation reçue : connectez-vous pour ouvrir le projet partagé.');
        setCloudOpen(true);
      }
      return;
    }
    const token = pendingShare;
    setPendingShare(null);
    // Le jeton n'est oublié qu'une fois l'invitation acceptée ou refusée par le serveur ; une panne
    // (réseau, serveur) le garde pour l'onglet, et un rechargement réessaie.
    const forget = () => { try { sessionStorage.removeItem(PENDING_SHARE_KEY); } catch { /* jeton non conservé */ } };
    joinSharedProject.mutateAsync({ token }).then(
      joined => { forget(); void utils.projects.list.invalidate(); return loadCloudProject(joined.projectId); },
      (e: { data?: { code?: string } | null }) => {
        if (e?.data?.code === 'NOT_FOUND') {
          forget();
          flash('Invitation inconnue, déjà utilisée ou expirée : demandez un nouveau lien.');
        } else {
          flash('Invitation non acceptée pour l’instant (réseau ou serveur) : rechargez la page pour réessayer.');
        }
      },
    );
  }, [pendingShare, auth.isLoading, auth.isAuthenticated, project.hydrated, flash, joinSharedProject, loadCloudProject, utils.projects.list]);

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
      hint: t.key ? `${t.hint} · raccourci ${t.key}` : t.hint,
      keywords: {
        select: ['selection', 'selectionner', 'fleche', 'move', 'deplacer'],
        line: ['ligne', 'trait', 'segment', 'line'],
        rect: ['rectangle', 'cadre', 'box', 'rect'],
        circle: ['cercle', 'circle', 'rond'],
        polyline: ['polyligne', 'polyline', 'contour', 'profil'],
        text: ['texte', 'annotation', 'etiquette', 'text', 'label'],
        arc: ['arc', 'courbe', 'trois points', 'cintre'],
        arcCenter: ['arc', 'centre', 'rayon', 'courbe'],
        ellipse: ['ellipse', 'ovale', 'axe', 'courbe'],
        spline: ['spline', 'courbe', 'lisse', 'bezier', 'nurbs'],
        stretch: ['etirer', 'étirer', 'stretch', 'allonger', 'deformer'],
        freehand: ['main levee', 'main levée', 'croquis', 'esquisse', 'libre', 'freehand', 'crayon'],
        offset: ['decaler', 'décaler', 'offset', 'parallele', 'parallèle', 'copie parallele'],
        constraint: ['contrainte', 'contraindre', 'parametrique', 'horizontal', 'vertical', 'parallele', 'perpendiculaire', 'tangent', 'coincident', 'fixe', 'solveur', 'esquisse'],
        trim: ['ajuster', 'couper', 'trim', 'ecourter', 'raccourcir'],
        room: ['piece', 'surface', 'local', 'room', 'sia', 'carrez'],
        note: ['note', 'photo', 'releve', 'terrain', 'chantier', 'commentaire', 'remarque'],
        opening: ['porte', 'fenetre', 'baie', 'ouverture', 'door', 'window'],
        wall: ['mur', 'cloison', 'paroi', 'wall', 'batiment'],
        column: ['poteau', 'colonne', 'pilier', 'column', 'structure', 'ossature'],
        beam: ['poutre', 'linteau', 'solive', 'beam', 'structure', 'ossature'],
        roof: ['toiture', 'toit', 'pan', 'faitage', 'arretier', 'arêtier', 'croupe', 'pente', 'roof'],
        slab: ['dalle', 'plancher', 'chape', 'radier', 'slab', 'plancher bas', 'plancher haut'],
        pdim: ['cote', 'serie', 'chainee', 'cumulee', 'angulaire', 'angle', 'niveau', 'altitude', 'dimension'],
        area: ['aire', 'surface', 'perimetre', 'area', 'mesurer'],
        fillet: ['conge', 'raccord', 'arrondi', 'fillet', 'rayon'],
        chamfer: ['chanfrein', 'biseau', 'chamfer', 'coin'],
        extend: ['prolonger', 'etendre', 'extend', 'allonger'],
        dimension: ['cote', 'cotation', 'dimension', 'mesure associative'],
        measure: ['mesure', 'distance', 'mesurer'],
        block: ['bloc', 'symbole', 'inserer', 'occurrence'],
        calibrate: ['fond de plan', 'caler', 'calage', 'echelle', 'image', 'pdf', 'calibrer'],
        symbol: ['symbole', 'nord', 'coupe', 'repere de coupe', 'niveau', 'altitude', 'cote de niveau'],
        pan: ['panoramique', 'pan', 'deplacer la vue', 'main', 'hand'],
      }[t.id],
      run: () => { setMode('atelier'); setTool(t.id); },
    })),
    { id: 'view-bat', title: 'Basculer en lecture bâtiment', hint: 'Vue bâtiment — murs, niveaux, zones (Concept §1)', keywords: ['batiment', 'architecture', 'vue'], run: () => { setMode('atelier'); setView('batiment'); } },
    { id: 'view-ind', title: 'Basculer en lecture industrie', hint: 'Vue industrie — pièces, tôles, assemblages (Concept §1)', keywords: ['industrie', 'mecanique', 'tole', 'vue'], run: () => { setMode('atelier'); setView('industrie'); } },
    { id: 'undo', title: 'Annuler', hint: 'Revenir à la microversion précédente', keywords: ['annuler', 'undo', 'ctrl+z'], run: project.undo },
    { id: 'redo', title: 'Rétablir', hint: 'Revenir à la microversion suivante', keywords: ['retablir', 'redo'], run: project.redo },
    { id: 'sel-all', title: 'Tout sélectionner', hint: 'Sélectionne tous les objets visibles (Ctrl+A)', keywords: ['selection', 'tout', 'all'], run: selectAll },
    { id: 'sel-clear', title: 'Effacer la sélection', hint: 'Désélectionne tous les objets', keywords: ['selection', 'effacer', 'deselec'], run: () => project.setSelectedIds([]) },
    { id: 'zones', title: 'Zones', hint: 'Regrouper des pièces : nom, couleur, surface cumulée', keywords: ['zone', 'zones', 'regrouper', 'pieces', 'surface cumulee', 'logement', 'lot', 'secteur'], run: () => setZonesOpen(true) },
    { id: 'parameters', title: 'Paramètres du projet', hint: 'Table des paramètres nommés (nom, expression, unité) ; les cotes de contrainte peuvent les citer', keywords: ['parametre', 'parametres', 'variable', 'expression', 'formule', 'cote pilotante'], run: () => setParamsOpen(true) },
    { id: 'kernel-trial', title: 'Essai du noyau 3D (P0)', hint: 'Charge OCCT (≈ 7 Mo compressés, une fois) et calcule un pavé percé', keywords: ['noyau', '3d', 'occt', 'essai', 'volume', 'p0'], run: () => { void kernelTrial(); } },
    { id: 'edit-group', title: 'Grouper la sélection', hint: 'Les objets forment un groupe (Ctrl+G)', keywords: ['grouper', 'groupe', 'group', 'assembler'], run: groupSelection },
    { id: 'edit-ungroup', title: 'Dégrouper', hint: 'Dissout les groupes de la sélection (Ctrl+Maj+G)', keywords: ['degrouper', 'dégrouper', 'ungroup', 'groupe'], run: ungroupSelection },
    { id: 'edit-dup', title: 'Dupliquer la sélection', hint: 'Copie décalée de 20 mm (Ctrl+D)', keywords: ['dupliquer', 'copier', 'copie', 'duplicate', 'copy'], run: duplicateSelection },
    { id: 'edit-copy', title: 'Copier la sélection', hint: 'Presse-papiers interne (Ctrl+C)', keywords: ['copier', 'copy', 'presse-papiers'], run: copySelection },
    { id: 'edit-paste', title: 'Coller', hint: 'Au pointeur, ou décalé de 20 mm (Ctrl+V)', keywords: ['coller', 'paste', 'presse-papiers'], run: pasteClipboard },
    { id: 'edit-array-rect', title: 'Réseau rectangulaire', hint: 'Copies en lignes et colonnes', keywords: ['reseau', 'repetition', 'array', 'grille', 'matrice'], run: () => setArrayMode('rect') },
    { id: 'edit-array-polar', title: 'Réseau polaire', hint: 'Copies réparties autour d’un centre', keywords: ['reseau', 'polaire', 'circulaire', 'array', 'rotation'], run: () => setArrayMode('polar') },
    { id: 'edit-rot90', title: 'Rotation +90°', hint: 'Pivote la sélection autour de son centre', keywords: ['rotation', 'pivoter', 'tourner', 'rotate'], run: () => rotateSelection(90) },
    { id: 'edit-rot-90', title: 'Rotation −90°', hint: 'Pivote la sélection autour de son centre', keywords: ['rotation', 'pivoter', 'tourner', 'rotate'], run: () => rotateSelection(-90) },
    { id: 'edit-mirror-h', title: 'Miroir horizontal', hint: 'Symétrie autour de l’axe horizontal de la sélection', keywords: ['miroir', 'symetrie', 'mirror', 'flip'], run: () => mirrorSelection('y') },
    { id: 'edit-mirror-v', title: 'Miroir vertical', hint: 'Symétrie autour de l’axe vertical de la sélection', keywords: ['miroir', 'symetrie', 'mirror', 'flip'], run: () => mirrorSelection('x') },
    { id: 'edit-offset', title: 'Décaler la sélection (+10 mm)', hint: 'Décalage parallèle ou dilatation', keywords: ['decalage', 'offset', 'dilater', 'decaler'], run: () => offsetSelection(10) },
    { id: 'edit-scale2', title: 'Échelle ×2', hint: 'Homothétie depuis le centre de la sélection', keywords: ['echelle', 'scale', 'agrandir'], run: () => scaleSelection(2) },
    { id: 'edit-scale05', title: 'Échelle ÷2', hint: 'Homothétie depuis le centre de la sélection', keywords: ['echelle', 'scale', 'reduire'], run: () => scaleSelection(0.5) },
    { id: 'cloud-save', title: 'Synchroniser le projet cloud', hint: 'Sauvegarde en base avec contrôle de révision', keywords: ['cloud', 'sauvegarder', 'synchroniser', 'compte'], run: () => void saveToCloud(false) },
    { id: 'cloud-list', title: 'Ouvrir Mes projets cloud', hint: 'Charger, renommer ou supprimer les projets du compte', keywords: ['projets', 'cloud', 'charger', 'compte'], run: () => setCloudOpen(true) },
    { id: 'toggle-snap', title: 'Basculer l’accrochage objet', hint: 'Extrémités, milieux, centres, quadrants et intersections (F9)', keywords: ['snap', 'accrochage', 'precision'], run: () => setSnapEnabled(v => !v) },
    { id: 'toggle-ortho', title: 'Basculer le mode ortho', hint: 'Contraint le tracé horizontalement ou verticalement (F8)', keywords: ['ortho', 'horizontal', 'vertical', 'precision'], run: () => setOrthoEnabled(v => !v) },
    { id: 'import-underlay', title: 'Importer un fond de plan', hint: 'Image ou PDF placé sous le dessin, calé par deux points et une distance connue, verrouillable', keywords: ['fond de plan', 'image', 'pdf', 'photo', 'scan', 'calque', 'underlay'], run: () => underlayInputRef.current?.click() },
    { id: 'import-dxf', title: 'Importer un fichier DXF ou DWG', hint: 'DXF : traits, cercles, arcs, polylignes, textes, blocs (INSERT), cotes, hachures, splines et ellipses — rapport d’échange. DWG : reconnu, la marche à suivre (enregistrer en DXF) est indiquée', keywords: ['dxf', 'dwg', 'import', 'autocad', 'interoperabilite'], run: () => dxfInputRef.current?.click() },
    { id: 'bom', title: 'Insérer la nomenclature', hint: 'Tableau repère / désignation / matériau / quantité, calculé depuis les pièces', keywords: ['nomenclature', 'bom', 'pieces', 'repere', 'quantite', 'tableau'], run: () => { setMode('atelier'); project.addBom(); } },
    ...(['pieces', 'ouvertures', 'murs'] as const).map(t => ({
      id: `schedule-${t}`, title: `Insérer le ${SCHEDULE_TITLE[t].toLowerCase()}`, hint: 'Tableau de quantités calculé depuis le modèle, mis à jour à chaque modification ; à poser sur une feuille par une fenêtre',
      keywords: ['tableau', 'quantites', 'metre', 'quantitatif', t, t === 'pieces' ? 'surfaces' : t === 'murs' ? 'longueurs' : 'portes fenetres'], run: () => { setMode('atelier'); project.addBom(t); },
    })),
    { id: 'export-dxf', title: 'Exporter en DXF', hint: 'Exporte les primitives, calques, cotes aplaties et blocs aplatis', keywords: ['dxf', 'export', 'autocad', 'interoperabilite'], run: exportDxf },
    { id: 'export', title: 'Exporter le paquet du projet', hint: 'Projet entier : historique, niveaux, feuilles, styles, ressources (JSON, relu à l’identique)', keywords: ['exporter', 'export', 'paquet', 'sauvegarder', 'json', 'sauvegarde'], run: exportPackage },
    { id: 'import-package', title: 'Restaurer un projet depuis son paquet', hint: 'Remplace le projet courant par celui du paquet DrawAll (historique compris)', keywords: ['restaurer', 'importer', 'paquet', 'json', 'sauvegarde', 'ouvrir'], run: () => packageInputRef.current?.click() },
    { id: 'docs-concept', title: 'Documentation — Concept produit', hint: 'Vision, engagements, parcours de preuve', keywords: ['concept', 'vision', 'documentation', 'aide'], run: () => { setDocsSub('concept'); setMode('docs'); } },
    { id: 'docs-arch', title: "Documentation — Architecture de référence", hint: 'Contrats, transactions, décisions D1–D6', keywords: ['architecture', 'contrats', 'transactions'], run: () => { setDocsSub('architecture'); setMode('docs'); } },
    { id: 'docs-req', title: 'Documentation — 324 exigences', hint: 'Annexe B : traçabilité intégrale DA-01-01 → DA-22-10', keywords: ['exigences', 'requirements', 'annexe', 'tracabilite'], run: () => { setDocsSub('exigences'); setMode('docs'); } },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); return; }
      if (paletteOpen || (mode !== 'atelier' && mode !== 'feuilles')) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (mode === 'feuilles') {
        // Feuilles : seuls annuler et rétablir s'appliquent (les autres raccourcis éditent le dessin).
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) project.redo(); else project.undo(); }
        return;
      }
      if (e.key === 'F8') { e.preventDefault(); setOrthoEnabled(v => !v); return; }
      if (e.key === 'F9') { e.preventDefault(); setSnapEnabled(v => !v); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) project.redo(); else project.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && project.selectedIds.length > 0) { project.removeObjects(project.selectedIds); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && project.selectedIds.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 100 : 10;
        nudgeSelection(
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
        );
        return;
      }
      const t = TOOLS.find(t => t.key && t.key.toLowerCase() === e.key.toLowerCase());
      if (t && t.levels.includes(level)) setTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, mode, level, project, selectAll, duplicateSelection, copySelection, pasteClipboard, nudgeSelection, groupSelection, ungroupSelection]);

  const visibleTools = TOOLS.filter(t => t.levels.includes(level));
  const primaryTools = visibleTools.filter(t => PRIMARY_TOOLS.includes(t.id));
  const moreTools = visibleTools.filter(t => !PRIMARY_TOOLS.includes(t.id));

  // Repères permanents : affichés en colonnes sur grand écran, en tiroirs sur petit écran.
  const navigatorEl = (
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
      onAddLibraryBlock={key => { const id = project.addLibraryBlock(key); if (id) prepareBlockInsertion(id); }}
      layerUsed={id => project.allObjects.some(o => o.layerId === id)}
      levels={project.levels}
      activeLevelId={project.activeLevelId}
      onSetActiveLevel={project.setActiveLevelId}
      onAddLevel={project.addLevel}
      onUpdateLevel={project.updateLevel}
      onRemoveLevel={project.removeLevel}
      onCopyLevel={project.copyLevel}
      onCollapse={() => setNavOpen(false)}
    />
  );
  const inspectorEl = (
    <Inspector
      zones={project.zones}
      onOpenZones={() => setZonesOpen(true)}
      obj={selected}
      issues={selected ? project.diagnostics.filter(d => d.level === 'avertissement' && new RegExp(`\\b${selected.id}\\b`).test(d.text)).map(d => d.text) : []}
      objects={project.objects}
      layers={project.layers}
      blocks={project.blocks}
      view={view}
      level={level}
      onUpdate={project.updateObject}
      onRemove={project.removeObject}
      onCreateBlock={createBlockFromSelection}
      displayUnit={displayUnit}
      profile={project.profile}
      surfaceRule={project.surfaceRule}
      onSurfaceRule={project.setSurfaceRule}
      onAddViews={project.addViews}
      onAddCut={project.addCut}
      onAddBalloon={project.addBalloon}
      onAddBom={project.addBom}
      onSelect={project.setSelectedId}
      assets={project.assets}
      onAddNotePhoto={(id, f) => { void addNotePhoto(id, f); }}
      onRemoveNotePhoto={project.removeNotePhoto}
      comments={selected && cloudProjectId !== null && cloudRole && auth.isAuthenticated
        ? <ObjectComments key={`${cloudProjectId}-${selected.id}`} projectId={cloudProjectId} objectId={selected.id} role={cloudRole} userId={auth.user?.id ?? null} />
        : undefined}
    />
  );
  const historyEl = (
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
  );
  const warningCount = project.diagnostics.filter(d => d.level === 'avertissement').length;

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
        onImportPackage={() => packageInputRef.current?.click()}
        onExportDxf={exportDxf}
        onImportDxf={() => dxfInputRef.current?.click()}
        onImportUnderlay={() => underlayInputRef.current?.click()}
        onReset={() => { if (confirm('Réinitialiser le projet au démonstrateur initial ? Les microversions locales seront effacées.')) { project.reset(); setProjectKey(k => k + 1); } }}
        onCloud={() => setCloudOpen(o => !o)}
        syncStatus={syncStatus}
        versionLabel={`révision v${project.current.seq}`}
      />

      {mode === 'feuilles' ? (
        <SheetEditor
          sheets={project.sheets}
          objects={project.allObjects}
          zones={project.zones}
          levels={project.levels}
          activeLevelId={project.activeLevelId}
          assets={project.assets}
          profile={project.profile}
          layers={project.layers}
          blocks={project.blocks}
          view={view}
          colorMode={colorMode}
          onAddSheet={project.addSheet}
          onUpdateSheet={project.updateSheet}
          onRemoveSheet={project.removeSheet}
          onAddViewport={project.addViewport}
          onUpdateViewport={project.updateViewport}
          onRemoveViewport={project.removeViewport}
          versions={project.versions}
          pointer={project.pointer}
          onNameVersion={project.nameVersion}
          onIssueIndex={project.issueIndex}
        />
      ) : mode === 'docs' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-[#0c1220]/60 px-2 py-1.5 sm:px-6">
            {([
              ['concept', 'Concept produit'],
              ['architecture', 'Architecture de référence'],
              ['exigences', 'Exigences — 324 entrées + T01–T20'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => { setDocsSub(id); setFocusReq(null); }}
                className={`shrink-0 whitespace-nowrap rounded-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
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
        <div className="relative flex min-h-0 flex-1">
          {/* Navigateur — repère permanent 1, pliable (plié par défaut sur petit écran) */}
          {compact ? (
            // Petit écran : le rail reste en place et le panneau déplié passe par-dessus le canevas.
            <>
              <button
                onClick={() => setNavOpen(true)}
                aria-label="Déplier le navigateur du projet"
                title="Déplier le navigateur du projet"
                className="flex w-9 shrink-0 flex-col items-center gap-3 border-r border-border bg-[#0c1220] py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-cyan-300"
              >
                <span aria-hidden="true">▸</span>
                <span style={{ writingMode: 'vertical-rl' }}>Navigateur du projet</span>
                <span className="text-cyan-400">{project.objects.length}</span>
              </button>
              {navOpen && (
                <aside data-testid="navigator-overlay" className="absolute inset-y-0 left-0 z-30 w-[min(18rem,85vw)] border-r border-border bg-[#0c1220] shadow-2xl shadow-black/60">
                  {navigatorEl}
                </aside>
              )}
            </>
          ) : navOpen ? (
            <aside className="w-56 shrink-0">{navigatorEl}</aside>
          ) : (
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Déplier le navigateur du projet"
              title="Déplier le navigateur du projet"
              className="flex w-9 shrink-0 flex-col items-center gap-3 border-r border-border bg-[#0c1220] py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-cyan-300"
            >
              <span aria-hidden="true">▸</span>
              <span style={{ writingMode: 'vertical-rl' }}>Navigateur du projet</span>
              <span className="text-cyan-400">{project.objects.length}</span>
            </button>
          )}

          {/* Zone de travail + commandes — repères permanents 2 et 3 */}
          <main className="relative flex min-w-0 flex-1 flex-col border-l border-border">
            {/* Petit écran : barre d'outils en bas, à portée du pouce (lot 7.1). */}
            <div data-testid="barre-outils" className={`flex shrink-0 items-center gap-1 border-border bg-[#0c1220]/60 px-2 py-1 ${compact ? 'order-last border-t' : 'overflow-x-auto border-b'}`}>
              {/* Petit écran : les outils fréquents défilent si besoin, « Plus » reste toujours accessible à droite. */}
              <div className={`flex items-center gap-1 ${compact ? 'min-w-0 flex-1 overflow-x-auto' : 'contents'}`}>
              {(compact ? primaryTools : visibleTools).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  title={t.key ? `${t.hint} (${t.key})` : t.hint}
                  aria-label={t.label}
                  className={`shrink-0 whitespace-nowrap rounded-sm px-2 py-2 sm:px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors lg:py-1 ${
                    tool === t.id ? 'bg-cyan-400 text-[#050810]' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {compact && t.short ? t.short : t.label} <span className="hidden opacity-50 2xl:inline">{t.key}</span>
                </button>
              ))}
              </div>
              {compact && (
                <button
                  onClick={() => setReticleOn(v => !v)}
                  aria-pressed={reticleOn}
                  aria-label="Réticule décalé"
                  title="Réticule décalé au-dessus du doigt, avec loupe : le point est posé au lever du doigt"
                  className={`shrink-0 whitespace-nowrap rounded-sm border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    reticleOn ? 'border-pink-400/70 bg-pink-400/15 text-pink-300' : 'border-border text-muted-foreground'
                  }`}
                >
                  ⌖
                </button>
              )}
              {compact && (
                <button
                  onClick={() => setMoreOpen(o => !o)}
                  aria-expanded={moreOpen}
                  aria-label="Plus d’outils"
                  className={`shrink-0 whitespace-nowrap rounded-sm border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    moreTools.some(t => t.id === tool) ? 'border-cyan-400 bg-cyan-400 text-[#050810]' : moreOpen ? 'border-cyan-400/60 text-cyan-300' : 'border-border text-muted-foreground'
                  }`}
                >
                  {moreTools.find(t => t.id === tool)?.short ?? moreTools.find(t => t.id === tool)?.label ?? 'Plus'} ▾
                </button>
              )}
              {!compact && <span className="mx-2 h-4 w-px shrink-0 bg-border" />}
              {!compact && <button
                onClick={() => setSnapEnabled(v => !v)}
                title="Accrochage objet : extrémités, milieux, centres, quadrants et intersections (F9)"
                className={`shrink-0 rounded-sm border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] lg:py-1 ${
                  snapEnabled ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Snap <span className="hidden opacity-50 2xl:inline">F9</span>
              </button>}
              {!compact && <button
                onClick={() => setOrthoEnabled(v => !v)}
                title="Contrainte horizontale / verticale (F8)"
                className={`shrink-0 rounded-sm border px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] lg:py-1 ${
                  orthoEnabled ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Ortho <span className="hidden opacity-50 2xl:inline">F8</span>
              </button>}
              <span className="ml-3 hidden min-w-0 flex-1 truncate font-mono text-[9px] text-muted-foreground/60 xl:inline">
                {tool === 'polyline' ? 'Cliquez les points — Entrée/double-clic pour valider, Échap pour annuler' :
                 tool === 'select' ? 'Cliquez un objet, glissez sur le fond pour une fenêtre de sélection, Maj+clic pour ajouter, Suppr pour effacer' :
                 tool === 'dimension' ? 'Cliquez une ligne, un rectangle ou un cercle : la cote restera associative' :
                 tool === 'measure' ? 'Cliquez-glissez : distance, ΔX et ΔY en millimètres' :
                 tool === 'block' ? (activeBlockId ? `Cliquez pour insérer ${activeBlockId}` : 'Choisissez un bloc dans le navigateur') :
                 tool === 'pan' ? 'Glissez pour déplacer la vue' :
                 tool === 'arc' ? 'Arc : cliquez le début, un point de passage, puis la fin' :
                 tool === 'freehand' ? 'Main levée : tracez en maintenant appuyé ; la polyligne est simplifiée au relâcher' :
                 tool === 'offset' ? 'Décaler : touchez l’objet, puis un point du côté où poser la copie parallèle' :
                 tool === 'column' ? 'Poteau : saisissez la section, puis touchez le centre du poteau' :
                 tool === 'beam' ? 'Poutre : saisissez la section, puis deux points de l’axe' :
                 tool === 'roof' ? 'Toiture : touchez deux coins opposés du contour (nu extérieur des murs)' :
                 tool === 'slab' ? (slabParams.mode === 'piece' ? 'Dalle : touchez l’intérieur d’une pièce, son contour est repris' : 'Dalle : points du contour, puis Terminer (Entrée ou double-clic)') :
                 tool === 'constraint' ? `${CONSTRAINT_LABEL[constraintType]} : désignez ${CONSTRAINT_PICKS[constraintType].map(n => (n === 'point' ? 'un sommet' : n === 'seg' ? 'un segment' : 'un cercle')).join(' puis ')}` :
                 tool === 'stretch' ? 'Étirer : deux coins de la fenêtre de capture, puis le point de base et le point d’arrivée' :
                 tool === 'spline' ? 'Spline : cliquez les points de contrôle, puis Terminer (Entrée ou double-clic)' :
                 tool === 'ellipse' ? 'Ellipse : cliquez le centre, l’extrémité du premier axe, puis un point du second axe' :
                 tool === 'arcCenter' ? 'Arc : cliquez le centre, le début (rayon), puis la fin — sens antihoraire' :
                 tool === 'trim' ? 'Ajuster : cliquez la portion à retirer, entre deux arêtes' :
                 tool === 'extend' ? 'Prolonger : cliquez près de l’extrémité à prolonger' :
                 tool === 'note' ? 'Note : touchez un objet (la note le suit) ou un point, saisissez le texte ; photos dans l’inspecteur' :
                 tool === 'room' ? 'Pièce : touchez l’intérieur d’une pièce fermée par des murs, puis nommez-la' :
                 tool === 'opening' ? 'Ouverture : touchez un mur à l’endroit du centre de la baie' :
                 tool === 'wall' ? 'Mur : cliquez les points successifs (un mur par segment), puis Entrée ou Terminer' :
                 tool === 'calibrate' ? 'Caler le fond : touchez deux points de l’image dont vous connaissez la distance (sans accrochage), puis saisissez-la' :
                 tool === 'symbol' ? (symbolParams.kind === 'roughness' ? 'État de surface : cliquez le point de la surface (pointe du symbole)' : symbolParams.kind === 'section' ? 'Repère de coupe : cliquez le début puis la fin de la trace ; la vue regarde à gauche du trait (« Inverser » pour l’autre côté)' : symbolParams.kind === 'north' ? 'Nord : cliquez l’emplacement du symbole' : 'Cote de niveau : cliquez le point ; l’altitude saisie est affichée') :
                 tool === 'pdim' ? 'Cote par points : désignez les points (angulaire : sommet puis deux branches ; niveau : un point), puis Terminer' :
                 tool === 'area' ? 'Aire : cliquez les sommets du contour, puis Entrée ou Terminer' :
                 tool === 'fillet' ? 'Congé : cliquez la première ligne puis la seconde, du côté à conserver' :
                 tool === 'chamfer' ? 'Chanfrein : cliquez la première ligne puis la seconde, du côté à conserver' :
                 tool === 'text' ? 'Cliquez le point d’insertion puis saisissez le texte ; double-clic sur un texte pour le modifier' :
                 'Cliquez-glissez : l’aperçu précède la validation (UX3)'}
              </span>
              <span className="ml-auto hidden shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground 2xl:inline">
                {currentSnap ? `${currentSnap.label} · ` : ''}{snapEnabled ? `accrochage objet + grille ${fmt(gridSize)} mm` : `grille ${fmt(gridSize)} mm`}
              </span>
            </div>

            {compact && moreOpen && (
              <div data-testid="more-tools" className="absolute bottom-24 right-2 z-30 max-h-[60vh] overflow-y-auto flex w-56 flex-col gap-1 rounded-sm border border-border bg-[#0c1220] p-2 shadow-2xl shadow-black/60">
                {moreTools.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTool(t.id); setMoreOpen(false); }}
                    aria-label={t.label}
                    className={`rounded-sm px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] ${
                      tool === t.id ? 'bg-cyan-400 text-[#050810]' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => setSnapEnabled(v => !v)}
                  aria-pressed={snapEnabled}
                  className={`rounded-sm border px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] ${snapEnabled ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground'}`}
                >
                  Accrochage objet {snapEnabled ? '· actif' : '· inactif'}
                </button>
                <button
                  onClick={() => setOrthoEnabled(v => !v)}
                  aria-pressed={orthoEnabled}
                  className={`rounded-sm border px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] ${orthoEnabled ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300' : 'border-border text-muted-foreground'}`}
                >
                  Ortho {orthoEnabled ? '· actif' : '· inactif'}
                </button>
              </div>
            )}

            {/* Barre d'édition — opérations sur la sélection */}
            <div className={`shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-[#0a0f1c]/80 px-2 py-1 lg:flex lg:flex-wrap ${compact && !hasSelection && !clipboard ? 'hidden' : 'flex'}`}>
              <span className="shrink-0 whitespace-nowrap px-1 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/70">
                Édition{hasSelection ? ` — ${selection.length} objet${selection.length > 1 ? 's' : ''}` : ''}
              </span>
              {([
                { label: 'Copier', hint: 'Ctrl+C — presse-papiers interne', run: copySelection },
                { label: 'Coller', hint: 'Ctrl+V — au pointeur, ou décalé de 20 mm', run: pasteClipboard, always: true },
                { label: 'Dupliquer', hint: 'Ctrl+D', run: duplicateSelection },
                { label: 'Grouper', hint: 'Ctrl+G — désigner un membre désigne le groupe', run: groupSelection },
                { label: 'Dégrouper', hint: 'Ctrl+Maj+G', run: ungroupSelection },
                { label: 'Réseau rect.', hint: 'Copies en lignes et colonnes, au pas saisi', run: () => setArrayMode('rect') },
                { label: 'Réseau polaire', hint: 'Copies réparties autour d’un centre', run: () => setArrayMode('polar') },
                { label: '↺ −90°', hint: 'Rotation anti-horaire autour du centre de la sélection', run: () => rotateSelection(-90) },
                { label: '↻ +90°', hint: 'Rotation horaire autour du centre de la sélection', run: () => rotateSelection(90) },
                { label: 'Miroir H', hint: 'Symétrie par rapport à l’axe horizontal de la sélection', run: () => mirrorSelection('y') },
                { label: 'Miroir V', hint: 'Symétrie par rapport à l’axe vertical de la sélection', run: () => mirrorSelection('x') },
                { label: 'Décaler +10', hint: 'Décalage parallèle / dilatation de 10 mm', run: () => offsetSelection(10) },
                { label: 'Décaler −10', hint: 'Contraction de 10 mm', run: () => offsetSelection(-10) },
                { label: '×2', hint: 'Échelle ×2 depuis le centre de la sélection', run: () => scaleSelection(2) },
                { label: '÷2', hint: 'Échelle ÷2 depuis le centre de la sélection', run: () => scaleSelection(0.5) },
                { label: 'Supprimer', hint: 'Suppr / Retour arrière', run: () => project.removeObjects(selection) },
              ]).map(a => (
                <button
                  key={a.label}
                  onClick={a.run}
                  disabled={'always' in a ? !clipboard : !hasSelection}
                  title={a.hint}
                  className="shrink-0 whitespace-nowrap rounded-sm px-2 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors lg:py-1 disabled:cursor-not-allowed disabled:opacity-30 enabled:text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground"
                >
                  {a.label}
                </button>
              ))}
              <span className="ml-auto hidden font-mono text-[9px] text-muted-foreground/60 lg:inline">
                Maj+clic : multi-sélection · fenêtre : glisser sur le fond · flèches : déplacer (Maj = ×10) · Ctrl+A : tout
              </span>
            </div>

            <div className="relative min-h-0 flex-1">
              <CanvasView
                objects={shownObjects}
                underlay={underlayObjects}
                layers={project.layers}
                blocks={shownBlocks}
                activeLayerId={project.activeLayerId}
                activeBlockId={activeBlockId}
                tool={tool}
                view={view}
                selectedId={project.selectedId}
                selectedIds={project.selectedIds}
                snapEnabled={snapEnabled}
                orthoEnabled={orthoEnabled}
                onSelect={project.setSelectedId}
                onSelectMany={selectWithGroups}
                onAdd={project.addObject}
                onAddDimension={project.addDimension}
                onInsertBlock={project.insertBlock}
                onPlaceText={placeText}
                onEditText={editText}
                onTrimExtend={trimExtend}
                onCorner={corner}
                onStretch={patches => project.applyPatches(patches, [], 'Étirer')}
                onOffset={offsetPicked}
                onConstraintPick={pickForConstraint}
                slabMode={slabParams.mode}
                onAddSlab={points => addSlab(points)}
                onAddSlabFromRoom={addSlabFromRoom}
                onAddRoof={addRoof}
                onAddColumn={addColumn}
                onAddBeam={addBeam}
                zoneColors={zoneColors}
                constraintMarks={constraintMarks}
                constraintPicks={constraintPicks.map(p => p.at)}
                onMeasureArea={measureArea}
                onAddPointDimension={addPointDimension}
                onAddWall={addWall}
                onAddOpening={addOpening}
                onAddRoom={addRoom}
                onAddNote={addNote}
                onAddSymbol={addSymbol}
                assets={project.assets}
                onCalibrate={calibrateUnderlay}
                symbolPoints={symbolParams.kind === 'section' ? 2 : 1}
                symbolKind={symbolParams.kind}
                pdimAutoFinish={pdimParams.mode === 'angular' ? 3 : pdimParams.mode === 'level' ? 1 : null}
                gridSize={gridSize}
                projectKey={projectKey}
                levelKey={project.activeLevelId}
                reticle={reticleOn}
                snapTypes={snapTypes}
                colorMode={colorMode}
                displayUnit={displayUnit}
                onMoveMany={(ids, dx, dy) => project.transformObjects(ids, o => moveObject(o, dx, dy), 'Déplacer')}
                onCursor={(x, y) => setCursor({ x, y })}
                onSnapChange={setCurrentSnap}
                onZoomChange={setZoom}
              />
              {areaResult && (
                <div role="region" aria-label="Résultat de l’aire" className="absolute right-3 top-12 z-10 rounded-sm border border-emerald-400/50 bg-[#0c1220]/95 px-3 py-2 font-mono text-[11px] text-muted-foreground shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <span className="uppercase tracking-[0.12em] text-emerald-300">Aire par points</span>
                    <button onClick={() => setAreaResult(null)} aria-label="Fermer le résultat" className="px-1 hover:text-foreground">×</button>
                  </div>
                  <div>Aire <span className="text-foreground">{areaResult.area !== undefined ? formatArea(areaResult.area, displayUnit, fmt) : areaResult.areaNote}</span></div>
                  <div>Périmètre <span className="text-foreground">{formatLength(areaResult.length, displayUnit, fmt)}</span></div>
                </div>
              )}
              {tool === 'opening' && (
                <div role="group" aria-label="Paramètres de l’ouverture" className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg sm:top-12">
                  <select aria-label="Type d’ouverture" value={openingParams.type} onChange={e => setOpeningParams(p => ({ ...p, type: e.target.value as OpeningObj['type'] }))}
                    className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                    <option value="porte">Porte</option>
                    <option value="fenetre">Fenêtre</option>
                  </select>
                  <label className="flex items-center gap-1">Largeur
                    <input aria-label="Largeur de l’ouverture (mm)" inputMode="decimal" value={openingParams.width}
                      onChange={e => setOpeningParams(p => ({ ...p, width: e.target.value }))}
                      className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                  </label>
                  {openingParams.type === 'porte' && (
                    <>
                      <select aria-label="Charnière" value={openingParams.hinge} onChange={e => setOpeningParams(p => ({ ...p, hinge: e.target.value as OpeningObj['hinge'] }))}
                        className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                        <option value="debut">Charnière au début</option>
                        <option value="fin">Charnière à la fin</option>
                      </select>
                      <select aria-label="Côté d’ouverture" value={openingParams.side} onChange={e => setOpeningParams(p => ({ ...p, side: e.target.value as OpeningObj['side'] }))}
                        className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                        <option value="droite">Ouvre à droite</option>
                        <option value="gauche">Ouvre à gauche</option>
                      </select>
                    </>
                  )}
                </div>
              )}
              {tool === 'wall' && (
                <div role="group" aria-label="Paramètres du mur" className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg sm:top-12">
                  <label className="flex items-center gap-1">Épaisseur
                    <input aria-label="Épaisseur du mur (mm)" inputMode="decimal" value={wallParams.thickness}
                      onChange={e => setWallParams(p => ({ ...p, thickness: e.target.value }))}
                      className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                  </label>
                  <select aria-label="Justification du mur" value={wallParams.justification} onChange={e => setWallParams(p => ({ ...p, justification: e.target.value as WallObj['justification'] }))}
                    className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                    <option value="axe">Axe</option>
                    <option value="gauche">Nu gauche</option>
                    <option value="droite">Nu droit</option>
                  </select>
                </div>
              )}
              {tool === 'symbol' && (
                <div role="group" aria-label="Paramètres du symbole" className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg sm:top-12">
                  <select aria-label="Type de symbole" value={symbolParams.kind} onChange={e => setSymbolParams(p => ({ ...p, kind: e.target.value as typeof p.kind }))}
                    className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                    <option value="north">Nord</option>
                    <option value="section">Repère de coupe</option>
                    <option value="levelMark">Cote de niveau</option>
                    <option value="roughness">État de surface</option>
                  </select>
                  {symbolParams.kind === 'roughness' && (
                    <>
                      <select aria-label="Procédé de la surface" value={symbolParams.process} onChange={e => setSymbolParams(p => ({ ...p, process: e.target.value as RoughnessObj['process'] }))}
                        className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                        <option value="enlevement">Enlèvement de matière exigé</option>
                        <option value="sans-enlevement">Enlèvement interdit</option>
                        <option value="quelconque">Procédé quelconque</option>
                      </select>
                      <label className="flex items-center gap-1">Ra
                        <input aria-label="Rugosité Ra (µm)" inputMode="decimal" value={symbolParams.ra} placeholder="—"
                          onChange={e => setSymbolParams(p => ({ ...p, ra: e.target.value }))}
                          className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> µm
                      </label>
                    </>
                  )}
                  {(symbolParams.kind === 'north' || symbolParams.kind === 'roughness') && (
                    <label className="flex items-center gap-1">Angle
                      <input aria-label={symbolParams.kind === 'north' ? 'Angle du nord (degrés)' : 'Angle du symbole (degrés)'} inputMode="decimal" value={symbolParams.rotation}
                        onChange={e => setSymbolParams(p => ({ ...p, rotation: e.target.value }))}
                        className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> °
                    </label>
                  )}
                  {symbolParams.kind === 'section' && (
                    <>
                      <label className="flex items-center gap-1">Repère
                        <input aria-label="Repère de coupe" value={symbolParams.label} placeholder={nextSectionLabel}
                          onChange={e => setSymbolParams(p => ({ ...p, label: e.target.value }))}
                          className="w-12 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" />
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" aria-label="Inverser le sens de la vue" checked={symbolParams.flip} onChange={e => setSymbolParams(p => ({ ...p, flip: e.target.checked }))} />
                        Inverser
                      </label>
                    </>
                  )}
                  {symbolParams.kind === 'levelMark' && (
                    <label className="flex items-center gap-1">Altitude
                      <input aria-label="Altitude de la cote de niveau (m)" inputMode="decimal" value={symbolParams.elevation} placeholder={String(activeLevel.elevation / 1000).replace('.', ',')}
                        onChange={e => setSymbolParams(p => ({ ...p, elevation: e.target.value }))}
                        className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> m
                    </label>
                  )}
                </div>
              )}
              {tool === 'pdim' && (
                <div role="group" aria-label="Paramètres de la cote" className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg sm:top-12">
                  <select aria-label="Type de cote" value={pdimParams.mode} onChange={e => setPdimParams(p => ({ ...p, mode: e.target.value as PointDimensionMode }))}
                    className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                    <option value="chain">En série</option>
                    <option value="baseline">Cumulée</option>
                    <option value="angular">Angulaire</option>
                    <option value="level">Niveau</option>
                  </select>
                  {(pdimParams.mode === 'chain' || pdimParams.mode === 'baseline') && (
                    <select aria-label="Direction de la cote" value={pdimParams.axis} onChange={e => setPdimParams(p => ({ ...p, axis: e.target.value as PointDimensionObj['axis'] }))}
                      className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                      <option value="horizontal">Horizontale</option>
                      <option value="vertical">Verticale</option>
                      <option value="aligned">Alignée</option>
                    </select>
                  )}
                  <label className="flex items-center gap-1">{pdimParams.mode === 'angular' ? 'Rayon' : pdimParams.mode === 'level' ? 'Repère' : 'Décalage'}
                    <input aria-label="Décalage de la cote (mm)" inputMode="decimal" value={pdimParams.offset}
                      onChange={e => setPdimParams(p => ({ ...p, offset: e.target.value }))}
                      className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                  </label>
                  {pdimParams.mode === 'level' && (
                    <label className="flex items-center gap-1">±0,00 à Y
                      <input aria-label="Y du niveau ±0,00 (mm)" inputMode="decimal" value={pdimParams.reference}
                        onChange={e => setPdimParams(p => ({ ...p, reference: e.target.value }))}
                        className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                    </label>
                  )}
                </div>
              )}
              {(tool === 'column' || tool === 'beam') && (
                <div className="absolute left-3 top-3 z-10 sm:top-12 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg">
                  {tool === 'column' ? (
                    <>
                      <select aria-label="Section du poteau" value={structParams.section} onChange={e => setStructParams(p => ({ ...p, section: e.target.value as 'rect' | 'circle' }))} className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                        <option value="rect">Rectangulaire</option><option value="circle">Circulaire</option>
                      </select>
                      {structParams.section === 'rect' ? (
                        <>
                          <label className="flex items-center gap-1">b<input aria-label="Largeur du poteau (mm)" inputMode="decimal" value={structParams.b} onChange={e => setStructParams(p => ({ ...p, b: e.target.value }))} className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /></label>
                          <label className="flex items-center gap-1">h<input aria-label="Profondeur du poteau (mm)" inputMode="decimal" value={structParams.h} onChange={e => setStructParams(p => ({ ...p, h: e.target.value }))} className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm</label>
                        </>
                      ) : (
                        <label className="flex items-center gap-1">Ø<input aria-label="Diamètre du poteau (mm)" inputMode="decimal" value={structParams.d} onChange={e => setStructParams(p => ({ ...p, d: e.target.value }))} className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm</label>
                      )}
                      <label className="flex items-center gap-1">Hauteur<input aria-label="Hauteur du poteau (mm)" inputMode="decimal" placeholder="facultative" value={structParams.height} onChange={e => setStructParams(p => ({ ...p, height: e.target.value }))} className="w-20 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /></label>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1">b<input aria-label="Largeur de la poutre (mm)" inputMode="decimal" value={structParams.beamB} onChange={e => setStructParams(p => ({ ...p, beamB: e.target.value }))} className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /></label>
                      <label className="flex items-center gap-1">h<input aria-label="Hauteur de la poutre (mm)" inputMode="decimal" value={structParams.beamH} onChange={e => setStructParams(p => ({ ...p, beamH: e.target.value }))} className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm</label>
                    </>
                  )}
                </div>
              )}
              {tool === 'roof' && (
                <div className="absolute left-3 top-3 z-10 sm:top-12 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg">
                  <select aria-label="Type de toiture" value={roofParams.type} onChange={e => setRoofParams(p => ({ ...p, type: e.target.value as RoofObj['roofType'] }))} className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                    <option value="un-pan">Un pan</option><option value="deux-pans">Deux pans</option><option value="quatre-pans">Quatre pans</option>
                  </select>
                  <label className="flex items-center gap-1">Pente
                    <input aria-label="Pente de la toiture (°)" inputMode="decimal" value={roofParams.pitch} onChange={e => setRoofParams(p => ({ ...p, pitch: e.target.value }))} className="w-12 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> °
                  </label>
                  <label className="flex items-center gap-1">Débord
                    <input aria-label="Débord de la toiture (mm)" inputMode="decimal" value={roofParams.overhang} onChange={e => setRoofParams(p => ({ ...p, overhang: e.target.value }))} className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                  </label>
                  {roofParams.type !== 'quatre-pans' && (
                    <select aria-label="Axe du faîtage" value={roofParams.axis} onChange={e => setRoofParams(p => ({ ...p, axis: e.target.value as 'x' | 'y' }))} className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                      <option value="x">{roofParams.type === 'un-pan' ? 'Rive haute' : 'Faîtage'} horizontal</option>
                      <option value="y">{roofParams.type === 'un-pan' ? 'Rive haute' : 'Faîtage'} vertical</option>
                    </select>
                  )}
                  {roofParams.type === 'un-pan' && (
                    <select aria-label="Côté de la rive haute" value={roofParams.highSide} onChange={e => setRoofParams(p => ({ ...p, highSide: e.target.value as 'min' | 'max' }))} className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                      <option value="min">{roofParams.axis === 'x' ? 'en haut' : 'à gauche'}</option>
                      <option value="max">{roofParams.axis === 'x' ? 'en bas' : 'à droite'}</option>
                    </select>
                  )}
                </div>
              )}
              {tool === 'slab' && (
                <div className="absolute left-3 top-3 z-10 sm:top-12 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg">
                  <select aria-label="Création de la dalle" value={slabParams.mode} onChange={e => setSlabParams(p => ({ ...p, mode: e.target.value as 'piece' | 'contour' }))}
                    className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                    <option value="piece">Depuis une pièce</option>
                    <option value="contour">Contour point par point</option>
                  </select>
                  <label className="flex items-center gap-1">Épaisseur
                    <input aria-label="Épaisseur de la dalle (mm)" inputMode="decimal" value={slabParams.thickness}
                      onChange={e => setSlabParams(p => ({ ...p, thickness: e.target.value }))}
                      className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                  </label>
                </div>
              )}
              {tool === 'constraint' && (
                <div data-testid="panneau-contraintes" className="absolute left-3 top-3 z-10 sm:top-12 flex max-h-[60%] w-72 max-w-[calc(100%-1.5rem)] flex-col gap-1.5 overflow-y-auto rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg">
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Type de contrainte" value={constraintType} onChange={e => setConstraintType(e.target.value as GeoConstraint['type'])}
                      className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                      {(Object.keys(CONSTRAINT_LABEL) as GeoConstraint['type'][]).map(t => <option key={t} value={t}>{CONSTRAINT_LABEL[t]}</option>)}
                    </select>
                    {(constraintType === 'distance' || constraintType === 'length' || constraintType === 'radius') && (
                      <label className="flex items-center gap-1">Valeur
                        <input aria-label="Valeur de la contrainte (mm)" title="Nombre, ou expression de paramètres" placeholder="actuelle" value={constraintValue}
                          onChange={e => setConstraintValue(e.target.value)}
                          className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                      </label>
                    )}
                    <span data-testid="contrainte-designes">{constraintPicks.length}/{CONSTRAINT_PICKS[constraintType].length}</span>
                    <button type="button" onClick={() => setParamsOpen(true)} className="rounded-sm border border-border px-1.5 py-0.5 text-foreground hover:bg-white/5">Paramètres…</button>
                  </div>
                  {constraintDiagnosis.conflicting.length > 0 && (
                    <p data-testid="contraintes-conflit" className="text-red-300">
                      Conflit : {constraintDiagnosis.conflicting.map(id => `${id} (${CONSTRAINT_LABEL[project.constraints.find(k => k.id === id)!.type].toLowerCase()})`).join(', ')} ne peuvent pas être satisfaites avec les autres contraintes. Retirez ou modifiez l’une d’elles ; le dessin reste tel quel en attendant.
                    </p>
                  )}
                  {constraintDiagnosis.redundant.length > 0 && (
                    <p data-testid="contraintes-redondantes" className="text-slate-400">
                      Sur-contrainte : {constraintDiagnosis.redundant.join(', ')} {constraintDiagnosis.redundant.length > 1 ? 'n’ajoutent' : 'n’ajoute'} rien aux autres contraintes.
                    </p>
                  )}
                  {constraintDiagnosis.unresolved.length > 0 && (
                    <p data-testid="contraintes-a-reparer" className="text-orange-300">
                      À réparer : {constraintDiagnosis.unresolved.join(', ')} (élément visé disparu ou renuméroté) : retirez la contrainte et recréez-la.
                    </p>
                  )}
                  {project.constraints.length > 0 && (
                    <>
                      <p>Degrés de liberté restants : <span data-testid="contraintes-ddl">{constraintDiagnosis.dof}</span></p>
                      <ul className="flex flex-col gap-0.5">
                        {project.constraints.map(k => (
                          <li key={k.id} data-contrainte-liste={k.id} data-etat={constraintDiagnosis.states[k.id]} className="flex items-center gap-1">
                            <span className="w-16 shrink-0">{k.id}</span>
                            <span className="flex-1 truncate" title={constraintDiagnosis.states[k.id]}>{CONSTRAINT_LABEL[k.type]}</span>
                            {'value' in k && (
                              <>
                                <input aria-label={`Valeur de ${k.id} (mm)`} title="Nombre, ou expression de paramètres (cote pilotante)" defaultValue={k.expr ?? String(k.value).replace('.', ',')} key={`${k.id}-${k.value}-${k.expr ?? ''}`}
                                  onBlur={e => { const err = project.setConstraintExpr(k.id, e.target.value); if (err) { flash(`${k.id} : ${err}`); e.target.value = k.expr ?? String(k.value).replace('.', ','); } }}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" />
                                {k.expr && <span data-valeur-pilotee={k.id}>= {String(Math.round(k.value * 1000) / 1000).replace('.', ',')}</span>}
                              </>
                            )}
                            <button type="button" aria-label={`Retirer ${k.id}`} onClick={() => project.removeConstraint(k.id)} className="rounded-sm px-1 text-muted-foreground hover:text-red-300">×</button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              {tool === 'offset' && (
                <div className="absolute left-3 top-3 z-10 sm:top-12 flex items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg">
                  <label className="flex items-center gap-1">Distance
                    <input aria-label="Distance du décalage (mm)" inputMode="decimal" value={offsetDistance}
                      onChange={e => setOffsetDistance(e.target.value)}
                      className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                  </label>
                </div>
              )}
              {(tool === 'fillet' || tool === 'chamfer') && (
                <div className="absolute left-3 top-3 z-10 sm:top-12 flex items-center gap-2 rounded-sm border border-border bg-[#0c1220]/95 px-2 py-1.5 font-mono text-[11px] text-muted-foreground shadow-lg">
                  {tool === 'fillet' ? (
                    <label className="flex items-center gap-1">Rayon
                      <input aria-label="Rayon du congé (mm)" inputMode="decimal" value={cornerParams.r}
                        onChange={e => setCornerParams(p => ({ ...p, r: e.target.value }))}
                        className="w-16 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                    </label>
                  ) : (
                    <>
                      <label className="flex items-center gap-1">D1
                        <input aria-label="Distance du chanfrein sur la première ligne (mm)" inputMode="decimal" value={cornerParams.d1}
                          onChange={e => setCornerParams(p => ({ ...p, d1: e.target.value }))}
                          className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" />
                      </label>
                      <label className="flex items-center gap-1">D2
                        <input aria-label="Distance du chanfrein sur la seconde ligne (mm)" inputMode="decimal" value={cornerParams.d2}
                          onChange={e => setCornerParams(p => ({ ...p, d2: e.target.value }))}
                          className="w-14 rounded-sm border border-border bg-background px-1 py-0.5 text-foreground" /> mm
                      </label>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Panneau des modifications / problèmes — repère permanent 5 (tiroir sur petit écran) */}
            {!compact && <div className="h-44 shrink-0 border-t border-border">{historyEl}</div>}

            {project.storageFull && (
              <div role="alert" data-testid="stockage-plein" className="absolute inset-x-0 top-2 z-20 flex justify-center px-3">
                <span className="rounded-sm border border-red-400/60 bg-[#0c1220]/95 px-3 py-2 font-mono text-[11px] text-red-300 shadow-lg">
                  Enregistrement local impossible : stockage du navigateur plein. Les dernières modifications ne seront pas conservées après fermeture — supprimez un fond de plan ou exportez le projet.
                </span>
              </div>
            )}

            {notice && (
              <div role="status" className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center px-3">
                <span className="rounded-sm border border-amber-400/50 bg-[#0c1220]/95 px-3 py-2 font-mono text-[11px] text-amber-200 shadow-lg">{notice}</span>
              </div>
            )}

            {/* Barre d'état */}
            <div className="flex h-7 shrink-0 items-center gap-4 overflow-x-auto whitespace-nowrap border-t border-border bg-[#0c1220]/90 px-3 font-mono text-[10px] text-muted-foreground">
              {!online && <span data-testid="hors-ligne" className="text-amber-300">Hors ligne — travail conservé sur l’appareil</span>}
              {kernelResult && (
                <span data-testid="noyau-3d" data-volume={kernelResult.volume} data-chargement={kernelResult.loadMs} title={`Noyau 3D OCCT chargé en ${kernelResult.loadMs} ms (${kernelResult.totalMs} ms avec le premier calcul)`} className="text-emerald-300">
                  noyau 3D prêt
                </span>
              )}
              {project.constraints.length > 0 && (
                <span data-testid="contraintes" className={constraintDiagnosis.conflicting.length || constraintDiagnosis.unresolved.length ? 'text-red-300' : ''}>
                  {project.constraints.length} contrainte{project.constraints.length > 1 ? 's' : ''}
                  {constraintDiagnosis.conflicting.length ? ` · conflit (${constraintDiagnosis.conflicting.join(', ')})` : constraintDiagnosis.unresolved.length ? ` · ${constraintDiagnosis.unresolved.length} à réparer` : ` · ${constraintDiagnosis.dof} ddl`}
                </span>
              )}
              {project.storageWarning && <span data-testid="quota" className="text-red-300">{project.storageWarning}</span>}
              <span className="text-cyan-400">
                {cursor.x === null ? '—' : `X ${showCoord(cursor.x)}`} · {cursor.y === null ? '—' : `Y ${showCoord(cursor.y)}`}
              </span>
              <label className="flex items-center gap-1">
                unité
                <select aria-label="Unité d’affichage" value={displayUnit} onChange={e => setDisplayUnit(e.target.value as DisplayUnit)}
                  className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                  {DISPLAY_UNITS.map(u => <option key={u.key} value={u.key}>{u.label}</option>)}
                </select>
              </label>
              <button onClick={() => setSnapPanelOpen(true)} className="rounded-sm border border-border px-1.5 py-0.5 hover:text-foreground">
                accrochages {snapEnabled ? `${snapTypes.length}/${OBJECT_SNAP_TYPES.length}` : 'coupés'}
              </button>
              <label className="flex items-center gap-1" title={`${project.profile.source} · domaine : ${project.profile.domain}`}>
                profil
                <select aria-label="Profil de dessin" value={project.profile.id} onChange={e => project.setProfileId(e.target.value)}
                  className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                  {PROFILES.map(p => <option key={p.id} value={p.id}>{p.name} ({p.version})</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1" title="Coupe : matériaux hachurés ; vue : surfaces vues (Conventions §4.1)">
                contexte
                <select aria-label="Contexte de l’atelier" value={viewContext} onChange={e => setViewContext(e.target.value as ViewContext)}
                  className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                  <option value="coupe">coupe</option>
                  <option value="vue">vue</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                couleurs
                <select aria-label="Couleurs à l’écran" value={colorMode} onChange={e => setColorMode(e.target.value as ColorMode)}
                  className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                  <option value="calque">du trait (calque)</option>
                  <option value="metier">classification métier</option>
                </select>
              </label>
              <label className="flex items-center gap-1">
                grille
                <select aria-label="Pas de grille" value={gridSize} onChange={e => setGridSize(Number(e.target.value))}
                  className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                  {GRID_SIZES.map(g => <option key={g} value={g}>{fmt(g)} mm</option>)}
                </select>
              </label>
              {project.levels.length > 1 && (
                <label className="flex items-center gap-1">
                  niveau
                  <select aria-label="Niveau affiché" value={project.activeLevelId} onChange={e => project.setActiveLevelId(e.target.value)}
                    className="rounded-sm border border-border bg-background px-1 py-0.5 text-foreground">
                    {project.levels.map(l => <option key={l.id} value={l.id}>{l.name} ({formatElevation(l.elevation)})</option>)}
                  </select>
                </label>
              )}
              {levelUnder && (
                <label className="flex items-center gap-1" title={`Afficher ${levelUnder.name} estompé sous le niveau actif`}>
                  <input type="checkbox" aria-label="Fond de plan du niveau inférieur" checked={underlayOn} onChange={e => setUnderlayOn(e.target.checked)} />
                  fond de plan
                </label>
              )}
              <span>{project.objects.length} objet{project.objects.length > 1 ? 's' : ''}</span>
              {hasSelection && <span className="text-cyan-300">{selection.length} sélectionné{selection.length > 1 ? 's' : ''}</span>}
              <span>{project.layers.find(l => l.id === project.activeLayerId)?.name ?? 'Calque'}</span>
              <span>{project.blocks.length} bloc{project.blocks.length > 1 ? 's' : ''}</span>
              <span>v{project.current.seq}{project.current.named ? ` · ${project.current.named}` : ''}</span>
              <span>zoom {(zoom * 100).toFixed(0)} %</span>
              <span>{orthoEnabled ? 'ORTHO' : 'libre'} · {snapEnabled ? 'SNAP objet' : 'SNAP grille'}</span>
              <span className="ml-auto hidden lg:inline">modèle en millimètres · affichage en {displayUnit} · référentiel : local projet · DXF : Y ascendant</span>
            </div>
          </main>

          {/* Inspecteur — repère permanent 4 (tiroir sur petit écran) */}
          {!compact && <aside className="w-64 shrink-0 border-l border-border">{inspectorEl}</aside>}
        </div>
      )}

      {/* Inspecteur et historique sur petit écran */}
      {compact && mode === 'atelier' && (
        <nav className="grid shrink-0 grid-cols-2 border-t border-border bg-[#0c1220]">
          {([
            ['inspector', 'Inspecteur', selected ? selected.id : ''],
            ['history', 'Historique', warningCount > 0 ? `${warningCount} ⚠` : `v${project.current.seq}`],
          ] as const).map(([id, label, badge]) => (
            <button
              key={id}
              onClick={() => setPanel(cur => (cur === id ? null : id))}
              className={`flex flex-col items-center gap-0.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                panel === id ? 'bg-cyan-400/10 text-cyan-300' : 'text-muted-foreground'
              }`}
            >
              <span>{label}</span>
              <span className={`text-[9px] normal-case tracking-normal ${id === 'history' && warningCount > 0 ? 'text-amber-300' : 'opacity-60'}`}>{badge || '—'}</span>
            </button>
          ))}
        </nav>
      )}

      {compact && mode === 'atelier' && panel && (
        <Drawer
          side={panel === 'inspector' ? 'right' : 'bottom'}
          title={panel === 'inspector' ? 'Inspecteur' : 'Modifications et problèmes'}
          onClose={() => setPanel(null)}
        >
          {panel === 'inspector' ? inspectorEl : historyEl}
        </Drawer>
      )}

      <input
        ref={packageInputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Fichier du paquet DrawAll"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importPackage(f); }}
      />
      <input
        ref={underlayInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        aria-label="Fichier du fond de plan"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void importUnderlay(file);
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={dxfInputRef}
        type="file"
        accept=".dxf,.dwg,text/plain"
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
        currentRole={cloudRole}
        userId={auth.user?.id ?? null}
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
        onLeave={() => { setCloudProjectId(null); setCloudRevision(null); setCloudRole(null); setConflictServer(null); setSyncStatus('local'); }}
      />
      {snapPanelOpen && <SnapSettings active={snapTypes} onChange={setSnapTypes} onClose={() => setSnapPanelOpen(false)} />}
      {arrayMode && (
        <ArrayDialog mode={arrayMode} center={pivot() ?? { x: 0, y: 0 }} onApply={applyArray} onClose={() => setArrayMode(null)} />
      )}
      {zonesOpen && (
        <ZonesPanel zones={project.zones} objects={project.allObjects} selectedRoomIds={project.selectedIds.filter(id => project.objects.find(o => o.id === id)?.kind === 'room')}
          onAdd={project.addZone} onUpdate={project.updateZone} onRemove={project.removeZone} onRoomZone={project.setRoomZone} onClose={() => setZonesOpen(false)} />
      )}
      {paramsOpen && (
        <ParametersPanel parameters={project.parameters} onAdd={project.addParameter} onUpdate={project.updateParameter} onRemove={project.removeParameter} onClose={() => setParamsOpen(false)} />
      )}
      <CommandPalette key={paletteOpen ? 'open' : 'closed'} open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} onOpenRequirement={openRequirement} />

    </div>
  );
}

/** Tiroir des repères permanents sur petit écran (navigateur, inspecteur, historique). */
function Drawer({ side, title, onClose, children }: { side: 'right' | 'bottom'; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const position = side === 'right'
    ? 'inset-y-0 right-0 w-[86vw] max-w-sm border-l'
    : 'inset-x-0 bottom-0 h-[65dvh] border-t';
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Fermer" className="absolute inset-0 h-full w-full cursor-default bg-black/60" onClick={onClose} />
      <div className={`absolute flex flex-col border-border bg-[#0c1220] shadow-2xl shadow-black/60 ${position}`}>
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</span>
          <button onClick={onClose} className="rounded-sm border border-border px-2.5 py-1 font-mono text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
