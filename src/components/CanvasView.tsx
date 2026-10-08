// Zone de travail : canvas SVG 2D avec accrochage objet, intersections,
// contrainte orthogonale, saisie de coordonnées, zoom ajusté, mesures et blocs.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  BlockDef,
  CadObject,
  PolylineObj,
  Classification,
  DimensionObj,
  DrawingScale,
  PointDimensionObj,
  WallObj,
  OpeningObj,
  RoomObj,
  Layer,
  NewCadObject,
  PrimitiveObject,
  TextObj,
  ViewReading,
  ViewsObj,
  CutObj,
  UnderlayObj,
  NoteObj,
  Asset,
} from '@/types/cad';
import { CLASSIFICATION_META, dimensionValue, fmt, isClosedPolyline } from '@/types/cad';
import {
  blockBounds,
  primitiveBounds,
  constrainOrtho,
  dimensionGeometry,
  distanceSegment,
  findSnap,
  gridSnap,
  notePosition,
  objectBounds,
  projectBounds,
  unionBounds,
  snapLabel,
  type Point,
  type ObjectSnapType,
  type SnapPoint,
} from '@/lib/geometry';
import { pointInText, textCorners, textLines, TEXT_LINE_SPACING, TEXT_FONT_SCALE } from '@/lib/text';
import { arcFrom3Points, arcFromCenter, arcSvgPath, distanceToArc } from '@/lib/arc';
import { distanceToEllipse, ellipseFrom3Points, ellipsePath } from '@/lib/ellipse';
import { distanceToSpline, splinePath, withoutRepeatedPoints } from '@/lib/spline';
import { stretchAll, stretchPreview, windowOf } from '@/lib/stretch';
import { expandToGroups } from '@/lib/groups';
import { simplifyPath } from '@/lib/freehand';
import { pickElement, type Pick } from '@/lib/constraints/model';
import { slabAsPolyline } from '@/lib/slab';
import { roofInput, roofPrimitives } from '@/lib/roof';
import { fromMm, parseLength, parsePointInput, unitDecimals, type DisplayUnit } from '@/lib/input';
import { effectiveStyle, screenDash, screenWidth } from '@/lib/linestyle';
import { PAPER_DIMENSION_STYLE, arrowHead, dashInModel, dimensionTextPosition, paperToModelSize, strokeInModel } from '@/lib/annotation';
import { pdimGeometry } from '@/lib/pdim';
import { occurrencePrimitives } from '@/lib/materials';
import { hatchParamsOf, pointInLoop } from '@/lib/hatch';
import { wallHatchShape, wallQuad, wallsGeometry, type WallGeometry } from '@/lib/wall';
import { openingGeometry, swingPath } from '@/lib/opening';
import { areaM2, centroid, detectRoom, formatM2, roomPolygons } from '@/lib/rooms';
import { distanceToViews, linkedViews } from '@/lib/views';
import { annotationBounds, annotationGeometry, isAnnotation, type AnnotationObject } from '@/lib/bom';
import { cutView, distanceToCut } from '@/lib/cuts';
import { onUnderlay } from '@/lib/underlay';
import { SCREEN_PX_PER_PAPER_MM, distanceToSymbol } from '@/lib/symbols';

/** Couleur des objets à l'écran : celle du trait (calque ou objet) ou celle de la classification métier. */
export type ColorMode = 'calque' | 'metier';

export type ToolId = 'select' | 'line' | 'rect' | 'circle' | 'arc' | 'arcCenter' | 'ellipse' | 'spline' | 'stretch' | 'offset' | 'freehand' | 'constraint' | 'slab' | 'roof' | 'polyline' | 'dimension' | 'measure' | 'block' | 'text' | 'trim' | 'extend' | 'fillet' | 'chamfer' | 'area' | 'pdim' | 'wall' | 'opening' | 'room' | 'symbol' | 'calibrate' | 'note' | 'pan';

interface Props {
  objects: CadObject[];
  /** Fond de plan (lot 4.4) : objets du niveau inférieur, estompés, ni sélectionnables ni accrochables. */
  underlay?: CadObject[];
  /** Pas de la grille d'accrochage (mm). */
  gridSize: number;
  /** Change quand le projet est remplacé (réinitialisation, chargement) : oublie tracé et dernier point. */
  projectKey?: number;
  /** Niveau affiché : en changer abandonne le tracé en cours et oublie le dernier point. */
  levelKey?: string;
  /**
   * Réticule décalé au doigt (lot 7.1) : le point visé est au-dessus du doigt, une loupe le montre
   * agrandi, et il est posé quand le doigt se lève.
   */
  reticle?: boolean;
  /** Types d'accrochage objet actifs. */
  snapTypes: readonly ObjectSnapType[];
  colorMode: ColorMode;
  /** Unité d'affichage et de saisie ; le modèle reste en millimètres. */
  displayUnit: DisplayUnit;
  layers: Layer[];
  blocks: BlockDef[];
  activeLayerId: string;
  activeBlockId: string | null;
  tool: ToolId;
  view: ViewReading;
  selectedId: string | null;
  selectedIds: string[];
  snapEnabled: boolean;
  orthoEnabled: boolean;
  onSelect: (id: string | null) => void;
  onSelectMany: (ids: string[]) => void;
  onAdd: (partial: NewCadObject) => void;
  onAddDimension: (targetId: string) => void;
  onInsertBlock: (blockId: string, x: number, y: number) => void;
  /** Pose d'un texte au point donné (outil Texte). */
  onPlaceText: (x: number, y: number) => void;
  /** Édition du contenu d'un texte existant (double-clic). */
  onEditText: (id: string) => void;
  /** Ajuster ou prolonger l'objet désigné au point donné. */
  onTrimExtend: (mode: 'trim' | 'extend', id: string, x: number, y: number) => void;
  /** Congé ou chanfrein entre deux lignes, chacune désignée du côté à conserver. */
  onCorner: (mode: 'fillet' | 'chamfer', first: { id: string; x: number; y: number }, second: { id: string; x: number; y: number }) => void;
  /** Décaler (lot 10.4) : objet désigné puis côté désigné. */
  onOffset?: (id: string, side: { x: number; y: number }) => void;
  /** Dalle (lot 13.1) : depuis la pièce sous le point, ou contour tracé point par point. */
  slabMode?: 'piece' | 'contour';
  onAddSlab?: (points: number[]) => void;
  onAddSlabFromRoom?: (x: number, y: number) => void;
  /** Toiture (lot 13.2) : deux coins opposés du contour. */
  onAddRoof?: (x1: number, y1: number, x2: number, y2: number) => void;
  /** Contrainte (lot 12.1) : élément désigné (sommet, segment, cercle) ; polylignes munies d'identifiants. */
  onConstraintPick?: (pick: Pick, polylines: Map<string, PolylineObj>) => void;
  /** Symboles des contraintes et éléments déjà désignés pour la contrainte en cours. */
  constraintMarks?: { id: string; glyph: string; at: { x: number; y: number }[]; state: string }[];
  constraintPicks?: { x: number; y: number }[];
  /** Étirer (lot 10.3) : modifications calculées sur les objets modifiables. */
  onStretch?: (patches: { id: string; patch: Partial<CadObject> }[]) => void;
  /** Outil Aire : contour désigné par points (aucun objet créé). */
  onMeasureArea: (points: number[]) => void;
  /** Outil Cote par points : points désignés, et nombre de points qui termine seul (angulaire 3, niveau 1). */
  onAddPointDimension: (points: number[]) => void;
  pdimAutoFinish?: number | null;
  /** Outil Mur : un mur de a vers b (les murs s'enchaînent point après point). */
  onAddWall?: (x1: number, y1: number, x2: number, y2: number) => void;
  /** Outil Ouverture : mur désigné et point cliqué (centre de la baie). */
  onAddOpening?: (wallId: string, x: number, y: number) => void;
  /** Outil Pièce : point intérieur désigné. */
  onAddRoom?: (x: number, y: number) => void;
  /** Note de terrain (lot 7.3) : point touché et objet désigné, s'il y en a un. */
  onAddNote?: (x: number, y: number, targetId?: string) => void;
  /** Images des fonds de plan (lot 6.2). */
  assets?: Record<string, Asset>;
  /** Outil Caler le fond : deux points désignés sur l'image (sans accrochage). */
  onCalibrate?: (points: number[]) => void;
  /** Outil Symbole : points désignés (un pour le nord et la cote de niveau, deux pour un repère de coupe). */
  onAddSymbol?: (points: number[]) => void;
  symbolPoints?: number;
  /** Type de symbole choisi : en changer abandonne le symbole commencé. */
  symbolKind?: string;
  onMoveMany: (ids: string[], dx: number, dy: number) => void;
  onCursor: (x: number | null, y: number | null) => void;
  onSnapChange: (snap: SnapPoint | null) => void;
  onZoomChange: (k: number) => void;
}


/** Les points d'un arc ne sont pas contraints par Ortho (ils seraient alignés). */
function isArcDraft(d: { kind: string } | null): boolean {
  return d?.kind === 'arc' || d?.kind === 'arcCenter' || d?.kind === 'ellipse' || d?.kind === 'stretch';
}

interface Draft {
  kind: 'line' | 'rect' | 'circle' | 'arc' | 'arcCenter' | 'ellipse' | 'stretch' | 'polyline' | 'measure';
  sx: number; sy: number;
  cx: number; cy: number;
  points: number[];
  /** Outil qui a commencé le tracé (une suite de points d'Aire ne devient jamais une polyligne). */
  origin?: ToolId;
}

/** Longueur d'une suite de sommets (une polyligne de longueur nulle n'est pas créée). */
function pathLength(p: number[]): number {
  let l = 0;
  for (let i = 2; i + 1 < p.length; i += 2) l += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return l;
}

/** Longueur en deçà de laquelle un tracé est considéré comme nul (mm) — aucune taille minimale métier. */
const MIN_LENGTH = 1e-6;
/** Déplacement minimal de la souris pour qu'un tracé soit pris en compte (pixels écran). */
const DRAG_THRESHOLD_PX = 3;
/** Main levée (lot 10.6) : écart maximal du tracé simplifié au geste, en pixels d'écran. */
const FREEHAND_TOLERANCE_PX = 1.5;

export default function CanvasView({
  objects,
  underlay,
  layers,
  blocks,
  activeLayerId,
  activeBlockId,
  tool,
  view,
  selectedIds,
  snapEnabled,
  orthoEnabled,
  onSelectMany,
  onAdd,
  onAddDimension,
  onInsertBlock,
  onPlaceText,
  onEditText,
  onTrimExtend,
  onCorner,
  onStretch,
  onOffset,
  onConstraintPick,
  slabMode,
  onAddSlab,
  onAddSlabFromRoom,
  onAddRoof,
  constraintMarks,
  constraintPicks,
  onMeasureArea,
  onAddPointDimension,
  onAddWall,
  onAddOpening,
  onAddRoom,
  onAddNote,
  onAddSymbol,
  symbolPoints = 1,
  symbolKind,
  assets,
  onCalibrate,
  pdimAutoFinish = null,
  onMoveMany,
  gridSize,
  projectKey,
  levelKey,
  reticle = false,
  snapTypes,
  colorMode,
  displayUnit,
  onCursor,
  onSnapChange,
  onZoomChange,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const cornerPick = useRef<{ tool: ToolId; id: string; x: number; y: number } | null>(null);
  // Une première ligne désignée ne vaut que pour le modèle affiché : tout changement d'outil,
  // d'objets (édition, annulation, version) l'oublie.
  useEffect(() => { cornerPick.current = null; }, [tool, objects]);
  const [tf, setTf] = useState({ x: 60, y: 40, k: 1 });
  const [draft, setDraft] = useState<Draft | null>(null);
  // Un tracé commencé sur un niveau ne se termine pas sur un autre, ni un symbole commencé sous un
  // autre type (état réinitialisé au rendu).
  const draftScope = `${levelKey ?? ''}|${symbolKind ?? ''}`;
  const [draftScopeSeen, setDraftScopeSeen] = useState(draftScope);
  if (draftScopeSeen !== draftScope) { setDraftScopeSeen(draftScope); setDraft(null); }
  const activeDraft = draft && (
    (draft.kind === 'polyline' && (draft.origin ?? 'polyline') === tool) ||
    (draft.kind === 'measure' && tool === 'measure') ||
    ((draft.kind === 'line' || draft.kind === 'rect' || draft.kind === 'circle' || draft.kind === 'arc' || draft.kind === 'arcCenter' || draft.kind === 'ellipse' || draft.kind === 'stretch') && draft.kind === tool)
  ) ? draft : null;
  const [hoverSnap, setHoverSnap] = useState<SnapPoint | null>(null);
  const [pointText, setPointText] = useState('');
  const [pointError, setPointError] = useState<string | null>(null);
  /** Dernier point posé (souris, doigt ou saisie) : origine des saisies relatives @. */
  const lastPlaced = useRef<Point | null>(null);
  useEffect(() => { lastPlaced.current = null; }, [projectKey, levelKey]);
  const applyPointRef = useRef<(text: string) => void>(() => {});
  const [pointFocused, setPointFocused] = useState(false);
  /** Longueur affichée dans l'unité choisie. */
  const showNum = (mm: number) => fmt(fromMm(mm, displayUnit), unitDecimals(displayUnit));
  const showLen = (mm: number) => `${showNum(mm)} ${displayUnit}`;
  const [lengthInput, setLengthInput] = useState('');
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Tracé de main levée en cours (lot 10.6), points du modèle.
  const [freehand, setFreehand] = useState<{ x: number; y: number }[] | null>(null);
  // Points du tracé à main levée, lus au relâcher : une référence, car le relâcher peut suivre
  // l'appui dans le même rendu (l'état n'y serait pas encore à jour).
  const freehandPts = useRef<{ x: number; y: number }[]>([]);
  const drag = useRef<{
    mode: 'pan' | 'move' | 'marquee' | 'freehand' | null;
    ids?: string[];
    lx: number;
    ly: number;
    grab?: Point;
    moved?: boolean;
    shift?: boolean;
  }>({ mode: null, lx: 0, ly: 0 });

  // Gestes tactiles : pointeurs actifs, pincement (zoom + déplacement) et précision du doigt.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; mx: number; my: number; tf0: { x: number; y: number; k: number } } | null>(null);
  const suppressUntilRelease = useRef(false);
  /** Vrai dès que l'utilisateur a agi sur la vue : l'ajustement automatique s'arrête. */
  const viewTouched = useRef(false);
  const coarse = useRef(false);
  const isCoarseDevice = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  const layerById = new Map(layers.map(l => [l.id, l]));
  const activeLayer = layerById.get(activeLayerId) ?? layers[0];
  // Fonds de plan dessinés en premier (sous le dessin) ; verrouillés, ils ne sont ni désignables ni modifiables.
  const shownList = objects.filter(o => layerById.get(o.layerId)?.visible !== false);
  const visibleObjects = [...shownList.filter(o => o.kind === 'underlay'), ...shownList.filter(o => o.kind !== 'underlay')];
  const editableObjects = visibleObjects.filter(o => layerById.get(o.layerId)?.locked !== true && !(o.kind === 'underlay' && o.locked));
  // Murs visibles : jonctions calculées ensemble (L, T, croix).
  const roomPolys = useMemo(() => roomPolygons(objects.filter(o => layers.find(l => l.id === o.layerId)?.visible !== false)), [objects, layers]);
  const wallGeom = useMemo(() => wallsGeometry(
    objects.filter((o): o is WallObj => o.kind === 'wall' && layers.find(l => l.id === o.layerId)?.visible !== false),
    objects.filter((o): o is OpeningObj => o.kind === 'opening'),
  ), [objects, layers]);
  const underlayShown = useMemo(() => (underlay ?? []).filter(o => layers.find(l => l.id === o.layerId)?.visible !== false), [underlay, layers]);
  const underlayGeom = useMemo(() => underlayShown.length === 0 ? null : {
    rooms: roomPolygons(underlayShown),
    walls: wallsGeometry(underlayShown.filter((o): o is WallObj => o.kind === 'wall'), underlayShown.filter((o): o is OpeningObj => o.kind === 'opening')),
  }, [underlayShown]);

  const toWorld = useCallback((e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - tf.x) / tf.k, y: (e.clientY - r.top - tf.y) / tf.k };
  }, [tf]);

  const resolvePoint = useCallback((point: Point, orthoOrigin?: Point): SnapPoint => {
    const tolerance = Math.max((coarse.current ? 18 : 8) / tf.k, 4);
    let snapped = snapEnabled
      // Perpendiculaire et tangent partent du point précédent d'un tracé en cours.
      ? findSnap(objects, layers, blocks, point.x, point.y, tolerance, gridSize, { types: snapTypes, from: activeDraft ? orthoOrigin : undefined })
      : { x: gridSnap(point.x, gridSize), y: gridSnap(point.y, gridSize), type: 'grid' as const, label: 'Grille', distance: 0 };
    if (orthoEnabled && orthoOrigin && snapped.type === 'grid') {
      const constrained = constrainOrtho(orthoOrigin, snapped);
      snapped = { ...snapped, x: constrained.x, y: constrained.y, label: 'Ortho' };
    }
    return snapped;
  }, [blocks, layers, objects, orthoEnabled, snapEnabled, tf.k, gridSize, snapTypes, activeDraft]);

  const updateHover = useCallback((point: Point | null) => {
    if (!point) {
      setHoverSnap(null);
      onSnapChange(null);
      onCursor(null, null);
      return;
    }
    const origin = isArcDraft(activeDraft) ? undefined :
      activeDraft && activeDraft.kind !== 'polyline' ? { x: activeDraft.sx, y: activeDraft.sy } :
      activeDraft?.kind === 'polyline' && activeDraft.points.length >= 2 ? { x: activeDraft.points[activeDraft.points.length - 2], y: activeDraft.points[activeDraft.points.length - 1] } :
      drag.current.mode === 'move' && drag.current.grab ? drag.current.grab : undefined;
    const snap = resolvePoint(point, origin);
    setHoverSnap(snap);
    onSnapChange(snap);
    onCursor(snap.x, snap.y);
  }, [activeDraft, onCursor, onSnapChange, resolvePoint]);

  useEffect(() => {
    onZoomChange(tf.k);
  }, [tf.k, onZoomChange]);

  // Les brouillons incompatibles sont purgés au prochain geste utilisateur,
  // sans effet de rendu synchrone.
  const discardIncompatibleDraft = useCallback(() => {
    setDraft(d => {
      if (!d) return d;
      const compatible =
        (d.kind === 'polyline' && (d.origin ?? 'polyline') === tool) ||
        (d.kind === 'measure' && tool === 'measure') ||
        ((d.kind === 'line' || d.kind === 'rect' || d.kind === 'circle' || d.kind === 'arc' || d.kind === 'arcCenter' || d.kind === 'ellipse' || d.kind === 'stretch') && d.kind === tool);
      return compatible ? d : null;
    });
  }, [tool]);

  const commitDraft = useCallback((d: Draft) => {
    if (!activeLayer || activeLayer.locked) return;
    lastPlaced.current = { x: d.cx, y: d.cy };
    const base = { classification: 'non-classifie' as Classification, layerId: activeLayer.id, hatch: 'none' as const };
    if (d.kind === 'line') {
      if (Math.hypot(d.cx - d.sx, d.cy - d.sy) > MIN_LENGTH) onAdd({ ...base, kind: 'line', x1: d.sx, y1: d.sy, x2: d.cx, y2: d.cy });
    } else if (d.kind === 'rect') {
      const x = Math.min(d.sx, d.cx), y = Math.min(d.sy, d.cy);
      const w = Math.abs(d.cx - d.sx), h = Math.abs(d.cy - d.sy);
      if (w > MIN_LENGTH && h > MIN_LENGTH) onAdd({ ...base, kind: 'rect', x, y, w, h });
    } else if (d.kind === 'circle') {
      const r = Math.hypot(d.cx - d.sx, d.cy - d.sy);
      if (r > MIN_LENGTH) onAdd({ ...base, kind: 'circle', cx: d.sx, cy: d.sy, r });
    }
  }, [activeLayer, onAdd]);

  const finishPolyline = useCallback(() => {
    // L'outil Aire réutilise le tracé de polyligne mais mesure au lieu de créer.
    if (tool === 'area') {
      if (draft?.kind === 'polyline' && draft.points.length >= 2) onMeasureArea(draft.points);
      setDraft(null);
      return;
    }
    if (tool === 'pdim') {
      if (draft?.kind === 'polyline' && draft.points.length >= 2) onAddPointDimension(draft.points);
      setDraft(null);
      return;
    }
    if (tool === 'slab') {
      if (draft?.kind === 'polyline' && draft.origin === 'slab') onAddSlab?.(draft.points);
      setDraft(null);
      return;
    }
    if (tool === 'wall') { setDraft(null); return; }
    if (tool === 'spline') {
      // Spline par points de contrôle : degré 3, ou moins s'il y a moins de quatre points.
      // Un double-clic pose deux fois le dernier point : les points confondus consécutifs sont retirés
      // (ils changeraient la courbe, contrairement à un segment nul de polyligne).
      const pts = draft?.kind === 'polyline' && draft.origin === 'spline' ? withoutRepeatedPoints(draft.points) : [];
      if (pts.length >= 4 && pathLength(pts) > MIN_LENGTH && activeLayer && !activeLayer.locked) {
        onAdd({ kind: 'spline', classification: 'non-classifie' as Classification, layerId: activeLayer.id, hatch: 'none', points: pts, degree: Math.min(3, pts.length / 2 - 1) });
      }
      setDraft(null);
      return;
    }
    setDraft(d => {
      // Seul un tracé commencé par l'outil Polyligne crée une polyligne.
      if (d?.kind === 'polyline' && (d.origin ?? 'polyline') === 'polyline' && d.points.length >= 4 && pathLength(d.points) > MIN_LENGTH && activeLayer && !activeLayer.locked) {
        onAdd({ kind: 'polyline', classification: 'non-classifie' as Classification, layerId: activeLayer.id, hatch: 'none', points: d.points });
      }
      return null;
    });
  }, [activeLayer, onAdd, tool, draft, onMeasureArea, onAddPointDimension, onAddSlab]);

  const startOrContinueDraft = useCallback((point: SnapPoint) => {
    // Mesurer ne crée rien : l'outil Aire ignore le verrouillage du calque. Étirer modifie les objets
    // des calques déverrouillés, quel que soit le calque actif.
    if ((!activeLayer || activeLayer.locked) && tool !== 'area' && tool !== 'stretch') return;
    lastPlaced.current = { x: point.x, y: point.y };
    if (tool === 'wall') {
      // Murs enchaînés : chaque nouveau point crée un mur depuis le précédent.
      const prev = activeDraft?.kind === 'polyline' && activeDraft.points.length >= 2
        ? { x: activeDraft.points[activeDraft.points.length - 2], y: activeDraft.points[activeDraft.points.length - 1] } : null;
      if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) > MIN_LENGTH) onAddWall?.(prev.x, prev.y, point.x, point.y);
      setDraft({ kind: 'polyline', sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [point.x, point.y], origin: 'wall' });
      return;
    }
    if (tool === 'pdim') {
      // Cote par points : les points s'ajoutent ; angulaire (3) et niveau (1) se terminent seuls.
      const previous = activeDraft?.kind === 'polyline' ? activeDraft.points : [];
      const pts = [...previous, point.x, point.y];
      if (pdimAutoFinish && pts.length / 2 >= pdimAutoFinish) {
        onAddPointDimension(pts);
        setDraft(null);
        return;
      }
      setDraft({ kind: 'polyline', sx: pts[0], sy: pts[1], cx: point.x, cy: point.y, points: pts, origin: 'pdim' });
      return;
    }
    if (tool === 'roof') {
      // Toiture : deux coins opposés du contour (nu extérieur des murs).
      const previous = activeDraft?.kind === 'polyline' && activeDraft.origin === 'roof' ? activeDraft.points : [];
      if (previous.length >= 2) {
        onAddRoof?.(previous[0], previous[1], point.x, point.y);
        setDraft(null);
        return;
      }
      setDraft({ kind: 'polyline', sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [point.x, point.y], origin: 'roof' });
      return;
    }
    if (tool === 'symbol') {
      // Symbole : nord et cote de niveau en un point, repère de coupe en deux.
      const previous = activeDraft?.kind === 'polyline' && activeDraft.origin === 'symbol' ? activeDraft.points : [];
      const pts = [...previous, point.x, point.y];
      if (pts.length / 2 >= symbolPoints) {
        onAddSymbol?.(pts);
        setDraft(null);
        return;
      }
      setDraft({ kind: 'polyline', sx: pts[0], sy: pts[1], cx: point.x, cy: point.y, points: pts, origin: 'symbol' });
      return;
    }
    if (tool === 'polyline' || tool === 'area' || tool === 'spline' || tool === 'slab') {
      setDraft(d => {
        if (d?.kind === 'polyline' && (d.origin ?? 'polyline') === tool) return { ...d, points: [...d.points, point.x, point.y], cx: point.x, cy: point.y };
        return { kind: 'polyline', sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [point.x, point.y], origin: tool };
      });
      return;
    }
    if (tool === 'arc' || tool === 'arcCenter') {
      // Arc : trois points successifs (début, passage, fin) ou (centre, début, fin).
      const previous = activeDraft?.kind === tool ? activeDraft.points : [];
      const pts = [...previous, point.x, point.y];
      if (pts.length < 6) {
        setDraft({ kind: tool, sx: pts[0], sy: pts[1], cx: point.x, cy: point.y, points: pts });
        return;
      }
      const [a, b, c] = [{ x: pts[0], y: pts[1] }, { x: pts[2], y: pts[3] }, { x: pts[4], y: pts[5] }];
      const geom = tool === 'arc' ? arcFrom3Points(a, b, c) : arcFromCenter(a, b, c);
      if (geom) {
        onAdd({ kind: 'arc', classification: 'non-classifie' as Classification, layerId: activeLayer.id, hatch: 'none', cx: geom.cx, cy: geom.cy, r: geom.r, start: geom.start, end: geom.end });
      }
      setDraft(null);
      return;
    }
    if (tool === 'stretch') {
      // Étirer : deux coins de la fenêtre de capture, puis point de base et point d'arrivée.
      const previous = activeDraft?.kind === 'stretch' ? activeDraft.points : [];
      const pts = [...previous, point.x, point.y];
      if (pts.length < 8) {
        setDraft({ kind: 'stretch', sx: pts[0], sy: pts[1], cx: point.x, cy: point.y, points: pts });
        return;
      }
      const win = windowOf({ x: pts[0], y: pts[1] }, { x: pts[2], y: pts[3] });
      const patches = stretchAll(editableObjects, win, pts[6] - pts[4], pts[7] - pts[5]);
      if (patches.length) onStretch?.(patches);
      setDraft(null);
      return;
    }
    if (tool === 'ellipse') {
      // Ellipse : centre, extrémité du premier axe, puis un point donnant le second demi-axe.
      const previous = activeDraft?.kind === 'ellipse' ? activeDraft.points : [];
      const pts = [...previous, point.x, point.y];
      if (pts.length < 6) {
        setDraft({ kind: 'ellipse', sx: pts[0], sy: pts[1], cx: point.x, cy: point.y, points: pts });
        return;
      }
      const geom = ellipseFrom3Points({ x: pts[0], y: pts[1] }, { x: pts[2], y: pts[3] }, { x: pts[4], y: pts[5] });
      if (geom) onAdd({ kind: 'ellipse', classification: 'non-classifie' as Classification, layerId: activeLayer.id, hatch: 'none', ...geom });
      setDraft(null);
      return;
    }
    if (tool === 'measure') {
      setDraft({ kind: 'measure', sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [] });
      return;
    }
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      setDraft({ kind: tool, sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [] });
    }
  }, [activeLayer, tool, activeDraft, onAdd, pdimAutoFinish, onAddPointDimension, onAddWall, onAddSymbol, symbolPoints, editableObjects, onStretch, onAddRoof]);

  const handleDown = (e: React.PointerEvent) => {
    discardIncompatibleDraft();
    const w = toWorld(e);

    if (tool === 'pan' || e.button === 1) {
      drag.current = { mode: 'pan', lx: e.clientX, ly: e.clientY };
      return;
    }
    if (tool === 'freehand') {
      // Main levée (lot 10.6) : le tracé suit le pointeur, sans accrochage, jusqu'au relâcher.
      if (!activeLayer || activeLayer.locked) return;
      drag.current = { mode: 'freehand', lx: w.x, ly: w.y };
      freehandPts.current = [w];
      setFreehand([w]);
      return;
    }
    if (tool === 'trim' || tool === 'extend') {
      // Désigner la portion à retirer (ajuster) ou l'extrémité à prolonger.
      const hit = hitTest(editableObjects, objects, blocks, w.x, w.y, (coarse.current ? 14 : 6) / tf.k);
      if (hit) onTrimExtend(tool, hit.id, w.x, w.y);
      return;
    }
    if (tool === 'room') {
      onAddRoom?.(w.x, w.y);
      return;
    }
    if (tool === 'note') {
      // Note jointe à l'objet touché (elle le suit), sinon au point touché.
      const hit = hitTest(editableObjects.filter(o => o.kind !== 'note' && o.kind !== 'underlay'), objects, blocks, w.x, w.y, (coarse.current ? 14 : 6) / tf.k);
      onAddNote?.(w.x, w.y, hit?.id);
      return;
    }
    if (tool === 'calibrate') {
      // Calage du fond : points pris tels quels sur l'image (aucun accrochage à la grille).
      const previous = activeDraft?.kind === 'polyline' && activeDraft.origin === 'calibrate' ? activeDraft.points : [];
      const pts = [...previous, w.x, w.y];
      if (pts.length >= 4) { setDraft(null); onCalibrate?.(pts); return; }
      setDraft({ kind: 'polyline', sx: w.x, sy: w.y, cx: w.x, cy: w.y, points: pts, origin: 'calibrate' });
      return;
    }
    if (tool === 'slab' && slabMode === 'piece') {
      // Dalle depuis une pièce (lot 13.1) : le point désigne la pièce, son contour est repris.
      onAddSlabFromRoom?.(w.x, w.y);
      return;
    }
    if (tool === 'opening') {
      // Ouverture : désigner le mur hôte ; la baie est centrée sur la projection du point.
      const host = editableObjects.find(o => o.kind === 'wall' && hitTest([o], objects, blocks, w.x, w.y, (coarse.current ? 14 : 6) / tf.k));
      if (host) onAddOpening?.(host.id, w.x, w.y);
      return;
    }
    if (tool === 'constraint') {
      // Contrainte : un sommet d'abord, sinon un segment, sinon un cercle ou un arc.
      const polylines = new Map<string, PolylineObj>();
      const pick = pickElement(editableObjects, w, (coarse.current ? 14 : 6) / tf.k, polylines);
      if (pick) onConstraintPick?.(pick, polylines);
      return;
    }
    if (tool === 'offset') {
      // Décaler : l'objet, puis un point du côté où poser la copie parallèle.
      const first = cornerPick.current;
      if (first?.tool === 'offset') {
        cornerPick.current = null;
        onOffset?.(first.id, { x: w.x, y: w.y });
        return;
      }
      const hit = hitTest(editableObjects, objects, blocks, w.x, w.y, (coarse.current ? 14 : 6) / tf.k);
      if (!hit) return;
      cornerPick.current = { tool, id: hit.id, x: w.x, y: w.y };
      onSelectMany([hit.id]);
      return;
    }
    if (tool === 'fillet' || tool === 'chamfer') {
      // Première ligne puis seconde, chacune touchée du côté à conserver.
      const hit = hitTest(editableObjects, objects, blocks, w.x, w.y, (coarse.current ? 14 : 6) / tf.k);
      if (!hit) return;
      const first = cornerPick.current;
      if (!first || first.tool !== tool || first.id === hit.id) {
        cornerPick.current = { tool, id: hit.id, x: w.x, y: w.y };
        onSelectMany([hit.id]);
        return;
      }
      cornerPick.current = null;
      onCorner(tool, first, { id: hit.id, x: w.x, y: w.y });
      return;
    }
    if (tool === 'select') {
      const hit = hitTest(editableObjects, objects, blocks, w.x, w.y, (coarse.current ? 14 : 6) / tf.k);
      if (hit) {
        if (e.shiftKey) {
          const next = selectedIds.includes(hit.id) ? selectedIds.filter(i => i !== hit.id) : [...selectedIds, hit.id];
          onSelectMany(next);
          drag.current = { mode: null, lx: 0, ly: 0 };
          return;
        }
        // Un membre de groupe non désigné entraîne tout son groupe, dans la sélection comme dans le glisser.
        const ids = selectedIds.includes(hit.id) ? selectedIds : expandToGroups(objects, [hit.id]);
        if (!selectedIds.includes(hit.id)) onSelectMany(ids);
        drag.current = { mode: 'move', ids, lx: w.x, ly: w.y, grab: { x: w.x, y: w.y }, moved: false };
      } else {
        if (!e.shiftKey) onSelectMany([]);
        drag.current = { mode: 'marquee', lx: w.x, ly: w.y, shift: e.shiftKey };
        setMarquee({ x1: w.x, y1: w.y, x2: w.x, y2: w.y });
      }
      return;
    }

    const origin = isArcDraft(activeDraft) ? undefined :
      activeDraft && activeDraft.kind !== 'polyline' ? { x: activeDraft.sx, y: activeDraft.sy } :
      activeDraft?.kind === 'polyline' && activeDraft.points.length >= 2 ? { x: activeDraft.points[activeDraft.points.length - 2], y: activeDraft.points[activeDraft.points.length - 1] } : undefined;
    const point = resolvePoint(w, origin);
    setHoverSnap(point);
    onSnapChange(point);

    if (tool === 'dimension') {
      const hit = hitTest(editableObjects, objects, blocks, point.x, point.y, 8 / tf.k);
      if (hit && hit.kind !== 'dimension' && hit.kind !== 'blockRef') onAddDimension(hit.id);
      return;
    }
    if (tool === 'block') {
      if (activeBlockId && activeLayer && !activeLayer.locked) { onInsertBlock(activeBlockId, point.x, point.y); lastPlaced.current = { x: point.x, y: point.y }; }
      return;
    }
    if (tool === 'text') {
      if (activeLayer && !activeLayer.locked) { onPlaceText(point.x, point.y); lastPlaced.current = { x: point.x, y: point.y }; }
      return;
    }
    if (activeDraft && (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'measure')) return;
    startOrContinueDraft(point);
  };

  const handleMove = (e: React.PointerEvent) => {
    const w = toWorld(e);

    if (drag.current.mode === 'pan') {
      const dx = e.clientX - drag.current.lx, dy = e.clientY - drag.current.ly;
      drag.current.lx = e.clientX; drag.current.ly = e.clientY;
      setTf(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
      updateHover(w);
      return;
    }
    if (drag.current.mode === 'freehand') {
      // Un point retenu dès que le pointeur a bougé d'un demi-pixel.
      if (Math.hypot(w.x - drag.current.lx, w.y - drag.current.ly) >= 0.5 / tf.k) {
        drag.current.lx = w.x; drag.current.ly = w.y;
        freehandPts.current = [...freehandPts.current, w];
        setFreehand(freehandPts.current);
      }
      onCursor(w.x, w.y);
      return;
    }
    if (drag.current.mode === 'marquee') {
      drag.current.moved = true;
      setMarquee(m => (m ? { ...m, x2: w.x, y2: w.y } : m));
      return;
    }
    if (drag.current.mode === 'move' && drag.current.ids && drag.current.grab) {
      const snap = resolvePoint(w, drag.current.grab);
      if (Math.hypot(snap.x - drag.current.grab.x, snap.y - drag.current.grab.y) > 2 / tf.k) drag.current.moved = true;
      updateHover(w);
      return;
    }
    if (activeDraft) {
      const origin = isArcDraft(activeDraft) ? undefined : activeDraft.kind === 'polyline' && activeDraft.points.length >= 2
        ? { x: activeDraft.points[activeDraft.points.length - 2], y: activeDraft.points[activeDraft.points.length - 1] }
        : { x: activeDraft.sx, y: activeDraft.sy };
      const snap = resolvePoint(w, origin);
      setDraft(d => (d ? { ...d, cx: snap.x, cy: snap.y } : d));
      setHoverSnap(snap);
      onSnapChange(snap);
      onCursor(snap.x, snap.y);
      return;
    }
    updateHover(w);
  };

  const handleUp = (e: React.PointerEvent) => {
    const w = toWorld(e);
    if (drag.current.mode === 'freehand') {
      // Tracé simplifié à 1,5 pixel d'écran (Douglas–Peucker), puis polyligne.
      const raw = [...freehandPts.current, w];
      freehandPts.current = [];
      const pts = simplifyPath(raw, FREEHAND_TOLERANCE_PX / tf.k).flatMap(p => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]);
      setFreehand(null);
      drag.current = { mode: null, lx: 0, ly: 0 };
      if (pts.length >= 4 && pathLength(pts) > DRAG_THRESHOLD_PX / tf.k && activeLayer && !activeLayer.locked) {
        onAdd({ kind: 'polyline', classification: 'non-classifie' as Classification, layerId: activeLayer.id, hatch: 'none', points: pts });
      }
      return;
    }
    if (drag.current.mode === 'move' && drag.current.ids && drag.current.grab && drag.current.moved) {
      const point = resolvePoint(w, drag.current.grab);
      const dx = Math.round((point.x - drag.current.grab.x) * 1000) / 1000;
      const dy = Math.round((point.y - drag.current.grab.y) * 1000) / 1000;
      if (dx !== 0 || dy !== 0) onMoveMany(drag.current.ids, dx, dy);
    } else if (drag.current.mode === 'marquee' && marquee) {
      const minX = Math.min(marquee.x1, marquee.x2);
      const maxX = Math.max(marquee.x1, marquee.x2);
      const minY = Math.min(marquee.y1, marquee.y2);
      const maxY = Math.max(marquee.y1, marquee.y2);
      // Un fond de plan ne se prend pas à la fenêtre (seulement en le touchant, en l'absence d'objet).
      const inside = editableObjects
        .filter(o => o.kind !== 'underlay')
        .filter(o => {
          const b = objectBounds(o, blocks, objects);
          return !!b && b.minX >= minX && b.maxX <= maxX && b.minY >= minY && b.maxY <= maxY;
        })
        .map(o => o.id);
      const base = drag.current.shift ? selectedIds : [];
      onSelectMany([...new Set([...base, ...inside])]);
      setMarquee(null);
    }
    drag.current = { mode: null, lx: 0, ly: 0 };

    if (activeDraft && (activeDraft.kind === 'line' || activeDraft.kind === 'rect' || activeDraft.kind === 'circle')) {
      const point = resolvePoint(w, { x: activeDraft.sx, y: activeDraft.sy });
      const finalDraft = { ...activeDraft, cx: point.x, cy: point.y };
      // Seuil de geste à la souris (en pixels écran) : un clic tremblé ne crée pas de micro-objet.
      // Les saisies chiffrées (longueur, coordonnées, inspecteur) n'ont aucun minimum.
      const minDrag = DRAG_THRESHOLD_PX / tf.k;
      const dx = Math.abs(finalDraft.cx - finalDraft.sx), dy = Math.abs(finalDraft.cy - finalDraft.sy);
      const intentional = finalDraft.kind === 'rect' ? dx >= minDrag && dy >= minDrag : Math.hypot(dx, dy) >= minDrag;
      if (intentional) commitDraft(finalDraft);
      setDraft(null);
    } else if (activeDraft?.kind === 'measure') {
      const point = resolvePoint(w, { x: activeDraft.sx, y: activeDraft.sy });
      setDraft({ ...activeDraft, cx: point.x, cy: point.y });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    viewTouched.current = true;
    const r = ref.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setTf(t => {
      const k = Math.min(12, Math.max(0.08, t.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const wx = (mx - t.x) / t.k, wy = (my - t.y) / t.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
  };

  /** Saisie directe de longueur : fixe l'extrémité courante à L mm le long de l'angle en cours. */
  const applyLength = useCallback(() => {
    // Une saisie de point (x;y, @dx;dy, @L<angle) tapée dans ce champ est traitée comme telle.
    if (/[;<@]/.test(lengthInput)) { applyPointRef.current(lengthInput); return; }
    const L = parseLength(lengthInput, displayUnit);
    if (!Number.isFinite(L) || L <= 0 || !activeDraft) return;
    const ox = activeDraft.kind === 'polyline' && activeDraft.points.length >= 2
      ? activeDraft.points[activeDraft.points.length - 2] : activeDraft.sx;
    const oy = activeDraft.kind === 'polyline' && activeDraft.points.length >= 2
      ? activeDraft.points[activeDraft.points.length - 1] : activeDraft.sy;
    const angle = Math.atan2(activeDraft.cy - oy, activeDraft.cx - ox);
    const ex = Math.round((ox + Math.cos(angle) * L) * 1000) / 1000;
    const ey = Math.round((oy + Math.sin(angle) * L) * 1000) / 1000;
    setLengthInput('');
    lastPlaced.current = { x: ex, y: ey };
    if (activeDraft.kind === 'polyline' && activeDraft.origin === 'roof') {
      // Toiture : comme le rectangle, la longueur saisie place le coin opposé dans la direction du curseur.
      if (L > MIN_LENGTH) onAddRoof?.(ox, oy, ex, ey);
      setDraft(null);
      return;
    }
    if (activeDraft.kind === 'polyline' && activeDraft.origin === 'wall') {
      // Mur : la longueur saisie crée le mur depuis le point précédent, la chaîne continue de son extrémité.
      if (activeLayer && !activeLayer.locked && L > MIN_LENGTH) onAddWall?.(ox, oy, ex, ey);
      setDraft({ kind: 'polyline', sx: ex, sy: ey, cx: ex, cy: ey, points: [ex, ey], origin: 'wall' });
      return;
    }
    if (activeDraft.kind === 'polyline') {
      setDraft(d => (d?.kind === 'polyline' ? { ...d, points: [...d.points, ex, ey], cx: ex, cy: ey } : d));
      return;
    }
    if (activeDraft.kind === 'circle') {
      if (activeLayer && !activeLayer.locked) {
        onAdd({ kind: 'circle', classification: 'non-classifie', layerId: activeLayer.id, hatch: 'none', cx: activeDraft.sx, cy: activeDraft.sy, r: L });
      }
      setDraft(null);
      return;
    }
    if (activeDraft.kind === 'line' || activeDraft.kind === 'rect') {
      commitDraft({ ...activeDraft, cx: ex, cy: ey });
      setDraft(null);
    }
  }, [lengthInput, activeDraft, activeLayer, onAdd, onAddWall, onAddRoof, commitDraft, displayUnit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') { setDraft(null); setLengthInput(''); }
      if (e.key === 'Enter') {
        if (lengthInput && activeDraft && activeDraft.kind !== 'measure' && !isArcDraft(activeDraft)) { applyLength(); return; }
        finishPolyline();
      }
      // Saisie dynamique : les chiffres tapés pendant un tracé alimentent la longueur directe.
      if (activeDraft && activeDraft.kind !== 'measure' && /^[0-9.,;<@-]$/.test(e.key)) {
        setLengthInput(v => v + e.key);
      }
      if (activeDraft && e.key === 'Backspace') setLengthInput(v => v.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishPolyline, activeDraft, lengthInput, applyLength]);

  /** Dernier point du tracé en cours, sinon dernier point posé. */
  const lastPoint = (): Point | null => {
    const d = activeDraft;
    if (d && (d.kind === 'polyline' || d.kind === 'arc' || d.kind === 'arcCenter' || d.kind === 'ellipse' || d.kind === 'stretch') && d.points.length >= 2) {
      return { x: d.points[d.points.length - 2], y: d.points[d.points.length - 1] };
    }
    if (d) return { x: d.sx, y: d.sy };
    return lastPlaced.current;
  };

  const applyPrecisePoint = (text = pointText) => {
    const parsed = parsePointInput(text, lastPoint(), displayUnit);
    if (!parsed.ok) { setPointError(parsed.error); return; }
    setPointError(null);
    setPointText('');
    setLengthInput('');
    const { x, y } = parsed.point;
    // Tout point saisi devient l'origine de la saisie relative suivante (bloc, texte, cote compris).
    lastPlaced.current = { x, y };
    const point: SnapPoint = { x, y, type: 'endpoint', label: 'Point saisi', distance: 0 };
    if (tool === 'dimension') {
      const hit = hitTest(editableObjects, objects, blocks, x, y, 8 / tf.k);
      if (hit && hit.kind !== 'dimension' && hit.kind !== 'blockRef') onAddDimension(hit.id);
      return;
    }
    if (tool === 'block') {
      if (activeBlockId && activeLayer && !activeLayer.locked) onInsertBlock(activeBlockId, x, y);
      return;
    }
    if (tool === 'text') {
      if (activeLayer && !activeLayer.locked) onPlaceText(x, y);
      return;
    }
    if (tool === 'slab' && slabMode === 'piece') {
      // Dalle depuis une pièce : le point désigne la pièce, son contour est repris.
      onAddSlabFromRoom?.(x, y);
      return;
    }
    if (tool === 'polyline' || tool === 'area' || tool === 'spline' || tool === 'slab' || tool === 'roof' || tool === 'pdim' || tool === 'wall' || tool === 'symbol' || tool === 'arc' || tool === 'arcCenter' || tool === 'ellipse' || tool === 'stretch') {
      startOrContinueDraft(point);
      return;
    }
    if (tool === 'measure') {
      if (activeDraft?.kind === 'measure') setDraft({ ...activeDraft, cx: x, cy: y });
      else setDraft({ kind: 'measure', sx: x, sy: y, cx: x, cy: y, points: [] });
      return;
    }
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      if (activeDraft?.kind === tool) {
        commitDraft({ ...activeDraft, cx: x, cy: y });
        setDraft(null);
      } else {
        startOrContinueDraft(point);
      }
    }
  };

  useEffect(() => { applyPointRef.current = applyPrecisePoint; });

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  // Au doigt, l'action du premier contact est différée jusqu'à ce que le geste soit confirmé :
  // glissement au-delà de quelques pixels, ou relâchement (tape). Un second doigt avant cela
  // transforme le geste en pincement sans rien modifier au dessin.
  const pendingDown = useRef<React.PointerEvent | null>(null);
  const draftAtGestureStart = useRef<Draft | null>(null);
  const TAP_SLOP_PX = 6;

  // ─── Réticule décalé et loupe (lot 7.1) ───────────────────────────────────────
  // Au doigt, le point visé est au-dessus du doigt (le doigt ne le cache pas) ; la loupe le montre
  // agrandi ; il est posé au lever du doigt, avec l'accrochage habituel.
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);
  const aiming = useRef(false);
  const sceneId = `scene-${useId().replace(/:/g, '')}`;
  const aimFor = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top - RETICLE_OFFSET_PX };
  };
  /** Événement de pointeur simulé au point visé (coordonnées écran du réticule). */
  const aimEvent = (p: { x: number; y: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { clientX: r.left + p.x, clientY: r.top + p.y, button: 0, shiftKey: false, pointerType: 'touch' } as unknown as React.PointerEvent;
  };
  // La main levée suit le doigt lui-même : pas de réticule décalé.
  const reticleTool = reticle && tool !== 'select' && tool !== 'pan' && tool !== 'freehand';

  const restoreGestureStart = () => {
    pendingDown.current = null;
    setDraft(draftAtGestureStart.current);
    setMarquee(null);
    setFreehand(null);
    freehandPts.current = [];
    drag.current = { mode: null, lx: 0, ly: 0 };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    viewTouched.current = true;
    coarse.current = e.pointerType !== 'mouse';
    if (e.pointerType === 'mouse' && e.button === 2) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // Deux doigts : le geste en cours est annulé (état d'avant le premier doigt) et la vue zoome.
      aiming.current = false;
      setAim(null);
      restoreGestureStart();
      const p = pinchState();
      pinch.current = { d0: p.d, mx: p.mx, my: p.my, tf0: tf };
      suppressUntilRelease.current = true;
      return;
    }
    if (pointers.current.size > 2 || suppressUntilRelease.current) return;
    if (e.pointerType === 'mouse') {
      handleDown(e);
      return;
    }
    draftAtGestureStart.current = draft;
    if (reticleTool && e.pointerType === 'touch') {
      // Réticule (doigt seulement ; un stylet pointe directement) : le doigt déplace le point visé ;
      // rien n'est posé avant le lever.
      aiming.current = true;
      const p = aimFor(e);
      setAim(p);
      handleMove(aimEvent(p));
      return;
    }
    if (tool === 'freehand') {
      // Main levée : le tracé commence au contact, sans attendre la confirmation du geste (un trait
      // court est un trait). Un second doigt l'annule comme tout geste (restoreGestureStart).
      handleDown(e);
      return;
    }
    e.persist?.();
    pendingDown.current = e;
  };

  const flushPendingDown = () => {
    const pending = pendingDown.current;
    pendingDown.current = null;
    if (pending) handleDown(pending);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const r = ref.current!.getBoundingClientRect();
      const p = pinchState();
      const { tf0, d0, mx, my } = pinch.current;
      const k = Math.min(12, Math.max(0.08, tf0.k * (p.d / d0)));
      const wx = (mx - r.left - tf0.x) / tf0.k, wy = (my - r.top - tf0.y) / tf0.k;
      setTf({ k, x: p.mx - r.left - wx * k, y: p.my - r.top - wy * k });
      return;
    }
    if (suppressUntilRelease.current) return;
    // Au doigt, pas de survol : seuls les glissements comptent.
    if (e.pointerType !== 'mouse' && !pointers.current.has(e.pointerId)) return;
    if (aiming.current) {
      const p = aimFor(e);
      setAim(p);
      handleMove(aimEvent(p));
      return;
    }
    const pending = pendingDown.current;
    if (pending) {
      if (Math.hypot(e.clientX - pending.clientX, e.clientY - pending.clientY) < TAP_SLOP_PX) return;
      flushPendingDown();
      return;
    }
    handleMove(e);
  };

  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    const tracked = pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (suppressUntilRelease.current) {
      if (pointers.current.size === 0) suppressUntilRelease.current = false;
      return;
    }
    if (aiming.current) {
      aiming.current = false;
      const p = aimFor(e);
      setAim(null);
      if (e.type === 'pointercancel') { restoreGestureStart(); return; }
      // Lever du doigt : le point visé est posé comme un clic. Les outils à glisser (ligne,
      // rectangle, cercle, mesure) prennent leurs deux points en deux gestes.
      const at = aimEvent(p);
      const dragTool = tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'measure';
      if (dragTool && !activeDraft) { handleDown(at); return; }
      handleDown(at);
      handleUp(at);
      return;
    }
    if (e.type === 'pointercancel') {
      // Geste interrompu par le navigateur : rien de ce geste ne doit subsister.
      if (e.pointerType === 'mouse') {
        drag.current = { mode: null, lx: 0, ly: 0 };
        setMarquee(null);
        setFreehand(null);
        freehandPts.current = [];
      } else {
        restoreGestureStart();
      }
      return;
    }
    const pending = pendingDown.current;
    if (pending) {
      // Tape : les outils à glisser (ligne, rectangle, cercle, mesure) ne démarrent rien.
      pendingDown.current = null;
      if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'measure') return;
      handleDown(pending);
      handleUp(e);
      return;
    }
    if (tracked || e.pointerType === 'mouse') handleUp(e);
  };

  const fitView = () => {
    const base = projectBounds(visibleObjects, blocks);
    const rect = ref.current?.getBoundingClientRect();
    if (!base || !rect) return;
    // Marge proportionnelle : une marge fixe écraserait les zones basses (téléphone en paysage).
    const pad = Math.min(70, rect.width * 0.08, rect.height * 0.08);
    const scaleFor = (b: typeof base) => Math.min(4, Math.max(0.08, Math.min(
      (rect.width - pad * 2) / Math.max(1, b.maxX - b.minX), (rect.height - pad * 2) / Math.max(1, b.maxY - b.minY))));
    // Annotations (nomenclature, repères, symboles) à taille papier fixe : leur emprise dépend du
    // zoom ; quelques passes suffisent à faire tenir le tableau entier.
    const annotations = visibleObjects.filter(isAnnotation);
    let bounds = base, k = scaleFor(base);
    for (let i = 0; i < 4 && annotations.length; i++) {
      const u = SCREEN_PX_PER_PAPER_MM / k;
      const extents = annotations.map(o => annotationGeometry(o, u, objects, blocks)).map(g => (g ? annotationBounds(g) : null)).filter((b): b is NonNullable<typeof b> => !!b);
      bounds = unionBounds([base, ...extents])!;
      k = scaleFor(bounds);
    }
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    setTf({
      k,
      x: (rect.width - width * k) / 2 - bounds.minX * k,
      y: (rect.height - height * k) / 2 - bounds.minY * k,
    });
  };

  const resetView = () => setTf({ x: 60, y: 40, k: 1 });

  // Taille de la zone de travail (grille de fond) et ajustement automatique sur petit écran :
  // tant que l'utilisateur n'a pas touché la vue, le dessin suit la taille de la zone
  // (ouverture, rotation de l'écran, panneau plié ou déplié).
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const fitRef = useRef(fitView);
  useEffect(() => { fitRef.current = fitView; });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setViewSize({ w: r.width, h: r.height });
      if (!viewTouched.current && window.innerWidth < 1024 && r.width > 0 && r.height > 0) fitRef.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cursorClass = tool === 'pan' ? 'canvas-grab' : tool === 'select' ? 'canvas-move' : 'canvas-cross';
  const measure = activeDraft?.kind === 'measure'
    ? { d: Math.hypot(activeDraft.cx - activeDraft.sx, activeDraft.cy - activeDraft.sy), dx: activeDraft.cx - activeDraft.sx, dy: activeDraft.cy - activeDraft.sy }
    : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        ref={ref}
        data-testid="canvas"
        className={`h-full w-full select-none ${cursorClass}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={e => { if (e.pointerType === 'mouse' && pointers.current.size === 0) { updateHover(null); drag.current = { mode: null, lx: 0, ly: 0 }; } }}
        onContextMenu={e => e.preventDefault()}
        onWheel={handleWheel}
        onDoubleClick={e => {
          if (tool === 'select') {
            const w = toWorld(e);
            const hit = hitTest(editableObjects, objects, blocks, w.x, w.y, 6 / tf.k);
            if (hit?.kind === 'text') { onEditText(hit.id); return; }
          }
          finishPolyline();
        }}
      >
        <defs>
          {/* Grille : trait fin au pas choisi, trait marqué tous les dix pas ; le trait fin
              disparaît quand il deviendrait illisible (moins de 4 px entre deux lignes). */}
          <pattern id="grid-min" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#131c31" strokeWidth={0.5 / tf.k} />
          </pattern>
          <pattern id="grid-maj" width={gridSize * 10} height={gridSize * 10} patternUnits="userSpaceOnUse">
            {gridSize * tf.k >= 4 && <rect width={gridSize * 10} height={gridSize * 10} fill="url(#grid-min)" />}
            <path d={`M ${gridSize * 10} 0 L 0 0 0 ${gridSize * 10}`} fill="none" stroke="#1c2947" strokeWidth={1 / tf.k} />
          </pattern>
          <pattern id="hatch-diagonal" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#22d3ee" strokeWidth="1" opacity="0.45" />
          </pattern>
          <pattern id="hatch-cross" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 10 M 10 0 L 0 10" stroke="#22d3ee" strokeWidth="0.8" opacity="0.38" />
          </pattern>
          <marker id="dim-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
          </marker>
        </defs>

        <rect width="100%" height="100%" fill="#070b16" />
        <g id={sceneId} transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`}>
          <rect x={-tf.x / tf.k - 100} y={-tf.y / tf.k - 100} width={(viewSize.w || 4000) / tf.k + 200} height={(viewSize.h || 4000) / tf.k + 200} fill="url(#grid-maj)" />
          <line x1={-100000} y1={0} x2={100000} y2={0} stroke="#22304f" strokeWidth={1 / tf.k} />
          <line x1={0} y1={-100000} x2={0} y2={100000} stroke="#22304f" strokeWidth={1 / tf.k} />

          {hoverSnap && (
            <g pointerEvents="none">
              <line x1={hoverSnap.x} y1={-100000} x2={hoverSnap.x} y2={100000} stroke="#22d3ee" strokeWidth={0.6 / tf.k} opacity={0.18} />
              <line x1={-100000} y1={hoverSnap.y} x2={100000} y2={hoverSnap.y} stroke="#22d3ee" strokeWidth={0.6 / tf.k} opacity={0.18} />
            </g>
          )}

          {underlayGeom && (
            <g data-testid="fond-de-plan" opacity={0.22} pointerEvents="none">
              {underlayShown.map(o => (
                <ObjectShape key={o.id} obj={o} objects={underlayShown} blocks={blocks} view={view} selected={false}
                  zoom={tf.k} unit={displayUnit} layer={layerById.get(o.layerId)} colorMode={colorMode}
                  hatchPrefix="sous-" walls={underlayGeom.walls} rooms={underlayGeom.rooms} />
              ))}
            </g>
          )}

          {visibleObjects.map(o => (
            <ObjectShape
              key={o.id}
              walls={wallGeom}
              rooms={roomPolys}
              obj={o}
              objects={objects}
              blocks={blocks}
              view={view}
              selected={selectedIds.includes(o.id)}
              zoom={tf.k}
              unit={displayUnit}
              layer={layerById.get(o.layerId)}
              colorMode={colorMode}
              assets={assets}
            />
          ))}

          {marquee && (
            <rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="#22d3ee"
              fillOpacity={0.06}
              stroke="#22d3ee"
              strokeWidth={1 / tf.k}
              strokeDasharray={`${4 / tf.k} ${3 / tf.k}`}
              pointerEvents="none"
            />
          )}

          {activeDraft && activeDraft.kind === 'line' && (
            <line x1={activeDraft.sx} y1={activeDraft.sy} x2={activeDraft.cx} y2={activeDraft.cy} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
          )}
          {activeDraft && activeDraft.kind === 'rect' && (
            <rect x={Math.min(activeDraft.sx, activeDraft.cx)} y={Math.min(activeDraft.sy, activeDraft.cy)} width={Math.abs(activeDraft.cx - activeDraft.sx)} height={Math.abs(activeDraft.cy - activeDraft.sy)}
              fill="#22d3ee" fillOpacity={0.08} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
          )}
          {activeDraft && activeDraft.kind === 'circle' && (
            <circle cx={activeDraft.sx} cy={activeDraft.sy} r={Math.hypot(activeDraft.cx - activeDraft.sx, activeDraft.cy - activeDraft.sy)}
              fill="#22d3ee" fillOpacity={0.08} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
          )}
          {activeDraft && activeDraft.kind === 'polyline' && tool === 'spline' && (() => {
            // Aperçu : polygone de contrôle et spline passant par le curseur comme dernier point.
            const pts = [...activeDraft.points, activeDraft.cx, activeDraft.cy];
            const preview = { points: pts, degree: Math.min(3, pts.length / 2 - 1) };
            return (
              <g>
                <polyline points={pts.join(',')} fill="none" stroke="#22d3ee" strokeOpacity={0.4} strokeWidth={1 / tf.k} strokeDasharray={`${3 / tf.k} ${3 / tf.k}`} />
                {preview.degree >= 1 && <path data-apercu-spline d={splinePath(preview, 0.5 / tf.k)} fill="none" stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />}
              </g>
            );
          })()}
          {activeDraft && activeDraft.kind === 'polyline' && activeDraft.origin === 'roof' && (
            <rect data-apercu-toiture x={Math.min(activeDraft.sx, activeDraft.cx)} y={Math.min(activeDraft.sy, activeDraft.cy)} width={Math.abs(activeDraft.cx - activeDraft.sx)} height={Math.abs(activeDraft.cy - activeDraft.sy)}
              fill="none" stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
          )}
          {activeDraft && activeDraft.kind === 'polyline' && tool !== 'spline' && activeDraft.origin !== 'roof' && (
            tool === 'area' || tool === 'slab'
              ? <polygon points={[...activeDraft.points, activeDraft.cx, activeDraft.cy].join(',')} fill="#34d399" fillOpacity={0.12}
                  stroke="#34d399" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
              : <polyline points={[...activeDraft.points, activeDraft.cx, activeDraft.cy].join(',')} fill="none"
                  stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
          )}
          {activeDraft && (activeDraft.kind === 'arc' || activeDraft.kind === 'arcCenter') && (() => {
            // Aperçu : segment vers le curseur au 1er point, arc complet ensuite.
            const p = activeDraft.points;
            const cur = { x: activeDraft.cx, y: activeDraft.cy };
            const dash = `${6 / tf.k} ${4 / tf.k}`;
            if (p.length < 4) {
              return <line x1={p[0]} y1={p[1]} x2={cur.x} y2={cur.y} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={dash} />;
            }
            const a = { x: p[0], y: p[1] }, b = { x: p[2], y: p[3] };
            const geom = activeDraft.kind === 'arc' ? arcFrom3Points(a, b, cur) : arcFromCenter(a, b, cur);
            return (
              <g>
                {activeDraft.kind === 'arcCenter' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#22d3ee" strokeWidth={1 / tf.k} strokeDasharray={dash} />}
                <circle cx={b.x} cy={b.y} r={3 / tf.k} fill="#22d3ee" />
                {geom && <path d={arcSvgPath(geom)} fill="none" stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={dash} />}
              </g>
            );
          })()}
          {constraintMarks?.map(m => m.at.map((p, i) => (
            // Symboles de contrainte : décalés d'un coin, à taille d'écran constante ; rouge en conflit,
            // orange à réparer, gris si redondante.
            <text key={`${m.id}-${i}`} data-contrainte={m.id} data-etat={m.state} x={p.x + 6 / tf.k} y={p.y - 6 / tf.k} fontSize={11 / tf.k}
              fill={m.state === 'conflit' ? '#f87171' : m.state === 'à réparer' ? '#fb923c' : m.state === 'redondante' ? '#94a3b8' : '#a78bfa'}
              fontFamily="ui-monospace, monospace" style={{ pointerEvents: 'none' }}>{m.glyph}</text>
          )))}
          {constraintPicks?.map((p, i) => <circle key={`pick-${i}`} data-designe cx={p.x} cy={p.y} r={5 / tf.k} fill="none" stroke="#a78bfa" strokeWidth={1.5 / tf.k} />)}
          {freehand && freehand.length > 1 && (
            <polyline data-apercu-main-levee points={freehand.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {activeDraft && activeDraft.kind === 'stretch' && (() => {
            // Aperçu : fenêtre de capture (verte, pointillée), sommets capturés, puis déplacement.
            const p = activeDraft.points;
            const cur = { x: activeDraft.cx, y: activeDraft.cy };
            const dash = `${6 / tf.k} ${4 / tf.k}`;
            const win = windowOf({ x: p[0], y: p[1] }, p.length >= 4 ? { x: p[2], y: p[3] } : cur);
            // Sommets à la place que leur donnera l'étirement (contraintes du rectangle comprises).
            const caught = stretchPreview(editableObjects, win, p.length >= 6 ? cur.x - p[4] : 0, p.length >= 6 ? cur.y - p[5] : 0);
            const h = 3 / tf.k;
            return (
              <g data-apercu-etirer>
                <rect x={win.minX} y={win.minY} width={win.maxX - win.minX} height={win.maxY - win.minY} fill="#34d399" fillOpacity={0.06} stroke="#34d399" strokeWidth={1 / tf.k} strokeDasharray={dash} />
                {caught.map((q, i) => <rect key={i} data-sommet-capture data-x={q.x} data-y={q.y} x={q.x - h} y={q.y - h} width={2 * h} height={2 * h} fill="none" stroke="#34d399" strokeWidth={1 / tf.k} />)}
                {p.length >= 6 && <line x1={p[4]} y1={p[5]} x2={cur.x} y2={cur.y} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={dash} />}
              </g>
            );
          })()}
          {activeDraft && activeDraft.kind === 'ellipse' && (() => {
            // Aperçu : premier axe vers le curseur, puis ellipse complète.
            const p = activeDraft.points;
            const cur = { x: activeDraft.cx, y: activeDraft.cy };
            const dash = `${6 / tf.k} ${4 / tf.k}`;
            if (p.length < 4) return <line x1={p[0]} y1={p[1]} x2={cur.x} y2={cur.y} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={dash} />;
            const geom = ellipseFrom3Points({ x: p[0], y: p[1] }, { x: p[2], y: p[3] }, cur);
            return (
              <g>
                <line x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke="#22d3ee" strokeWidth={1 / tf.k} strokeDasharray={dash} />
                {geom && <path data-apercu-ellipse d={ellipsePath(geom)} fill="none" stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={dash} />}
              </g>
            );
          })()}
          {activeDraft && activeDraft.kind === 'measure' && measure && (
            <g>
              <line x1={activeDraft.sx} y1={activeDraft.sy} x2={activeDraft.cx} y2={activeDraft.cy} stroke="#34d399" strokeWidth={1.5 / tf.k} markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
              <circle cx={activeDraft.sx} cy={activeDraft.sy} r={3 / tf.k} fill="#34d399" />
              <text x={(activeDraft.sx + activeDraft.cx) / 2} y={(activeDraft.sy + activeDraft.cy) / 2 - 8 / tf.k} fontSize={11 / tf.k} fill="#34d399" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                {showLen(measure.d)} · ΔX {showNum(measure.dx)} · ΔY {showNum(measure.dy)}
              </text>
            </g>
          )}
          {activeDraft && activeDraft.kind !== 'measure' && <circle cx={activeDraft.sx} cy={activeDraft.sy} r={3 / tf.k} fill="#22d3ee" />}
          {activeDraft && (activeDraft.kind === 'line' || activeDraft.kind === 'circle' || activeDraft.kind === 'polyline') && (() => {
            const ox = activeDraft.kind === 'polyline' && activeDraft.points.length >= 2
              ? activeDraft.points[activeDraft.points.length - 2] : activeDraft.sx;
            const oy = activeDraft.kind === 'polyline' && activeDraft.points.length >= 2
              ? activeDraft.points[activeDraft.points.length - 1] : activeDraft.sy;
            const len = Math.hypot(activeDraft.cx - ox, activeDraft.cy - oy);
            if (len <= MIN_LENGTH) return null;
            return (
              <text x={(ox + activeDraft.cx) / 2 + 10 / tf.k} y={(oy + activeDraft.cy) / 2 - 8 / tf.k}
                fontSize={11 / tf.k} fill="#22d3ee" fontFamily="JetBrains Mono, monospace" pointerEvents="none">
                {activeDraft.kind === 'circle' ? 'R' : 'L'} {showLen(len)}
              </text>
            );
          })()}
          {hoverSnap && <SnapMarker snap={hoverSnap} zoom={tf.k} />}
        </g>
        {aim && <Loupe aim={aim} sceneId={sceneId} width={viewSize.w} height={viewSize.h} />}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3 hidden rounded-sm border sm:block border-border bg-[#0c1220]/90 px-2 py-1 font-mono text-[10px] text-muted-foreground">
        <span className="text-cyan-300">{hoverSnap ? snapLabel(hoverSnap.type) : snapEnabled ? 'Accrochage objet' : 'Grille seule'}</span>
        <span className="mx-2 text-border">|</span>
        <span>{orthoEnabled ? 'ORTHO actif' : 'ORTHO inactif'}</span>
        <span className="mx-2 text-border">|</span>
        <span>zoom {(tf.k * 100).toFixed(0)} %</span>
      </div>

      <div className="absolute right-3 top-3 flex gap-1">
        <button onClick={() => { viewTouched.current = true; fitView(); }} title="Cadrer tout le dessin visible" className="rounded-sm border border-border bg-[#0c1220]/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-cyan-300">
          Cadrer
        </button>
        <button onClick={() => { viewTouched.current = true; resetView(); }} className="rounded-sm border border-border bg-[#0c1220]/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-cyan-300">
          100 %
        </button>
      </div>

      {(tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'arc' || tool === 'arcCenter' || tool === 'ellipse' || tool === 'spline' || tool === 'stretch' || tool === 'polyline' || tool === 'area' || (tool === 'slab' && slabMode !== 'piece') || tool === 'roof' || tool === 'pdim' || tool === 'wall' || tool === 'symbol' || tool === 'measure' || tool === 'dimension' || tool === 'block' || tool === 'text') && (
        <div className="absolute bottom-3 left-3 right-3 flex flex-col items-start gap-1 sm:right-auto">
          {/* Pas de longueur directe pour un arc : la saisie de point précis reste disponible. */}
          {activeDraft && activeDraft.kind !== 'measure' && !isArcDraft(activeDraft) && (
            <div className="flex max-w-full flex-wrap items-center gap-1 rounded-sm border border-cyan-400/50 bg-[#0c1220]/95 p-1 font-mono text-[10px] text-muted-foreground shadow-lg">
              <span className="px-1 uppercase tracking-wider text-cyan-300">Longueur</span>
              <input
                value={lengthInput}
                onChange={e => setLengthInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); applyLength(); } }}
                aria-label="Longueur ou point relatif"
                placeholder={activeDraft.kind === 'circle' ? `Rayon ${displayUnit}` : `L ${displayUnit} · @L<a`}
                autoFocus={!isCoarseDevice && !pointFocused}
                className="w-24 rounded-sm border border-input bg-background px-1.5 py-1 text-foreground outline-none focus:border-cyan-400"
              />
              <button onClick={applyLength} className="rounded-sm bg-cyan-400 px-2 py-1 font-semibold uppercase tracking-wider text-[#050810] hover:bg-cyan-300">
                Appliquer
              </button>
              {activeDraft.kind === 'polyline' && (
                <button onClick={finishPolyline} className="rounded-sm border border-cyan-400/60 px-2 py-1 font-semibold uppercase tracking-wider text-cyan-300 hover:bg-cyan-400/10">
                  Terminer
                </button>
              )}
            </div>
          )}
          <div className="flex max-w-full flex-wrap items-center gap-1 rounded-sm border border-border bg-[#0c1220]/95 p-1 font-mono text-[10px] text-muted-foreground shadow-lg">
            <span className="px-1 uppercase tracking-wider">Point précis</span>
            <input
              aria-label="Point précis"
              value={pointText}
              onChange={e => { setPointText(e.target.value); setPointError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); applyPrecisePoint(); } }}
              onFocus={() => setPointFocused(true)}
              onBlur={() => setPointFocused(false)}
              placeholder={`x;y · @dx;dy · @L<a (${displayUnit})`}
              className="w-44 rounded-sm border border-input bg-background px-1.5 py-1 text-foreground outline-none focus:border-cyan-400"
            />
            <button onClick={() => applyPrecisePoint()} className="rounded-sm bg-cyan-400 px-2 py-1 font-semibold uppercase tracking-wider text-[#050810] hover:bg-cyan-300">
              Placer
            </button>
            {pointError && <span role="alert" className="basis-full px-1 text-amber-300">{pointError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SnapMarker({ snap, zoom }: { snap: SnapPoint; zoom: number }) {
  const s = 6 / zoom;
  const color = snap.type === 'grid' ? '#8b93a7' : snap.type === 'intersection' ? '#fb7185' : '#22d3ee';
  return (
    <g pointerEvents="none">
      {snap.type === 'endpoint' || snap.type === 'corner' || snap.type === 'insertion' ? (
        <rect x={snap.x - s / 2} y={snap.y - s / 2} width={s} height={s} fill="none" stroke={color} strokeWidth={1.4 / zoom} />
      ) : snap.type === 'midpoint' ? (
        <path d={`M ${snap.x} ${snap.y - s / 2} L ${snap.x + s / 2} ${snap.y + s / 2} L ${snap.x - s / 2} ${snap.y + s / 2} Z`} fill="none" stroke={color} strokeWidth={1.4 / zoom} />
      ) : snap.type === 'intersection' ? (
        <path d={`M ${snap.x - s / 2} ${snap.y - s / 2} L ${snap.x + s / 2} ${snap.y + s / 2} M ${snap.x + s / 2} ${snap.y - s / 2} L ${snap.x - s / 2} ${snap.y + s / 2}`} stroke={color} strokeWidth={1.4 / zoom} />
      ) : (
        <circle cx={snap.x} cy={snap.y} r={s / 2} fill="none" stroke={color} strokeWidth={1.4 / zoom} />
      )}
      {snap.type !== 'grid' && (
        <text x={snap.x + 9 / zoom} y={snap.y - 8 / zoom} fontSize={10 / zoom} fill={color} fontFamily="JetBrains Mono, monospace">
          {snap.label}
        </text>
      )}
    </g>
  );
}

export function ObjectShape({ obj, objects, blocks, view, selected, zoom, unit, layer, colorMode, paperScale, hatchPrefix, walls, rooms, assets }: {
  obj: CadObject;
  /** Images des fonds de plan (lot 6.2). */
  assets?: Record<string, Asset>;
  /** Préfixe des motifs de hachure (une fenêtre de feuille définit les siens, au pas papier). */
  hatchPrefix?: string;
  /** Géométrie des murs, jonctions nettoyées (calculée une fois pour tous les murs affichés). */
  walls?: Map<string, WallGeometry>;
  /** Contours des pièces (null : pièce non fermée). */
  rooms?: Map<string, { x: number; y: number }[] | null>;
  unit: DisplayUnit;
  layer: Layer | undefined;
  colorMode: ColorMode;
  /** Rendu dans une fenêtre de feuille : traits et annotations à leurs tailles papier (lot 2.4). */
  paperScale?: DrawingScale;
  objects: CadObject[];
  blocks: BlockDef[];
  view: ViewReading;
  selected: boolean;
  zoom: number;
}) {
  if (obj.kind === 'dimension') return <DimensionShape obj={obj} objects={objects} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} paperScale={paperScale} />;
  if (obj.kind === 'blockRef') return <BlockRefShape obj={obj} blocks={blocks} view={view} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} paperScale={paperScale} hatchPrefix={hatchPrefix} />;
  if (obj.kind === 'text') return <TextShape obj={obj} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} />;
  if (obj.kind === 'pdim') return <PointDimensionShape obj={obj} selected={selected} zoom={zoom} paperScale={paperScale} layer={layer} colorMode={colorMode} />;
  if (obj.kind === 'underlay') return <UnderlayShape obj={obj} asset={assets?.[obj.assetId]} selected={selected} zoom={zoom} />;
  if (obj.kind === 'note') return <NoteShape obj={obj} objects={objects} blocks={blocks} selected={selected} zoom={zoom} />;
  if (obj.kind === 'cut') return <CutShape obj={obj} objects={objects} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} paperScale={paperScale} />;
  if (obj.kind === 'views') return <ViewsShape obj={obj} objects={objects} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} paperScale={paperScale} />;
  if (isAnnotation(obj)) return <SymbolShape obj={obj} objects={objects} blocks={blocks} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} paperScale={paperScale} />;
  if (obj.kind === 'room') return <RoomShape obj={obj} poly={rooms?.get(obj.id) ?? null} selected={selected} zoom={zoom} paperScale={paperScale} />;
  if (obj.kind === 'opening') {
    const host = objects.find(o => o.id === obj.hostId);
    return host?.kind === 'wall' ? <OpeningShape obj={obj} wall={host} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} paperScale={paperScale} /> : null;
  }
  if (obj.kind === 'wall') return <WallShape obj={obj} geom={walls?.get(obj.id)} view={view} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} paperScale={paperScale} hatchPrefix={hatchPrefix} />;
  const islands = (obj.holes ?? []).map(id => objects.find(o => o.id === id)).filter((o): o is CadObject => !!o);
  if (obj.kind === 'roof') {
    // Toiture (lot 13.2) : rive, faîtage, arêtiers et flèches de pente.
    return <g data-toiture={obj.id}>{roofPrimitives(obj, roofInput(obj)).map(p => <PrimitiveShape key={p.id} obj={p} view={view} selected={selected} zoom={zoom} showLabel={false} unit={unit} layer={layer} colorMode={colorMode} paperScale={paperScale} hatchPrefix={hatchPrefix} islands={[]} />)}</g>;
  }
  // Dalle (lot 13.1) : dessinée comme son contour fermé.
  return <PrimitiveShape obj={obj.kind === 'slab' ? slabAsPolyline(obj) as PolylineObj : obj} view={view} selected={selected} zoom={zoom} showLabel={selected && !paperScale} unit={unit} layer={layer} colorMode={colorMode} paperScale={paperScale} hatchPrefix={hatchPrefix} islands={islands} />;
}

/**
 * Mur : remplissage et hachures du quadrilatère (après jonctions), puis traits visibles nettoyés.
 * Trait par défaut : contour vu fort (0,5 mm), sauf propriété de trait propre au mur ou au calque.
 */
function WallShape({ obj, geom, view, selected, zoom, layer, colorMode, paperScale, hatchPrefix }: {
  obj: WallObj; geom?: WallGeometry; view: ViewReading; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode; paperScale?: DrawingScale; hatchPrefix?: string;
}) {
  const quad = geom?.quad ?? wallQuad(obj);
  if (!quad) return null;
  const st = effectiveStyle(obj, layer);
  const weight = obj.lineWeight ?? layer?.lineWeight ?? 0.5;
  const color = selected ? '#22d3ee' : colorMode === 'metier' ? CLASSIFICATION_META[obj.classification].color : st.color;
  const sw = paperScale ? Math.max(strokeInModel(weight, paperScale), 0.5 / zoom) : (screenWidth(weight) + (selected ? 1 : 0)) / zoom;
  const edges = geom?.edges ?? quad.map((p, i) => [p, quad[(i + 1) % 4]] as [{ x: number; y: number }, { x: number; y: number }]);
  // Le quadrilatère comme polyligne fermée, baies en îlots : remplissage et hachures du rendu commun.
  const { outline: pseudo, islands } = wallHatchShape(obj, quad, geom?.bays);
  return (
    <g data-mur={obj.id}>
      <PrimitiveShape obj={pseudo} view={view} selected={selected} zoom={zoom} showLabel={false} layer={layer} colorMode={colorMode} paperScale={paperScale} hatchPrefix={hatchPrefix} islands={islands} noStroke />
      {edges.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} strokeLinecap="square" />)}
    </g>
  );
}

/** Pièce : surface légèrement teintée, étiquette nom + surface au centre ; alerte si la pièce n'est pas fermée. */
function RoomShape({ obj, poly, selected, zoom, paperScale }: { obj: RoomObj; poly: { x: number; y: number }[] | null; selected: boolean; zoom: number; paperScale?: DrawingScale }) {
  const size = (px: number, mm: number) => (paperScale ? paperToModelSize(mm, paperScale) * TEXT_FONT_SCALE : px / zoom);
  if (!poly) {
    return (
      <text data-piece={obj.id} x={obj.x} y={obj.y} fontSize={size(11, 2.5)} fill="#fb7185" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
        {obj.name} · pièce non fermée
      </text>
    );
  }
  const c = centroid(poly);
  const color = selected ? '#22d3ee' : '#cbd5e1';
  return (
    <g data-piece={obj.id}>
      <polygon points={poly.map(p => `${p.x},${p.y}`).join(' ')} fill={selected ? 'rgba(34,211,238,0.10)' : 'rgba(148,163,184,0.05)'} stroke="none" />
      <text x={c.x} y={c.y} fontSize={size(13, 3.5)} fill={color} textAnchor="middle" fontFamily="JetBrains Mono, monospace">{obj.name}</text>
      <text x={c.x} y={c.y + size(13, 3.5) * 1.2} fontSize={size(11, 2.5)} fill={color} textAnchor="middle" fontFamily="JetBrains Mono, monospace" data-surface="">
        {formatM2(areaM2(poly))}
      </text>
    </g>
  );
}

/** Fond de plan : image étirée sur son emprise, opacité réglable ; cadre en pointillé s'il est sélectionné. */
/** Note de terrain : repère à taille d'écran fixe (crayon, ou appareil photo si une photo est jointe). */
function NoteShape({ obj, objects, blocks, selected, zoom }: { obj: NoteObj; objects: CadObject[]; blocks: BlockDef[]; selected: boolean; zoom: number }) {
  const p = notePosition(obj, objects, blocks);
  const r = NOTE_MARKER_PX / zoom;
  return (
    <g data-note={obj.id}>
      <title>{obj.text}</title>
      <circle cx={p.x} cy={p.y} r={r} fill={selected ? '#22d3ee' : '#f59e0b'} stroke="#070b16" strokeWidth={1.5 / zoom} />
      <text x={p.x} y={p.y + 4 / zoom} fontSize={11 / zoom} textAnchor="middle" fill="#070b16" fontFamily="JetBrains Mono, monospace">{obj.photoIds?.length ? '◉' : '✎'}</text>
    </g>
  );
}

function UnderlayShape({ obj, asset, selected, zoom }: { obj: UnderlayObj; asset?: Asset; selected: boolean; zoom: number }) {
  return (
    <g data-fond={obj.id} pointerEvents="none">
      {asset
        ? <image href={asset.dataUrl} x={obj.x} y={obj.y} width={obj.w} height={obj.h} opacity={obj.opacity} preserveAspectRatio="none" />
        : <text x={obj.x} y={obj.y + 12 / zoom} fontSize={11 / zoom} fill="#fb7185" fontFamily="JetBrains Mono, monospace">{obj.id} · image absente</text>}
      {(selected || !asset) && <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} fill="none" stroke={selected ? '#22d3ee' : '#fb7185'} strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />}
    </g>
  );
}

/**
 * Vue en coupe : contours des surfaces coupées en trait fort, hachures fines à 45° (pas de 3 mm
 * papier, constant à l'écran), désignation « A–A » de 5 mm.
 */
function CutShape({ obj, objects, selected, zoom, layer, colorMode, paperScale }: {
  obj: CutObj; objects: CadObject[]; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode; paperScale?: DrawingScale;
}) {
  const m = (mm: number) => (paperScale ? paperToModelSize(mm, paperScale) : (mm * SCREEN_PX_PER_PAPER_MM) / zoom);
  const c = cutView(obj, objects.find(o => o.id === obj.sourceId), objects.find(o => o.id === obj.markId), objects, m(3), m(5));
  if (!c.ok) {
    const src = objects.find(o => o.id === obj.sourceId);
    const at = src ? objectBounds(src, [], objects) : null;
    return at ? <text x={at.minX} y={at.maxY + m(8)} fontSize={11 / zoom} fill="#fb7185" fontFamily="JetBrains Mono, monospace">{obj.id} · coupe non évaluée : {c.error}</text> : null;
  }
  const g = c.value;
  const st = effectiveStyle(obj, layer);
  const color = selected ? '#22d3ee' : colorMode === 'metier' ? CLASSIFICATION_META[obj.classification].color : st.color;
  const width = (mm: number, px: number) => (paperScale ? Math.max(strokeInModel(mm, paperScale), 0.5 / zoom) : px / zoom);
  return (
    <g data-coupe={obj.id}>
      {g.hatch.map(([x1, y1, x2, y2], i) => <line key={`h${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width(0.18, 0.7)} opacity={paperScale ? 1 : 0.8} />)}
      <g data-arete="">{g.visible.map(([x1, y1, x2, y2], i) => <line key={`v${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width(0.5, 1.6)} />)}</g>
      <text x={g.label.x} y={g.label.y} fontSize={m(5) * TEXT_FONT_SCALE} fill={color} textAnchor="middle" fontFamily="Inter, Arial, Helvetica, sans-serif">{g.label.text}</text>
    </g>
  );
}

/**
 * Vues liées : arêtes vues en trait continu fort (0,5 mm), cachées en trait interrompu fin (0,25 mm),
 * axes en trait mixte fin ; tailles papier sur une feuille, constantes à l'écran.
 */
function ViewsShape({ obj, objects, selected, zoom, layer, colorMode, paperScale }: {
  obj: ViewsObj; objects: CadObject[]; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode; paperScale?: DrawingScale;
}) {
  const views = linkedViews(obj, objects.find(o => o.id === obj.sourceId), objects);
  if (!views) return null;
  const st = effectiveStyle(obj, layer);
  const color = selected ? '#22d3ee' : colorMode === 'metier' ? CLASSIFICATION_META[obj.classification].color : st.color;
  const width = (mm: number, px: number) => (paperScale ? Math.max(strokeInModel(mm, paperScale), 0.5 / zoom) : px / zoom);
  const dash = (t: 'interrompu' | 'mixte', mm: number, px: number) => (paperScale ? dashInModel(t, mm, paperScale) : screenDash(t, px)?.map(v => v / zoom))?.join(' ');
  const lines = (segs: [number, number, number, number][], w: number, d?: string) => segs.map(([x1, y1, x2, y2], i) => (
    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeDasharray={d} />
  ));
  return (
    <g data-vues={obj.id}>
      {views.map(v => (
        <g key={v.kind} data-vue={v.kind}>
          {lines(v.visible, width(0.5, 1.6))}
          <g data-cache="">{lines(v.hidden, width(0.25, 1), dash('interrompu', 0.25, 1))}</g>
          <g data-axe="">{lines(v.axes, width(0.18, 0.8), dash('mixte', 0.18, 0.8))}</g>
        </g>
      ))}
    </g>
  );
}

/** Symbole (nord, repère de coupe, cote de niveau) : taille papier sur une feuille, constante à l'écran. */
function SymbolShape({ obj, objects, blocks, selected, zoom, layer, colorMode, paperScale }: {
  obj: AnnotationObject; objects: CadObject[]; blocks: BlockDef[]; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode; paperScale?: DrawingScale;
}) {
  const u = paperScale ? paperToModelSize(1, paperScale) : SCREEN_PX_PER_PAPER_MM / zoom;
  const g = annotationGeometry(obj, u, objects, blocks);
  if (!g) return null;
  const st = effectiveStyle(obj, layer);
  const color = selected ? '#22d3ee' : colorMode === 'metier' ? CLASSIFICATION_META[obj.classification].color : st.color;
  const w = (weight: 'fin' | 'fort') => paperScale ? Math.max(strokeInModel(weight === 'fort' ? 0.7 : 0.25, paperScale), 0.5 / zoom) : (weight === 'fort' ? 2.2 : 1) / zoom;
  const dash = paperScale ? `${paperToModelSize(12, paperScale)} ${paperToModelSize(2, paperScale)} ${paperToModelSize(1, paperScale)} ${paperToModelSize(2, paperScale)}` : `${12 / zoom} ${3 / zoom} ${2 / zoom} ${3 / zoom}`;
  return (
    <g data-symbole={obj.kind}>
      {g.circles.map((c, i) => <circle key={`c${i}`} cx={c.c.x} cy={c.c.y} r={c.r} fill="none" stroke={color} strokeWidth={w('fin')} />)}
      {g.lines.map((l, i) => <line key={`l${i}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={color} strokeWidth={w(l.weight)} strokeDasharray={l.dash ? dash : undefined} />)}
      {g.fills.map((f, i) => <polygon key={`f${i}`} points={f.map(q => `${q.x},${q.y}`).join(' ')} fill={color} />)}
      {g.texts.map((t, i) => (
        <text key={`t${i}`} x={t.at.x} y={t.at.y} fontSize={t.height * TEXT_FONT_SCALE} fill={color} textAnchor={t.anchor} fontFamily="Inter, Arial, Helvetica, sans-serif">{t.text}</text>
      ))}
    </g>
  );
}

/** Ouverture : porte (vantail et débattement) ou fenêtre (appuis, vitrage). Les tableaux sont tracés avec le mur. */
function OpeningShape({ obj, wall, selected, zoom, layer, colorMode, paperScale }: {
  obj: OpeningObj; wall: WallObj; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode; paperScale?: DrawingScale;
}) {
  const g = openingGeometry(obj, wall);
  if (!g) return null;
  const st = effectiveStyle(obj, layer);
  const color = selected ? '#22d3ee' : colorMode === 'metier' ? CLASSIFICATION_META[obj.classification].color : st.color;
  const thin = paperScale ? Math.max(strokeInModel(0.18, paperScale), 0.5 / zoom) : 1 / zoom;
  const leafW = paperScale ? Math.max(strokeInModel(0.35, paperScale), 0.5 / zoom) : 1.6 / zoom;
  return (
    <g data-ouverture={obj.type}>
      <polygon points={g.rect.map(p => `${p.x},${p.y}`).join(' ')} fill={selected ? 'rgba(34,211,238,0.12)' : 'transparent'} stroke="none" />
      {g.glazing?.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={thin} />)}
      {g.leaf && <line x1={g.leaf[0].x} y1={g.leaf[0].y} x2={g.leaf[1].x} y2={g.leaf[1].y} stroke={color} strokeWidth={leafW} />}
      {g.swing && <path d={swingPath(g.swing)} fill="none" stroke={color} strokeWidth={thin} strokeDasharray={paperScale ? undefined : `${4 / zoom} ${3 / zoom}`} />}
    </g>
  );
}

/** Pixels écran par millimètre (96 ppp) : pas papier des hachures dans l'atelier. */
const PX_PER_MM = 96 / 25.4;

/** Contour SVG d'un objet fermé (rectangle, cercle, polyligne fermée) ; null sinon. */
function closedPath(o: CadObject): string | null {
  switch (o.kind) {
    case 'rect': return `M ${o.x} ${o.y} H ${o.x + o.w} V ${o.y + o.h} H ${o.x} Z`;
    case 'circle': return `M ${o.cx + o.r} ${o.cy} A ${o.r} ${o.r} 0 1 0 ${o.cx - o.r} ${o.cy} A ${o.r} ${o.r} 0 1 0 ${o.cx + o.r} ${o.cy} Z`;
    case 'polyline': return isClosedPolyline(o) ? `M ${o.points.slice(0, 2).join(' ')} L ${o.points.slice(2).join(' ')} Z` : null;
    default: return null;
  }
}

function PrimitiveShape({ obj, view, selected, zoom, showLabel, unit = 'mm', layer, colorMode = 'calque', owner, paperScale, hatchPrefix = '', islands = [], noStroke = false }: {
  obj: PrimitiveObject;
  /** Remplissage et hachures seulement (le contour est tracé par l'appelant : murs). */
  noStroke?: boolean;
  hatchPrefix?: string;
  /** Contours fermés désignés comme îlots (non hachurés). */
  islands?: CadObject[];
  paperScale?: DrawingScale;
  unit?: DisplayUnit;
  layer?: Layer;
  colorMode?: ColorMode;
  /** Occurrence de bloc qui porte la primitive : ses propriétés remplacent celles du calque. */
  owner?: CadObject;
  view: ViewReading;
  selected: boolean;
  zoom: number;
  showLabel: boolean;
}) {
  const meta = CLASSIFICATION_META[obj.classification];
  const st = effectiveStyle(owner ?? obj, layer);
  const widthPx = screenWidth(st.lineWeight);
  // Sur une feuille : épaisseur et motif à leurs valeurs papier exactes (au moins 0,5 px écran).
  const sw = paperScale ? Math.max(strokeInModel(st.lineWeight, paperScale), 0.5 / zoom) : (widthPx + (selected ? 1 : 0)) / zoom;
  const color = selected ? '#22d3ee' : colorMode === 'metier' ? meta.color : st.color;
  const pattern = paperScale ? dashInModel(st.lineType, st.lineWeight, paperScale) : screenDash(st.lineType, widthPx)?.map(v => v / zoom);
  const dash = pattern ? pattern.join(' ')
    : colorMode === 'metier' && view === 'batiment' && obj.classification === 'electrique' ? `${8 / zoom} ${5 / zoom}` : undefined;
  const solidFill = obj.hatch === 'solid';
  const common = noStroke ? { stroke: 'none' } : { stroke: color, strokeWidth: sw, strokeDasharray: dash };

  // Hachure paramétrée : motif propre à l'objet (angle, pas, origine), contour et îlots en pair-impair.
  const outline = closedPath(obj as CadObject);
  let hatchLayer: React.ReactNode = null;
  if (outline && obj.hatch && obj.hatch !== 'none') {
    const d = [outline, ...islands.map(closedPath).filter(Boolean)].join(' ');
    if (solidFill) {
      hatchLayer = <path d={d} fill={color} fillOpacity={selected ? 0.28 : 0.16} fillRule="evenodd" stroke="none" />;
    } else {
      const hp = hatchParamsOf(obj);
      const step = hp.unit === 'modele' ? hp.spacing : paperScale ? paperToModelSize(hp.spacing, paperScale) : (hp.spacing * PX_PER_MM) / zoom;
      const b = primitiveBounds(obj);
      const id = `${hatchPrefix}h-${owner ? `${owner.id}-` : ''}${obj.id}`;
      const w = paperScale ? paperToModelSize(0.18, paperScale) : 1 / zoom;
      hatchLayer = (
        <>
          <defs>
            <pattern id={id} width={step} height={step} patternUnits="userSpaceOnUse"
              patternTransform={`translate(${b.minX + (hp.originX ?? 0)} ${b.minY + (hp.originY ?? 0)}) rotate(${-hp.angle})`}>
              <path d={`M 0 0 L ${step} 0${obj.hatch === 'cross' ? ` M 0 0 L 0 ${step}` : ''}`} stroke={paperScale ? '#94a3b8' : color} strokeWidth={w} opacity={paperScale ? 1 : 0.5} />
            </pattern>
          </defs>
          <path d={d} fill={`url(#${id})`} fillRule="evenodd" stroke="none" data-hachure={obj.hatch} />
        </>
      );
    }
  }

  const label = (x: number, y: number) => (
    <text x={x} y={y - 6 / zoom} fontSize={11 / zoom} fill={selected ? '#22d3ee' : '#8b93a7'} fontFamily="JetBrains Mono, monospace">
      {obj.id} · {obj.name}
    </text>
  );

  switch (obj.kind) {
    case 'line':
      return (
        <g>
          <line x1={obj.x1} y1={obj.y1} x2={obj.x2} y2={obj.y2} {...common} fill="none" />
          <line x1={obj.x1} y1={obj.y1} x2={obj.x2} y2={obj.y2} stroke="transparent" strokeWidth={10 / zoom} />
          {showLabel && label(Math.min(obj.x1, obj.x2), Math.min(obj.y1, obj.y2))}
        </g>
      );
    case 'rect':
      return (
        <g>
          <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} fill={color} fillOpacity={selected ? 0.12 : 0.04} stroke="none" />
          {hatchLayer}
          <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} {...common} fill="none" />
          {showLabel && label(obj.x, obj.y)}
          {selected && (
            <text x={obj.x + obj.w / 2} y={obj.y + obj.h + 14 / zoom} fontSize={10 / zoom} fill="#5f6b85" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              {fmt(fromMm(obj.w, unit), unitDecimals(unit))} × {fmt(fromMm(obj.h, unit), unitDecimals(unit))} {unit}
            </text>
          )}
        </g>
      );
    case 'circle':
      return (
        <g>
          <circle cx={obj.cx} cy={obj.cy} r={obj.r} fill={color} fillOpacity={selected ? 0.12 : 0.04} stroke="none" />
          {hatchLayer}
          <circle cx={obj.cx} cy={obj.cy} r={obj.r} {...common} fill="none" />
          <line x1={obj.cx - 5 / zoom} y1={obj.cy} x2={obj.cx + 5 / zoom} y2={obj.cy} stroke={color} strokeWidth={1 / zoom} />
          <line x1={obj.cx} y1={obj.cy - 5 / zoom} x2={obj.cx} y2={obj.cy + 5 / zoom} stroke={color} strokeWidth={1 / zoom} />
          {showLabel && label(obj.cx - obj.r, obj.cy - obj.r)}
          {selected && (
            <text x={obj.cx} y={obj.cy + obj.r + 14 / zoom} fontSize={10 / zoom} fill="#5f6b85" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              Ø {fmt(fromMm(obj.r * 2, unit), unitDecimals(unit))} {unit}
            </text>
          )}
        </g>
      );
    case 'arc':
      return (
        <g>
          <path d={arcSvgPath(obj)} {...common} fill="none" />
          <path d={arcSvgPath(obj)} stroke="transparent" strokeWidth={10 / zoom} fill="none" />
          {selected && <line x1={obj.cx - 5 / zoom} y1={obj.cy} x2={obj.cx + 5 / zoom} y2={obj.cy} stroke={color} strokeWidth={1 / zoom} />}
          {selected && <line x1={obj.cx} y1={obj.cy - 5 / zoom} x2={obj.cx} y2={obj.cy + 5 / zoom} stroke={color} strokeWidth={1 / zoom} />}
          {showLabel && label(obj.cx - obj.r, obj.cy - obj.r)}
        </g>
      );
    case 'spline': {
      const d = splinePath(obj, 0.25 / zoom);
      return (
        <g data-spline>
          <path d={d} {...common} fill="none" />
          <path d={d} stroke="transparent" strokeWidth={10 / zoom} fill="none" />
          {selected && <polyline points={obj.points.join(',')} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1 / zoom} strokeDasharray={`${3 / zoom} ${3 / zoom}`} />}
          {selected && Array.from({ length: obj.points.length / 2 }, (_, i) => <circle key={i} cx={obj.points[2 * i]} cy={obj.points[2 * i + 1]} r={2.5 / zoom} fill="none" stroke={color} strokeWidth={1 / zoom} />)}
          {showLabel && label(obj.points[0], obj.points[1])}
        </g>
      );
    }
    case 'ellipse':
      return (
        <g data-ellipse>
          <path d={ellipsePath(obj)} {...common} fill="none" />
          <path d={ellipsePath(obj)} stroke="transparent" strokeWidth={10 / zoom} fill="none" />
          {selected && <line x1={obj.cx - 5 / zoom} y1={obj.cy} x2={obj.cx + 5 / zoom} y2={obj.cy} stroke={color} strokeWidth={1 / zoom} />}
          {selected && <line x1={obj.cx} y1={obj.cy - 5 / zoom} x2={obj.cx} y2={obj.cy + 5 / zoom} stroke={color} strokeWidth={1 / zoom} />}
          {showLabel && label(obj.cx - Math.max(obj.rx, obj.ry), obj.cy - Math.max(obj.rx, obj.ry))}
        </g>
      );
    case 'polyline': {
      const closed = isClosedPolyline(obj);
      return (
        <g>
          {closed && <polygon points={obj.points.join(',')} fill={color} fillOpacity={0.04} stroke="none" />}
          {hatchLayer}
          <polyline points={obj.points.join(',')} fill="none" {...common} />
          <polyline points={obj.points.join(',')} fill="none" stroke="transparent" strokeWidth={10 / zoom} />
          {showLabel && label(obj.points[0], obj.points[1])}
        </g>
      );
    }
  }
}

/**
 * Cote par points : géométrie commune (pdimGeometry), tailles d'annotation constantes à l'écran
 * dans l'atelier, ou en mm papier dans une fenêtre de feuille.
 */
function PointDimensionShape({ obj, selected, zoom, paperScale, layer, colorMode = 'calque' }: { obj: PointDimensionObj; selected: boolean; zoom: number; paperScale?: DrawingScale; layer?: Layer; colorMode?: ColorMode }) {
  const g = pdimGeometry(obj);
  // Couleur du trait (objet ou calque), comme les cotes associatives ; ambre en couleurs métier.
  const color = selected ? '#22d3ee' : colorMode === 'calque' ? effectiveStyle(obj, layer).color : '#fbbf24';
  if (!g) {
    return <text x={obj.points[0] ?? 0} y={obj.points[1] ?? 0} fontSize={11 / zoom} fill="#fb7185" fontFamily="JetBrains Mono, monospace">{obj.id} · points insuffisants</text>;
  }
  const S = PAPER_DIMENSION_STYLE;
  // Tailles : mm papier sur une feuille, pixels constants dans l'atelier.
  const size = paperScale
    ? { text: paperToModelSize(S.textHeight, paperScale) * TEXT_FONT_SCALE, arrow: paperToModelSize(S.arrowLength, paperScale), half: paperToModelSize(S.arrowHalfWidth, paperScale), gap: paperToModelSize(S.textGap, paperScale), w: Math.max(strokeInModel(S.lineWeight, paperScale), 0.5 / zoom) }
    : { text: 11 / zoom, arrow: 9 / zoom, half: 3 / zoom, gap: 4 / zoom, w: (selected ? 1.8 : 1.1) / zoom };
  return (
    <g data-pdim={obj.mode}>
      {g.ext.map(([x1, y1, x2, y2], i) => <line key={`e${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={size.w * 0.8} opacity={paperScale ? 1 : 0.65} />)}
      {g.lines.map(([x1, y1, x2, y2], i) => <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={size.w} />)}
      {g.arcs.map((a, i) => <path key={`a${i}`} d={arcSvgPath({ cx: a.cx, cy: a.cy, r: a.r, start: a.start, end: a.start + a.sweep })} fill="none" stroke={color} strokeWidth={size.w} />)}
      {g.arrows.map((a, i) => <polygon key={`f${i}`} points={arrowHead(a.tip, a.from, size.arrow, size.half).map(q => `${q.x},${q.y}`).join(' ')} fill={color} />)}
      {g.origins.map((o, i) => <circle key={`o${i}`} cx={o.x} cy={o.y} r={size.arrow / 3} fill="none" stroke={color} strokeWidth={size.w} />)}
      {g.levelMarks.map((q, i) => {
        const h = size.arrow;
        return <polygon key={`n${i}`} points={`${q.x},${q.y} ${q.x - h * 0.6},${q.y - h} ${q.x + h * 0.6},${q.y - h}`} fill="none" stroke={color} strokeWidth={size.w} />;
      })}
      {g.texts.map((t, i) => {
        const x = t.at.x + t.normal.x * size.gap;
        const y = t.at.y + t.normal.y * size.gap;
        const anchor = Math.abs(t.normal.x) > 0.7 ? (t.normal.x > 0 ? 'start' : 'end') : 'middle';
        return (
          <text key={`t${i}`} x={x} y={y} fontSize={size.text} fill={color} fontFamily="JetBrains Mono, monospace" textAnchor={anchor}
            dominantBaseline={t.normal.y > 0.7 ? 'hanging' : 'auto'}>{t.value}</text>
        );
      })}
      {!paperScale && g.lines.map(([x1, y1, x2, y2], i) => <line key={`h${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10 / zoom} />)}
    </g>
  );
}

function DimensionShape({ obj, objects, selected, zoom, layer, colorMode = 'calque', paperScale }: { obj: DimensionObj; objects: CadObject[]; selected: boolean; zoom: number; layer?: Layer; colorMode?: ColorMode; paperScale?: DrawingScale }) {
  const target = objects.find(o => o.id === obj.targetId);
  const geom = target ? dimensionGeometry(obj, target) : null;
  if (!geom) {
    return (
      <text x={0} y={0} fontSize={11 / zoom} fill="#fb7185" fontFamily="JetBrains Mono, monospace">
        {obj.id} · cible absente
      </text>
    );
  }
  // Couleur : celle du trait (objet ou calque) ; épaisseur et type : seulement s'ils sont propres à la cote
  // (une cote reste en trait fin continu par défaut, Conventions §5).
  const st = effectiveStyle(obj, layer);
  const color = selected ? '#22d3ee' : colorMode === 'calque' ? st.color : '#fbbf24';
  if (paperScale) {
    // Style papier : texte, flèches et traits à leurs tailles sur la feuille, quelle que soit l'échelle.
    const S = PAPER_DIMENSION_STYLE;
    const m = (mm: number) => paperToModelSize(mm, paperScale);
    const w = Math.max(m(obj.lineWeight ?? S.lineWeight), 0.5 / zoom);
    const a = { x: geom.x1, y: geom.y1 }, b = { x: geom.x2, y: geom.y2 };
    // Cote de rayon : une seule flèche, sur le cercle.
    const arrows = [arrowHead(b, a, m(S.arrowLength), m(S.arrowHalfWidth)), ...(geom.arrows === 'end' ? [] : [arrowHead(a, b, m(S.arrowLength), m(S.arrowHalfWidth))])];
    const t = dimensionTextPosition(geom, m(S.textGap));
    return (
      <g data-cote-papier="">
        {geom.ext.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} />)}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w}
          strokeDasharray={obj.lineType !== undefined ? dashInModel(obj.lineType, obj.lineWeight ?? S.lineWeight, paperScale)?.join(' ') : undefined} />
        {arrows.map((tri, i) => <polygon key={i} points={tri.map(q => `${q.x},${q.y}`).join(' ')} fill={color} />)}
        <text x={t.x} y={t.y} fontSize={m(S.textHeight) * TEXT_FONT_SCALE} fill={color} fontFamily="JetBrains Mono, monospace" textAnchor={t.anchor}>
          {dimensionValue(obj, objects)}
        </text>
      </g>
    );
  }
  const widthPx = obj.lineWeight !== undefined ? screenWidth(obj.lineWeight) : 1.1;
  const sw = (widthPx + (selected ? 0.7 : 0)) / zoom;
  const dash = obj.lineType !== undefined ? screenDash(obj.lineType, widthPx)?.map(v => v / zoom).join(' ') : undefined;
  return (
    <g>
      {geom.ext.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.8 / zoom} opacity={0.65} />
      ))}
      <line x1={geom.x1} y1={geom.y1} x2={geom.x2} y2={geom.y2} stroke={color} strokeWidth={sw} strokeDasharray={dash} markerStart={geom.arrows === 'end' ? undefined : 'url(#dim-arrow)'} markerEnd="url(#dim-arrow)" />
      <line x1={geom.x1} y1={geom.y1} x2={geom.x2} y2={geom.y2} stroke="transparent" strokeWidth={10 / zoom} />
      <text x={geom.tx} y={geom.ty} fontSize={11 / zoom} fill={color} fontFamily="JetBrains Mono, monospace" textAnchor="middle">
        {dimensionValue(obj, objects)}
      </text>
      {selected && (
        <text x={geom.tx} y={geom.ty + 14 / zoom} fontSize={9 / zoom} fill="#8b93a7" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
          {obj.id} → {obj.targetId}
        </text>
      )}
    </g>
  );
}

function BlockRefShape({ obj, blocks, view, selected, zoom, layer, colorMode, paperScale, hatchPrefix }: { obj: Extract<CadObject, { kind: 'blockRef' }>; blocks: BlockDef[]; view: ViewReading; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode; paperScale?: DrawingScale; hatchPrefix?: string }) {
  const block = blocks.find(b => b.id === obj.blockId);
  if (!block) {
    return (
      <text x={obj.x} y={obj.y} fontSize={11 / zoom} fill="#fb7185" fontFamily="JetBrains Mono, monospace">
        {obj.id} · bloc absent
      </text>
    );
  }
  const bounds = blockBounds(block);
  const color = selected ? '#22d3ee' : '#a78bfa';
  return (
    <g>
      <g transform={`translate(${obj.x},${obj.y}) scale(${obj.scale})`}>
        {/* Sous scale(s), une unité locale vaut s × zoom pixels : le zoom vu par la primitive est zoom × s. */}
        {occurrencePrimitives(block, obj).map(p => (
          <PrimitiveShape key={p.id} obj={p} view={view} selected={false} zoom={zoom * obj.scale} showLabel={false} layer={layer} colorMode={colorMode} owner={obj}
            paperScale={paperScale && { paper: paperScale.paper * obj.scale, model: paperScale.model }} hatchPrefix={hatchPrefix} />
        ))}
      </g>
      <rect
        x={obj.x + bounds.minX * obj.scale}
        y={obj.y + bounds.minY * obj.scale}
        width={(bounds.maxX - bounds.minX) * obj.scale}
        height={(bounds.maxY - bounds.minY) * obj.scale}
        fill="transparent"
        stroke={color}
        strokeWidth={(selected ? 1.8 : 0.8) / zoom}
        strokeDasharray={`${5 / zoom} ${4 / zoom}`}
      />
      {selected && (
        <text x={obj.x + bounds.minX * obj.scale} y={obj.y + bounds.minY * obj.scale - 6 / zoom} fontSize={11 / zoom} fill={color} fontFamily="JetBrains Mono, monospace">
          {obj.id} · {block.name}
        </text>
      )}
    </g>
  );
}

function hitTest(candidates: CadObject[], allObjects: CadObject[], blocks: BlockDef[], x: number, y: number, tol: number): CadObject | null {
  const hit = hitDrawing(candidates.filter(o => o.kind !== 'underlay'), allObjects, blocks, x, y, tol);
  if (hit) return hit;
  // Un fond de plan non verrouillé ne se désigne qu'en l'absence de tout objet dessiné au point.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const o = candidates[i];
    if (o.kind === 'underlay' && !o.locked && onUnderlay(o, { x, y })) return o;
  }
  return null;
}

function hitDrawing(all: CadObject[], allObjects: CadObject[], blocks: BlockDef[], x: number, y: number, tol: number): CadObject | null {
  // Une ouverture est entièrement dans l'épaisseur de son mur : elle est testée avant lui.
  // Les notes, posées sur le dessin, sont testées avant tout.
  const candidates = [...all.filter(o => o.kind !== 'opening' && o.kind !== 'note'), ...all.filter(o => o.kind === 'opening'), ...all.filter(o => o.kind === 'note')];
  for (let i = candidates.length - 1; i >= 0; i--) {
    const o = candidates[i];
    if (o.kind === 'note') {
      const p = notePosition(o, allObjects, blocks);
      if (Math.hypot(x - p.x, y - p.y) <= Math.max(tol * 2, 0)) return o;
      continue;
    }
    if (o.kind === 'line' && distanceSegment(x, y, o.x1, o.y1, o.x2, o.y2) <= tol) return o;
    if (o.kind === 'rect') {
      const inside = x >= o.x - tol && x <= o.x + o.w + tol && y >= o.y - tol && y <= o.y + o.h + tol;
      const nearEdge = Math.min(Math.abs(x - o.x), Math.abs(x - (o.x + o.w))) <= tol || Math.min(Math.abs(y - o.y), Math.abs(y - (o.y + o.h))) <= tol;
      if (inside && nearEdge) return o;
      if (inside && o.classification !== 'non-classifie') return o;
    }
    if (o.kind === 'circle' && Math.abs(Math.hypot(x - o.cx, y - o.cy) - o.r) <= tol) return o;
    if (o.kind === 'arc' && distanceToArc(o, x, y) <= tol) return o;
    if (o.kind === 'ellipse' && distanceToEllipse(o, { x, y }) <= tol) return o;
    if (o.kind === 'spline' && distanceToSpline(o, { x, y }) <= tol) return o;
    if (o.kind === 'roof') {
      for (const p of roofPrimitives(o, roofInput(o))) {
        const pts = p.kind === 'line' ? [p.x1, p.y1, p.x2, p.y2] : p.kind === 'polyline' ? p.points : [];
        for (let j = 0; j + 3 < pts.length; j += 2) if (distanceSegment(x, y, pts[j], pts[j + 1], pts[j + 2], pts[j + 3]) <= tol) return o;
      }
    }
    if (o.kind === 'polyline' || o.kind === 'slab') {
      // Dalle : contour fermé (côté de fermeture compris).
      const p = o.kind === 'slab' ? slabAsPolyline(o).points : o.points;
      for (let j = 0; j + 3 <= p.length; j += 2) {
        if (distanceSegment(x, y, p[j], p[j + 1], p[j + 2], p[j + 3]) <= tol) return o;
      }
    }
    if (o.kind === 'dimension') {
      const target = allObjects.find(t => t.id === o.targetId);
      const geom = target ? dimensionGeometry(o, target) : null;
      if (geom && distanceSegment(x, y, geom.x1, geom.y1, geom.x2, geom.y2) <= tol) return o;
    }
    if (o.kind === 'text' && pointInText(o, x, y, tol)) return o;
    if (o.kind === 'cut') {
      const c = cutView(o, allObjects.find(s => s.id === o.sourceId), allObjects.find(s => s.id === o.markId), allObjects, 0, 0);
      if (c.ok && distanceToCut(c.value, x, y) <= tol) return o;
    }
    if (o.kind === 'views') {
      const v = linkedViews(o, allObjects.find(s => s.id === o.sourceId), allObjects);
      if (v && distanceToViews(v, x, y) <= tol) return o;
    }
    if (isAnnotation(o)) {
      // Géométrie à la taille écran (tol ≈ 6 px) : le symbole se désigne par ses traits ou sa lettre.
      const g = annotationGeometry(o, (tol / 6) * SCREEN_PX_PER_PAPER_MM, allObjects, blocks);
      if (g && distanceToSymbol(g, { x, y }) <= tol) return o;
    }
    if (o.kind === 'room') {
      // Une pièce se désigne par son étiquette (son point intérieur ou le centre de son contour).
      const walls = allObjects.filter((w): w is WallObj => w.kind === 'wall');
      const poly = detectRoom(walls, o);
      const c = poly ? centroid(poly) : o;
      if (Math.hypot(x - c.x, y - c.y) <= tol * 5) return o;
    }
    if (o.kind === 'opening') {
      const host = allObjects.find(h => h.id === o.hostId);
      const g = host?.kind === 'wall' ? openingGeometry(o, host) : null;
      if (g && (pointInLoop({ x, y }, g.rect) || (g.leaf && distanceSegment(x, y, g.leaf[0].x, g.leaf[0].y, g.leaf[1].x, g.leaf[1].y) <= tol))) return o;
    }
    if (o.kind === 'wall') {
      const q = wallQuad(o);
      if (q && (pointInLoop({ x, y }, q) || q.some((p, i) => distanceSegment(x, y, p.x, p.y, q[(i + 1) % 4].x, q[(i + 1) % 4].y) <= tol))) return o;
    }
    if (o.kind === 'pdim') {
      const g = pdimGeometry(o);
      if (g && g.lines.some(([x1, y1, x2, y2]) => distanceSegment(x, y, x1, y1, x2, y2) <= tol)) return o;
      if (g && g.arcs.some(a => Math.abs(Math.hypot(x - a.cx, y - a.cy) - a.r) <= tol)) return o;
      if (g && g.levelMarks.some(q => Math.hypot(x - q.x, y - q.y) <= tol * 3)) return o;
    }
    if (o.kind === 'blockRef') {
      const block = blocks.find(b => b.id === o.blockId);
      if (!block) continue;
      const b = blockBounds(block);
      if (x >= o.x + b.minX * o.scale - tol && x <= o.x + b.maxX * o.scale + tol && y >= o.y + b.minY * o.scale - tol && y <= o.y + b.maxY * o.scale + tol) return o;
    }
  }
  return null;
}

function TextShape({ obj, selected, zoom, layer, colorMode }: { obj: TextObj; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode }) {
  const meta = CLASSIFICATION_META[obj.classification];
  const color = selected ? '#22d3ee'
    : colorMode === 'calque' ? effectiveStyle(obj, layer).color
    : obj.classification === 'non-classifie' ? '#e2e8f0' : meta.color;
  const anchor = obj.align === 'center' ? 'middle' : obj.align === 'right' ? 'end' : 'start';
  const corners = textCorners(obj);
  return (
    <g>
      <text
        x={obj.x}
        y={obj.y}
        fontSize={obj.height * TEXT_FONT_SCALE}
        fill={color}
        textAnchor={anchor}
        fontFamily="Inter, Arial, Helvetica, sans-serif"
        transform={obj.rotation ? `rotate(${-obj.rotation} ${obj.x} ${obj.y})` : undefined}
        style={{ whiteSpace: 'pre' }}
      >
        {textLines(obj.content).map((line, i) => (
          <tspan key={i} x={obj.x} dy={i === 0 ? 0 : obj.height * TEXT_LINE_SPACING}>{line || ' '}</tspan>
        ))}
      </text>
      <polygon points={corners.map(p => `${p.x},${p.y}`).join(' ')} fill="transparent" stroke={selected ? '#22d3ee' : 'none'} strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
    </g>
  );
}

/** Décalage du réticule au-dessus du doigt (px écran), rayon et grossissement de la loupe. */
export const RETICLE_OFFSET_PX = 80;
const LOUPE_RADIUS = 56;
const LOUPE_ZOOM = 3;

/**
 * Loupe : copie agrandie de la scène autour du point visé, placée au-dessus (ou à côté près du haut
 * de la zone), avec la croix du réticule au point visé.
 */
function Loupe({ aim, sceneId, width, height }: { aim: { x: number; y: number }; sceneId: string; width: number; height: number }) {
  const R = LOUPE_RADIUS;
  const above = aim.y - R - 30 >= R + 4;
  const W = width || 400, H = height || 400;
  const raw = above ? { x: aim.x, y: aim.y - R - 30 } : { x: aim.x + (aim.x < W / 2 ? R + 40 : -(R + 40)), y: aim.y };
  // Toujours entière dans la zone de dessin (en largeur comme en hauteur).
  const clamp = (v: number, size: number) => Math.min(Math.max(v, R + 4), Math.max(R + 4, size - R - 4));
  const c = { x: clamp(raw.x, W), y: clamp(raw.y, H) };
  const clip = `${sceneId}-loupe`;
  return (
    <g data-testid="loupe" pointerEvents="none">
      <line x1={aim.x - 12} y1={aim.y} x2={aim.x + 12} y2={aim.y} stroke="#f472b6" strokeWidth={1} />
      <line x1={aim.x} y1={aim.y - 12} x2={aim.x} y2={aim.y + 12} stroke="#f472b6" strokeWidth={1} />
      <circle data-testid="reticule" cx={aim.x} cy={aim.y} r={5} fill="none" stroke="#f472b6" strokeWidth={1} />
      <clipPath id={clip}><circle cx={c.x} cy={c.y} r={R} /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect x={c.x - R} y={c.y - R} width={2 * R} height={2 * R} fill="#070b16" />
        <g transform={`translate(${c.x} ${c.y}) scale(${LOUPE_ZOOM}) translate(${-aim.x} ${-aim.y})`}>
          <use href={`#${sceneId}`} />
        </g>
      </g>
      <circle cx={c.x} cy={c.y} r={R} fill="none" stroke="#f472b6" strokeWidth={1.5} />
      <line x1={c.x - 8} y1={c.y} x2={c.x + 8} y2={c.y} stroke="#f472b6" strokeWidth={1} />
      <line x1={c.x} y1={c.y - 8} x2={c.x} y2={c.y + 8} stroke="#f472b6" strokeWidth={1} />
    </g>
  );
}

/** Rayon du repère de note à l'écran (px). */
const NOTE_MARKER_PX = 9;
