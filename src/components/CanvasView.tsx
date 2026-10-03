// Zone de travail : canvas SVG 2D avec grille, accrochage, panoramique, zoom,
// aperçu avant validation (UX3) et lecture des objets selon la vue active.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CadObject, Classification, NewCadObject, ViewReading } from '@/types/cad';
import { CLASSIFICATION_META, fmt } from '@/types/cad';

export type ToolId = 'select' | 'line' | 'rect' | 'circle' | 'polyline' | 'pan';

interface Props {
  objects: CadObject[];
  tool: ToolId;
  view: ViewReading;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (partial: NewCadObject) => void;
  onMove: (id: string, patch: Partial<CadObject>) => void;
  onCursor: (x: number | null, y: number | null) => void;
  onZoomChange: (k: number) => void;
}

const SNAP = 10;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

interface Draft {
  kind: 'line' | 'rect' | 'circle' | 'polyline';
  sx: number; sy: number;   // point de départ (accroché)
  cx: number; cy: number;   // point courant (accroché)
  points: number[];         // polyligne en cours
}

export default function CanvasView({ objects, tool, view, selectedId, onSelect, onAdd, onMove, onCursor, onZoomChange }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [tf, setTf] = useState({ x: 60, y: 40, k: 1 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const drag = useRef<{ mode: 'pan' | 'move' | null; id?: string; lx: number; ly: number; orig?: CadObject; moved?: boolean }>({ mode: null, lx: 0, ly: 0 });

  const toWorld = useCallback((e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - tf.x) / tf.k, y: (e.clientY - r.top - tf.y) / tf.k };
  }, [tf]);

  // Annuler une polyligne en cours si l'outil change
  useEffect(() => { if (tool !== 'polyline') setDraft(d => (d?.kind === 'polyline' ? null : d)); }, [tool]);

  const commitDraft = useCallback((d: Draft) => {
    const base = { classification: 'non-classifie' as Classification, layer: 'Dessin libre' };
    if (d.kind === 'line') {
      if (Math.hypot(d.cx - d.sx, d.cy - d.sy) >= 1) onAdd({ ...base, kind: 'line', x1: d.sx, y1: d.sy, x2: d.cx, y2: d.cy });
    } else if (d.kind === 'rect') {
      const x = Math.min(d.sx, d.cx), y = Math.min(d.sy, d.cy);
      const w = Math.abs(d.cx - d.sx), h = Math.abs(d.cy - d.sy);
      if (w >= 1 && h >= 1) onAdd({ ...base, kind: 'rect', x, y, w, h });
    } else if (d.kind === 'circle') {
      const r = Math.hypot(d.cx - d.sx, d.cy - d.sy);
      if (r >= 1) onAdd({ ...base, kind: 'circle', cx: d.sx, cy: d.sy, r });
    }
  }, [onAdd]);

  const finishPolyline = useCallback(() => {
    setDraft(d => {
      if (d?.kind === 'polyline' && d.points.length >= 4) {
        onAdd({ kind: 'polyline', classification: 'non-classifie' as Classification, layer: 'Dessin libre', points: d.points });
      }
      return null;
    });
  }, [onAdd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null);
      if (e.key === 'Enter') finishPolyline();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishPolyline]);

  const handleDown = (e: React.MouseEvent) => {
    const w = toWorld(e);
    const sx = snap(w.x), sy = snap(w.y);

    if (tool === 'pan' || e.button === 1) {
      drag.current = { mode: 'pan', lx: e.clientX, ly: e.clientY };
      return;
    }
    if (tool === 'select') {
      const hit = hitTest(objects, w.x, w.y, 6 / tf.k);
      if (hit) {
        onSelect(hit.id);
        drag.current = { mode: 'move', id: hit.id, lx: w.x, ly: w.y, orig: hit, moved: false };
      } else {
        onSelect(null);
        drag.current = { mode: 'pan', lx: e.clientX, ly: e.clientY };
      }
      return;
    }
    if (tool === 'polyline') {
      setDraft(d => {
        if (d?.kind === 'polyline') return { ...d, points: [...d.points, sx, sy] };
        return { kind: 'polyline', sx, sy, cx: sx, cy: sy, points: [sx, sy] };
      });
      return;
    }
    setDraft({ kind: tool, sx, sy, cx: sx, cy: sy, points: [] });
  };

  const handleMove = (e: React.MouseEvent) => {
    const w = toWorld(e);
    onCursor(w.x, w.y);

    if (drag.current.mode === 'pan') {
      const dx = e.clientX - drag.current.lx, dy = e.clientY - drag.current.ly;
      drag.current.lx = e.clientX; drag.current.ly = e.clientY;
      setTf(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
      return;
    }
    if (drag.current.mode === 'move' && drag.current.orig) {
      drag.current.moved = true;
      return; // déplacement appliqué au relâchement (aperçu natif SVG ci-dessous via transform)
    }
    setDraft(d => (d && d.kind !== 'polyline' ? { ...d, cx: snap(w.x), cy: snap(w.y) } : d?.kind === 'polyline' ? { ...d, cx: snap(w.x), cy: snap(w.y) } : d));
  };

  const handleUp = (e: React.MouseEvent) => {
    if (drag.current.mode === 'move' && drag.current.orig && drag.current.moved) {
      const w = toWorld(e);
      const dx = snap(w.x - drag.current.lx), dy = snap(w.y - drag.current.ly);
      const o = drag.current.orig;
      if (dx !== 0 || dy !== 0) {
        if (o.kind === 'line') onMove(o.id, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy });
        else if (o.kind === 'rect') onMove(o.id, { x: o.x + dx, y: o.y + dy });
        else if (o.kind === 'circle') onMove(o.id, { cx: o.cx + dx, cy: o.cy + dy });
        else onMove(o.id, { points: o.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) });
      }
    }
    drag.current = { mode: null, lx: 0, ly: 0 };
    if (draft && draft.kind !== 'polyline') {
      commitDraft(draft);
      setDraft(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setTf(t => {
      const k = Math.min(8, Math.max(0.15, t.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const wx = (mx - t.x) / t.k, wy = (my - t.y) / t.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
    onZoomChange(tf.k);
  };

  const cursorClass = tool === 'pan' ? 'canvas-grab' : tool === 'select' ? 'canvas-move' : 'canvas-cross';

  return (
    <svg
      ref={ref}
      className={`h-full w-full select-none ${cursorClass}`}
      onMouseDown={handleDown}
      onMouseMove={handleMove}
      onMouseUp={handleUp}
      onMouseLeave={() => { onCursor(null, null); drag.current = { mode: null, lx: 0, ly: 0 }; }}
      onWheel={handleWheel}
      onDoubleClick={finishPolyline}
    >
      <defs>
        <pattern id="grid-min" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#131c31" strokeWidth="0.5" />
        </pattern>
        <pattern id="grid-maj" width="100" height="100" patternUnits="userSpaceOnUse">
          <rect width="100" height="100" fill="url(#grid-min)" />
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#1c2947" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill="#070b16" />
      <g transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`}>
        <rect x={-tf.x / tf.k - 100} y={-tf.y / tf.k - 100} width="100%" height="100%" fill="url(#grid-maj)"
          style={{ width: '200%', height: '200%' }} />
        {/* axes */}
        <line x1={-5000} y1={0} x2={5000} y2={0} stroke="#22304f" strokeWidth={1 / tf.k} />
        <line x1={0} y1={-5000} x2={0} y2={5000} stroke="#22304f" strokeWidth={1 / tf.k} />

        {objects.map(o => (
          <ObjectShape key={o.id} obj={o} view={view} selected={o.id === selectedId} zoom={tf.k} />
        ))}

        {draft && draft.kind === 'line' && (
          <line x1={draft.sx} y1={draft.sy} x2={draft.cx} y2={draft.cy} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
        )}
        {draft && draft.kind === 'rect' && (
          <rect x={Math.min(draft.sx, draft.cx)} y={Math.min(draft.sy, draft.cy)} width={Math.abs(draft.cx - draft.sx)} height={Math.abs(draft.cy - draft.sy)}
            fill="#22d3ee" fillOpacity={0.08} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
        )}
        {draft && draft.kind === 'circle' && (
          <circle cx={draft.sx} cy={draft.sy} r={Math.hypot(draft.cx - draft.sx, draft.cy - draft.sy)}
            fill="#22d3ee" fillOpacity={0.08} stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
        )}
        {draft && draft.kind === 'polyline' && (
          <polyline points={[...draft.points, draft.cx, draft.cy].join(',')} fill="none"
            stroke="#22d3ee" strokeWidth={1.5 / tf.k} strokeDasharray={`${6 / tf.k} ${4 / tf.k}`} />
        )}
        {draft && <circle cx={draft.sx} cy={draft.sy} r={3 / tf.k} fill="#22d3ee" />}
      </g>
    </svg>
  );
}

function ObjectShape({ obj, view, selected, zoom }: { obj: CadObject; view: ViewReading; selected: boolean; zoom: number }) {
  const meta = CLASSIFICATION_META[obj.classification];
  const sw = (selected ? 2.5 : 1.5) / zoom;
  const color = selected ? '#22d3ee' : meta.color;
  const common = { stroke: color, strokeWidth: sw, fillOpacity: selected ? 0.14 : 0.05 };
  // Lecture industrie : tracé plein ; lecture bâtiment : pointillés fins pour l'électrique
  const dash = view === 'batiment' && obj.classification === 'electrique' ? `${8 / zoom} ${5 / zoom}` : undefined;

  const label = (x: number, y: number) => (
    <text x={x} y={y - 6 / zoom} fontSize={11 / zoom} fill={selected ? '#22d3ee' : '#8b93a7'} fontFamily="JetBrains Mono, monospace">
      {obj.id} · {obj.name}
    </text>
  );

  switch (obj.kind) {
    case 'line':
      return (
        <g>
          <line x1={obj.x1} y1={obj.y1} x2={obj.x2} y2={obj.y2} {...common} fill="none" strokeDasharray={dash} />
          <line x1={obj.x1} y1={obj.y1} x2={obj.x2} y2={obj.y2} stroke="transparent" strokeWidth={10 / zoom} />
          {selected && label(Math.min(obj.x1, obj.x2), Math.min(obj.y1, obj.y2))}
        </g>
      );
    case 'rect':
      return (
        <g>
          <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} {...common} fill={color} strokeDasharray={dash} />
          {selected && label(obj.x, obj.y)}
          {selected && (
            <text x={obj.x + obj.w / 2} y={obj.y + obj.h + 14 / zoom} fontSize={10 / zoom} fill="#5f6b85" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              {fmt(obj.w)} × {fmt(obj.h)} mm
            </text>
          )}
        </g>
      );
    case 'circle':
      return (
        <g>
          <circle cx={obj.cx} cy={obj.cy} r={obj.r} {...common} fill={color} strokeDasharray={dash} />
          <line x1={obj.cx - 5 / zoom} y1={obj.cy} x2={obj.cx + 5 / zoom} y2={obj.cy} stroke={color} strokeWidth={1 / zoom} />
          <line x1={obj.cx} y1={obj.cy - 5 / zoom} x2={obj.cx} y2={obj.cy + 5 / zoom} stroke={color} strokeWidth={1 / zoom} />
          {selected && label(obj.cx - obj.r, obj.cy - obj.r)}
          {selected && (
            <text x={obj.cx} y={obj.cy + obj.r + 14 / zoom} fontSize={10 / zoom} fill="#5f6b85" textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              Ø {fmt(obj.r * 2)} mm
            </text>
          )}
        </g>
      );
    case 'polyline':
      return (
        <g>
          <polyline points={obj.points.join(',')} fill="none" {...common} strokeDasharray={dash} />
          <polyline points={obj.points.join(',')} fill="none" stroke="transparent" strokeWidth={10 / zoom} />
          {selected && label(obj.points[0], obj.points[1])}
        </g>
      );
  }
}

// Accrochage : distance au segment pour lignes et polylignes
function hitTest(objects: CadObject[], x: number, y: number, tol: number): CadObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.kind === 'line' && distSeg(x, y, o.x1, o.y1, o.x2, o.y2) <= tol) return o;
    if (o.kind === 'rect') {
      const inside = x >= o.x - tol && x <= o.x + o.w + tol && y >= o.y - tol && y <= o.y + o.h + tol;
      const nearEdge =
        Math.min(Math.abs(x - o.x), Math.abs(x - (o.x + o.w))) <= tol ||
        Math.min(Math.abs(y - o.y), Math.abs(y - (o.y + o.h))) <= tol;
      if (inside && nearEdge) return o;
      if (inside && o.classification !== 'non-classifie') return o; // remplissage cliquable pour objets métier
    }
    if (o.kind === 'circle' && Math.abs(Math.hypot(x - o.cx, y - o.cy) - o.r) <= tol) return o;
    if (o.kind === 'polyline') {
      for (let j = 0; j + 3 <= o.points.length; j += 2) {
        if (distSeg(x, y, o.points[j], o.points[j + 1], o.points[j + 2], o.points[j + 3]) <= tol) return o;
      }
    }
  }
  return null;
}

function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
