// Zone de travail : canvas SVG 2D avec accrochage objet, intersections,
// contrainte orthogonale, saisie de coordonnées, zoom ajusté, mesures et blocs.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BlockDef,
  CadObject,
  Classification,
  DimensionObj,
  Layer,
  NewCadObject,
  PrimitiveObject,
  TextObj,
  ViewReading,
} from '@/types/cad';
import { CLASSIFICATION_META, dimensionValue, fmt, isClosedPolyline } from '@/types/cad';
import {
  blockBounds,
  constrainOrtho,
  dimensionGeometry,
  distanceSegment,
  findSnap,
  gridSnap,
  objectBounds,
  projectBounds,
  snapLabel,
  type Point,
  type ObjectSnapType,
  type SnapPoint,
} from '@/lib/geometry';
import { pointInText, textCorners, textLines, TEXT_LINE_SPACING, TEXT_FONT_SCALE } from '@/lib/text';
import { arcFrom3Points, arcFromCenter, arcSvgPath, distanceToArc } from '@/lib/arc';
import { fromMm, parseLength, parsePointInput, unitDecimals, type DisplayUnit } from '@/lib/input';
import { effectiveStyle, screenDash, screenWidth } from '@/lib/linestyle';

/** Couleur des objets à l'écran : celle du trait (calque ou objet) ou celle de la classification métier. */
export type ColorMode = 'calque' | 'metier';

export type ToolId = 'select' | 'line' | 'rect' | 'circle' | 'arc' | 'arcCenter' | 'polyline' | 'dimension' | 'measure' | 'block' | 'text' | 'trim' | 'extend' | 'fillet' | 'chamfer' | 'pan';

interface Props {
  objects: CadObject[];
  /** Pas de la grille d'accrochage (mm). */
  gridSize: number;
  /** Change quand le projet est remplacé (réinitialisation, chargement) : oublie tracé et dernier point. */
  projectKey?: number;
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
  onMoveMany: (ids: string[], dx: number, dy: number) => void;
  onCursor: (x: number | null, y: number | null) => void;
  onSnapChange: (snap: SnapPoint | null) => void;
  onZoomChange: (k: number) => void;
}


/** Les points d'un arc ne sont pas contraints par Ortho (ils seraient alignés). */
function isArcDraft(d: { kind: string } | null): boolean {
  return d?.kind === 'arc' || d?.kind === 'arcCenter';
}

interface Draft {
  kind: 'line' | 'rect' | 'circle' | 'arc' | 'arcCenter' | 'polyline' | 'measure';
  sx: number; sy: number;
  cx: number; cy: number;
  points: number[];
}

/** Longueur en deçà de laquelle un tracé est considéré comme nul (mm) — aucune taille minimale métier. */
const MIN_LENGTH = 1e-6;
/** Déplacement minimal de la souris pour qu'un tracé soit pris en compte (pixels écran). */
const DRAG_THRESHOLD_PX = 3;

export default function CanvasView({
  objects,
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
  onMoveMany,
  gridSize,
  projectKey,
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
  const activeDraft = draft && (
    (draft.kind === 'polyline' && tool === 'polyline') ||
    (draft.kind === 'measure' && tool === 'measure') ||
    ((draft.kind === 'line' || draft.kind === 'rect' || draft.kind === 'circle' || draft.kind === 'arc' || draft.kind === 'arcCenter') && draft.kind === tool)
  ) ? draft : null;
  const [hoverSnap, setHoverSnap] = useState<SnapPoint | null>(null);
  const [pointText, setPointText] = useState('');
  const [pointError, setPointError] = useState<string | null>(null);
  /** Dernier point posé (souris, doigt ou saisie) : origine des saisies relatives @. */
  const lastPlaced = useRef<Point | null>(null);
  useEffect(() => { lastPlaced.current = null; }, [projectKey]);
  const applyPointRef = useRef<(text: string) => void>(() => {});
  const [pointFocused, setPointFocused] = useState(false);
  /** Longueur affichée dans l'unité choisie. */
  const showNum = (mm: number) => fmt(fromMm(mm, displayUnit), unitDecimals(displayUnit));
  const showLen = (mm: number) => `${showNum(mm)} ${displayUnit}`;
  const [lengthInput, setLengthInput] = useState('');
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const drag = useRef<{
    mode: 'pan' | 'move' | 'marquee' | null;
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
  const visibleObjects = objects.filter(o => layerById.get(o.layerId)?.visible !== false);
  const editableObjects = visibleObjects.filter(o => layerById.get(o.layerId)?.locked !== true);

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
        (d.kind === 'polyline' && tool === 'polyline') ||
        (d.kind === 'measure' && tool === 'measure') ||
        ((d.kind === 'line' || d.kind === 'rect' || d.kind === 'circle' || d.kind === 'arc' || d.kind === 'arcCenter') && d.kind === tool);
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
    setDraft(d => {
      if (d?.kind === 'polyline' && d.points.length >= 4 && activeLayer && !activeLayer.locked) {
        onAdd({ kind: 'polyline', classification: 'non-classifie' as Classification, layerId: activeLayer.id, hatch: 'none', points: d.points });
      }
      return null;
    });
  }, [activeLayer, onAdd]);

  const startOrContinueDraft = useCallback((point: SnapPoint) => {
    if (!activeLayer || activeLayer.locked) return;
    lastPlaced.current = { x: point.x, y: point.y };
    if (tool === 'polyline') {
      setDraft(d => {
        if (d?.kind === 'polyline') return { ...d, points: [...d.points, point.x, point.y], cx: point.x, cy: point.y };
        return { kind: 'polyline', sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [point.x, point.y] };
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
    if (tool === 'measure') {
      setDraft({ kind: 'measure', sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [] });
      return;
    }
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      setDraft({ kind: tool, sx: point.x, sy: point.y, cx: point.x, cy: point.y, points: [] });
    }
  }, [activeLayer, tool, activeDraft, onAdd]);

  const handleDown = (e: React.PointerEvent) => {
    discardIncompatibleDraft();
    const w = toWorld(e);

    if (tool === 'pan' || e.button === 1) {
      drag.current = { mode: 'pan', lx: e.clientX, ly: e.clientY };
      return;
    }
    if (tool === 'trim' || tool === 'extend') {
      // Désigner la portion à retirer (ajuster) ou l'extrémité à prolonger.
      const hit = hitTest(editableObjects, objects, blocks, w.x, w.y, (coarse.current ? 14 : 6) / tf.k);
      if (hit) onTrimExtend(tool, hit.id, w.x, w.y);
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
        const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
        if (!selectedIds.includes(hit.id)) onSelectMany([hit.id]);
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
      const inside = editableObjects
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
  }, [lengthInput, activeDraft, activeLayer, onAdd, commitDraft, displayUnit]);

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
    if (d && (d.kind === 'polyline' || d.kind === 'arc' || d.kind === 'arcCenter') && d.points.length >= 2) {
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
    if (tool === 'polyline' || tool === 'arc' || tool === 'arcCenter') {
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

  const restoreGestureStart = () => {
    pendingDown.current = null;
    setDraft(draftAtGestureStart.current);
    setMarquee(null);
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
    if (e.type === 'pointercancel') {
      // Geste interrompu par le navigateur : rien de ce geste ne doit subsister.
      if (e.pointerType === 'mouse') {
        drag.current = { mode: null, lx: 0, ly: 0 };
        setMarquee(null);
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
    const bounds = projectBounds(visibleObjects, blocks);
    const rect = ref.current?.getBoundingClientRect();
    if (!bounds || !rect) return;
    // Marge proportionnelle : une marge fixe écraserait les zones basses (téléphone en paysage).
    const pad = Math.min(70, rect.width * 0.08, rect.height * 0.08);
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const k = Math.min(4, Math.max(0.08, Math.min((rect.width - pad * 2) / width, (rect.height - pad * 2) / height)));
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
        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`}>
          <rect x={-tf.x / tf.k - 100} y={-tf.y / tf.k - 100} width={(viewSize.w || 4000) / tf.k + 200} height={(viewSize.h || 4000) / tf.k + 200} fill="url(#grid-maj)" />
          <line x1={-100000} y1={0} x2={100000} y2={0} stroke="#22304f" strokeWidth={1 / tf.k} />
          <line x1={0} y1={-100000} x2={0} y2={100000} stroke="#22304f" strokeWidth={1 / tf.k} />

          {hoverSnap && (
            <g pointerEvents="none">
              <line x1={hoverSnap.x} y1={-100000} x2={hoverSnap.x} y2={100000} stroke="#22d3ee" strokeWidth={0.6 / tf.k} opacity={0.18} />
              <line x1={-100000} y1={hoverSnap.y} x2={100000} y2={hoverSnap.y} stroke="#22d3ee" strokeWidth={0.6 / tf.k} opacity={0.18} />
            </g>
          )}

          {visibleObjects.map(o => (
            <ObjectShape
              key={o.id}
              obj={o}
              objects={objects}
              blocks={blocks}
              view={view}
              selected={selectedIds.includes(o.id)}
              zoom={tf.k}
              unit={displayUnit}
              layer={layerById.get(o.layerId)}
              colorMode={colorMode}
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
          {activeDraft && activeDraft.kind === 'polyline' && (
            <polyline points={[...activeDraft.points, activeDraft.cx, activeDraft.cy].join(',')} fill="none"
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

      {(tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'arc' || tool === 'arcCenter' || tool === 'polyline' || tool === 'measure' || tool === 'dimension' || tool === 'block' || tool === 'text') && (
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

function ObjectShape({ obj, objects, blocks, view, selected, zoom, unit, layer, colorMode }: {
  obj: CadObject;
  unit: DisplayUnit;
  layer: Layer | undefined;
  colorMode: ColorMode;
  objects: CadObject[];
  blocks: BlockDef[];
  view: ViewReading;
  selected: boolean;
  zoom: number;
}) {
  if (obj.kind === 'dimension') return <DimensionShape obj={obj} objects={objects} selected={selected} zoom={zoom} />;
  if (obj.kind === 'blockRef') return <BlockRefShape obj={obj} blocks={blocks} view={view} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} />;
  if (obj.kind === 'text') return <TextShape obj={obj} selected={selected} zoom={zoom} layer={layer} colorMode={colorMode} />;
  return <PrimitiveShape obj={obj} view={view} selected={selected} zoom={zoom} showLabel={selected} unit={unit} layer={layer} colorMode={colorMode} />;
}

function PrimitiveShape({ obj, view, selected, zoom, showLabel, unit = 'mm', layer, colorMode = 'calque', owner }: {
  obj: PrimitiveObject;
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
  const sw = (widthPx + (selected ? 1 : 0)) / zoom;
  const color = selected ? '#22d3ee' : colorMode === 'metier' ? meta.color : st.color;
  const pattern = screenDash(st.lineType, widthPx);
  const dash = pattern ? pattern.map(v => v / zoom).join(' ')
    : colorMode === 'metier' && view === 'batiment' && obj.classification === 'electrique' ? `${8 / zoom} ${5 / zoom}` : undefined;
  const hatchFill = obj.hatch === 'diagonal' ? 'url(#hatch-diagonal)' : obj.hatch === 'cross' ? 'url(#hatch-cross)' : undefined;
  const solidFill = obj.hatch === 'solid';
  const common = { stroke: color, strokeWidth: sw, strokeDasharray: dash };

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
          <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} {...common} fill={color} fillOpacity={solidFill ? (selected ? 0.28 : 0.16) : selected ? 0.12 : 0.04} />
          {hatchFill && <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} fill={hatchFill} stroke="none" />}
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
          <circle cx={obj.cx} cy={obj.cy} r={obj.r} {...common} fill={color} fillOpacity={solidFill ? (selected ? 0.28 : 0.16) : selected ? 0.12 : 0.04} />
          {hatchFill && <circle cx={obj.cx} cy={obj.cy} r={obj.r} fill={hatchFill} stroke="none" />}
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
    case 'polyline': {
      const closed = isClosedPolyline(obj);
      return (
        <g>
          {closed && <polygon points={obj.points.join(',')} fill={hatchFill ?? color} fillOpacity={hatchFill ? 1 : solidFill ? 0.16 : 0.04} stroke="none" />}
          <polyline points={obj.points.join(',')} fill="none" {...common} />
          <polyline points={obj.points.join(',')} fill="none" stroke="transparent" strokeWidth={10 / zoom} />
          {showLabel && label(obj.points[0], obj.points[1])}
        </g>
      );
    }
  }
}

function DimensionShape({ obj, objects, selected, zoom }: { obj: DimensionObj; objects: CadObject[]; selected: boolean; zoom: number }) {
  const target = objects.find(o => o.id === obj.targetId);
  const geom = target ? dimensionGeometry(obj, target) : null;
  if (!geom) {
    return (
      <text x={0} y={0} fontSize={11 / zoom} fill="#fb7185" fontFamily="JetBrains Mono, monospace">
        {obj.id} · cible absente
      </text>
    );
  }
  const color = selected ? '#22d3ee' : '#fbbf24';
  const sw = (selected ? 1.8 : 1.1) / zoom;
  return (
    <g>
      {geom.ext.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.8 / zoom} opacity={0.65} />
      ))}
      <line x1={geom.x1} y1={geom.y1} x2={geom.x2} y2={geom.y2} stroke={color} strokeWidth={sw} markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)" />
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

function BlockRefShape({ obj, blocks, view, selected, zoom, layer, colorMode }: { obj: Extract<CadObject, { kind: 'blockRef' }>; blocks: BlockDef[]; view: ViewReading; selected: boolean; zoom: number; layer?: Layer; colorMode: ColorMode }) {
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
        {block.primitives.map(p => (
          <PrimitiveShape key={p.id} obj={p} view={view} selected={false} zoom={zoom / obj.scale} showLabel={false} layer={layer} colorMode={colorMode} owner={obj} />
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
  for (let i = candidates.length - 1; i >= 0; i--) {
    const o = candidates[i];
    if (o.kind === 'line' && distanceSegment(x, y, o.x1, o.y1, o.x2, o.y2) <= tol) return o;
    if (o.kind === 'rect') {
      const inside = x >= o.x - tol && x <= o.x + o.w + tol && y >= o.y - tol && y <= o.y + o.h + tol;
      const nearEdge = Math.min(Math.abs(x - o.x), Math.abs(x - (o.x + o.w))) <= tol || Math.min(Math.abs(y - o.y), Math.abs(y - (o.y + o.h))) <= tol;
      if (inside && nearEdge) return o;
      if (inside && o.classification !== 'non-classifie') return o;
    }
    if (o.kind === 'circle' && Math.abs(Math.hypot(x - o.cx, y - o.cy) - o.r) <= tol) return o;
    if (o.kind === 'arc' && distanceToArc(o, x, y) <= tol) return o;
    if (o.kind === 'polyline') {
      for (let j = 0; j + 3 <= o.points.length; j += 2) {
        if (distanceSegment(x, y, o.points[j], o.points[j + 1], o.points[j + 2], o.points[j + 3]) <= tol) return o;
      }
    }
    if (o.kind === 'dimension') {
      const target = allObjects.find(t => t.id === o.targetId);
      const geom = target ? dimensionGeometry(o, target) : null;
      if (geom && distanceSegment(x, y, geom.x1, geom.y1, geom.x2, geom.y2) <= tol) return o;
    }
    if (o.kind === 'text' && pointInText(o, x, y, tol)) return o;
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
