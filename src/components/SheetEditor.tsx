// Éditeur de feuille (lot 2.2) : feuilles A4–A0, cadre, fenêtres placées et redimensionnées au
// geste. Tout est dessiné en millimètres papier (viewBox de la feuille) ; chaque fenêtre est un
// <svg> imbriqué dont la viewBox est la partie visible du modèle : le découpage est naturel.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BlockDef, CadObject, Layer, Orientation, PaperFormat, Sheet, ViewReading, Viewport } from '@/types/cad';
import { fmt } from '@/types/cad';
import { ObjectShape, type ColorMode } from '@/components/CanvasView';
import { projectBounds } from '@/lib/geometry';
import {
  PAPER_FORMATS, STANDARD_SCALES, fitScale, formatScale, layerVisibleInViewport, parseScale, printableArea,
  scaleRatio, sheetIssues, sheetSize, viewportModelRect, type Rect,
} from '@/lib/sheet';

interface Props {
  sheets: Sheet[];
  objects: CadObject[];
  layers: Layer[];
  blocks: BlockDef[];
  view: ViewReading;
  colorMode: ColorMode;
  onAddSheet: (format: PaperFormat, orientation: Orientation) => string;
  onUpdateSheet: (id: string, patch: Partial<Omit<Sheet, 'id' | 'viewports'>>, label?: string) => void;
  onRemoveSheet: (id: string) => void;
  onAddViewport: (sheetId: string, vp: Partial<Omit<Viewport, 'id'>>) => string | null;
  onUpdateViewport: (sheetId: string, id: string, patch: Partial<Omit<Viewport, 'id'>>, label?: string) => void;
  onRemoveViewport: (sheetId: string, id: string) => void;
}

const MIN_VIEWPORT = 10; // mm papier
const snapMm = (v: number) => Math.round(v);

type Drag = { id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; orig: Rect };

const input = 'w-full rounded-sm border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground';
const btn = 'rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground disabled:opacity-30';

export default function SheetEditor(p: Props) {
  const [sheetId, setSheetId] = useState<string | null>(p.sheets[0]?.id ?? null);
  const sheet = p.sheets.find(s => s.id === sheetId) ?? p.sheets[0] ?? null;
  const [vpId, setVpId] = useState<string | null>(null);
  const viewport = sheet?.viewports.find(v => v.id === vpId) ?? null;

  const svgRef = useRef<SVGSVGElement>(null);
  const [pxPerMm, setPxPerMm] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [live, setLive] = useState<Rect | null>(null);

  const size = sheet ? sheetSize(sheet.format, sheet.orientation) : { w: 420, h: 297 };
  const area = sheet ? printableArea(sheet) : null;
  const issues = sheet ? sheetIssues(sheet) : [];
  const bounds = useMemo(() => projectBounds(p.objects, p.blocks), [p.objects, p.blocks]);

  // Échelle d'affichage (px écran par mm papier), pour des traits lisibles quel que soit le format.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setPxPerMm(Math.min(r.width / size.w, r.height / size.h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h, sheet?.id]);

  const toPaper = (e: { clientX: number; clientY: number }) => {
    const el = svgRef.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const m = el.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: q.x, y: q.y };
  };

  const createSheet = () => {
    const id = p.onAddSheet('A3', 'paysage');
    setSheetId(id);
    setVpId(null);
  };

  /** Nouvelle fenêtre : moitié gauche ou droite libre de la zone utile, cadrée sur le dessin. */
  const createViewport = () => {
    if (!sheet || !area) return;
    const n = sheet.viewports.length;
    const w = n === 0 ? area.w : Math.max(MIN_VIEWPORT, Math.floor(area.w / 2));
    const x = n === 0 ? area.x : area.x + ((n % 2) * Math.floor(area.w / 2));
    const rect = { x, y: area.y, w, h: area.h };
    const center = bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: 0, y: 0 };
    const scale = (bounds && fitScale({ w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY }, rect)) ?? { paper: 1, model: 50 };
    const id = p.onAddViewport(sheet.id, { ...rect, center, scale });
    setVpId(id);
  };

  const onPointerDown = (e: React.PointerEvent, vp: Viewport, mode: Drag['mode']) => {
    e.stopPropagation();
    setVpId(vp.id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id: vp.id, mode, start: toPaper(e), orig: { x: vp.x, y: vp.y, w: vp.w, h: vp.h } });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const q = toPaper(e);
    const dx = q.x - drag.start.x, dy = q.y - drag.start.y;
    const o = drag.orig;
    setLive(drag.mode === 'move'
      ? { ...o, x: snapMm(o.x + dx), y: snapMm(o.y + dy) }
      : { ...o, w: Math.max(MIN_VIEWPORT, snapMm(o.w + dx)), h: Math.max(MIN_VIEWPORT, snapMm(o.h + dy)) });
  };
  const onPointerUp = () => {
    if (drag && live && sheet && (live.x !== drag.orig.x || live.y !== drag.orig.y || live.w !== drag.orig.w || live.h !== drag.orig.h)) {
      p.onUpdateViewport(sheet.id, drag.id, live, drag.mode === 'move' ? 'Déplacer fenêtre' : 'Redimensionner fenêtre');
    }
    setDrag(null);
    setLive(null);
  };

  const numberField = (label: string, value: number, onCommit: (v: number) => void, unit = 'mm') => (
    <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span className="whitespace-nowrap">{label}</span>
      <span className="flex items-center gap-1">
        <input
          key={`${label}-${value}`}
          aria-label={label}
          defaultValue={String(Math.round(value * 1000) / 1000).replace('.', ',')}
          inputMode="decimal"
          onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v !== value) onCommit(v); }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className={`${input} w-20 text-right`}
        />
        <span className="w-6 text-muted-foreground/70">{unit}</span>
      </span>
    </label>
  );

  const panel = (
    <div className="flex flex-col gap-3 p-3 font-mono text-[11px]">
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="ui-label">Feuilles</span>
          <button onClick={createSheet} className={btn}>Nouvelle feuille</button>
        </div>
        {p.sheets.length > 0 ? (
          <select aria-label="Feuille active" value={sheet?.id} onChange={e => { setSheetId(e.target.value); setVpId(null); }} className={input}>
            {p.sheets.map(s => <option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}
          </select>
        ) : (
          <p className="text-muted-foreground">Aucune feuille. Créez-en une pour mettre le dessin en page.</p>
        )}
      </section>

      {sheet && (
        <section className="space-y-1.5">
          <label className="block text-muted-foreground">Nom
            <input key={sheet.id + sheet.name} aria-label="Nom de la feuille" defaultValue={sheet.name}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== sheet.name) p.onUpdateSheet(sheet.id, { name: v }, 'Renommer feuille'); }}
              className={input} />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <select aria-label="Format" value={sheet.format} onChange={e => p.onUpdateSheet(sheet.id, { format: e.target.value as PaperFormat }, 'Format de feuille')} className={input}>
              {PAPER_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <select aria-label="Orientation" value={sheet.orientation} onChange={e => p.onUpdateSheet(sheet.id, { orientation: e.target.value as Orientation }, 'Orientation de feuille')} className={input}>
              <option value="portrait">Portrait</option>
              <option value="paysage">Paysage</option>
            </select>
          </div>
          <p className="text-muted-foreground/70">{fmt(size.w)} × {fmt(size.h)} mm · zone utile {fmt(area!.w)} × {fmt(area!.h)} mm</p>
          <button onClick={() => { if (confirm(`Supprimer ${sheet.id} ?`)) { p.onRemoveSheet(sheet.id); setSheetId(null); setVpId(null); } }} className={`${btn} border-red-400/30 text-red-400`}>Supprimer la feuille</button>
        </section>
      )}

      {sheet && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="ui-label">Fenêtres</span>
            <button onClick={createViewport} className={btn}>Ajouter une fenêtre</button>
          </div>
          <div className="flex flex-col gap-1">
            {sheet.viewports.map(v => (
              <button key={v.id} onClick={() => setVpId(v.id)} aria-pressed={v.id === vpId}
                className={`rounded-sm border px-2 py-1 text-left ${v.id === vpId ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground'}`}>
                {v.id} · {v.name} · {formatScale(v.scale)}
              </button>
            ))}
          </div>
        </section>
      )}

      {sheet && viewport && (
        <section aria-label="Fenêtre sélectionnée" className="space-y-1.5 rounded-sm border border-border p-2">
          <label className="flex items-center justify-between gap-2 text-muted-foreground">
            <span>Échelle</span>
            <select
              aria-label="Échelle de la fenêtre"
              value={STANDARD_SCALES.some(s => formatScale(s) === formatScale(viewport.scale)) ? formatScale(viewport.scale) : 'autre'}
              onChange={e => {
                const s = parseScale(e.target.value);
                if (s) p.onUpdateViewport(sheet.id, viewport.id, { scale: s }, `Échelle ${e.target.value}`);
              }}
              className={`${input} w-28`}
            >
              {STANDARD_SCALES.map(s => <option key={formatScale(s)} value={formatScale(s)}>{formatScale(s)}</option>)}
              {!STANDARD_SCALES.some(s => formatScale(s) === formatScale(viewport.scale)) && <option value="autre">{formatScale(viewport.scale)}</option>}
            </select>
          </label>
          {numberField('Centre X', viewport.center.x, v => p.onUpdateViewport(sheet.id, viewport.id, { center: { ...viewport.center, x: v } }, 'Cadrer fenêtre'))}
          {numberField('Centre Y', viewport.center.y, v => p.onUpdateViewport(sheet.id, viewport.id, { center: { ...viewport.center, y: v } }, 'Cadrer fenêtre'))}
          <button
            onClick={() => bounds && p.onUpdateViewport(sheet.id, viewport.id, { center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } }, 'Cadrer fenêtre')}
            disabled={!bounds} className={btn}>Centrer sur le dessin</button>
          {numberField('Position X', viewport.x, v => p.onUpdateViewport(sheet.id, viewport.id, { x: v }, 'Déplacer fenêtre'))}
          {numberField('Position Y', viewport.y, v => p.onUpdateViewport(sheet.id, viewport.id, { y: v }, 'Déplacer fenêtre'))}
          {numberField('Largeur', viewport.w, v => v >= MIN_VIEWPORT && p.onUpdateViewport(sheet.id, viewport.id, { w: v }, 'Redimensionner fenêtre'))}
          {numberField('Hauteur', viewport.h, v => v >= MIN_VIEWPORT && p.onUpdateViewport(sheet.id, viewport.id, { h: v }, 'Redimensionner fenêtre'))}
          <p className="text-muted-foreground/70">
            Montre {fmt(viewportModelRect(viewport).w)} × {fmt(viewportModelRect(viewport).h)} mm du modèle.
          </p>
          <fieldset className="space-y-0.5">
            <legend className="text-muted-foreground">Calques dans cette fenêtre</legend>
            {p.layers.map(l => (
              <label key={l.id} className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" checked={!viewport.hiddenLayerIds.includes(l.id)} disabled={!l.visible}
                  onChange={e => p.onUpdateViewport(sheet.id, viewport.id, {
                    hiddenLayerIds: e.target.checked ? viewport.hiddenLayerIds.filter(id => id !== l.id) : [...viewport.hiddenLayerIds, l.id],
                  }, e.target.checked ? 'Afficher calque dans la fenêtre' : 'Masquer calque dans la fenêtre')} />
                <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                <span className={l.visible ? '' : 'line-through'}>{l.name}</span>
              </label>
            ))}
          </fieldset>
          <button onClick={() => { p.onRemoveViewport(sheet.id, viewport.id); setVpId(null); }} className={`${btn} border-red-400/30 text-red-400`}>Supprimer la fenêtre</button>
        </section>
      )}

      {issues.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-amber-300">
          {issues.map(i => <li key={i}>⚠ {i}</li>)}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="max-h-[45%] shrink-0 overflow-y-auto border-b border-border lg:max-h-none lg:w-72 lg:border-b-0 lg:border-r">{panel}</aside>
      <div className="relative min-h-0 flex-1 bg-[#05080f] p-3">
        {sheet ? (
          <svg
            ref={svgRef}
            data-testid="sheet"
            viewBox={`${-5} ${-5} ${size.w + 10} ${size.h + 10}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full touch-none select-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={() => setVpId(null)}
          >
            <rect x={0} y={0} width={size.w} height={size.h} fill="#0e1526" stroke="#334155" strokeWidth={0.5} />
            {area && <rect data-testid="cadre" x={area.x} y={area.y} width={area.w} height={area.h} fill="none" stroke="#94a3b8" strokeWidth={0.5} />}
            {sheet.viewports.map(v => {
              const r = live && drag?.id === v.id ? live : v;
              const shown: Viewport = { ...v, ...r };
              const m = viewportModelRect(shown);
              const zoom = pxPerMm * scaleRatio(v.scale);
              const visibleLayer = new Map(p.layers.map(l => [l.id, layerVisibleInViewport(v, l)]));
              const selected = v.id === vpId;
              return (
                <g key={v.id} data-testid={`fenetre-${v.id}`}>
                  <svg x={r.x} y={r.y} width={r.w} height={r.h} viewBox={`${m.x} ${m.y} ${m.w} ${m.h}`} preserveAspectRatio="none" overflow="hidden">
                    {p.objects.filter(o => visibleLayer.get(o.layerId)).map(o => (
                      <ObjectShape key={o.id} obj={o} objects={p.objects} blocks={p.blocks} view={p.view} selected={false}
                        zoom={zoom} unit="mm" layer={p.layers.find(l => l.id === o.layerId)} colorMode={p.colorMode} />
                    ))}
                  </svg>
                  <rect
                    x={r.x} y={r.y} width={r.w} height={r.h}
                    fill="transparent"
                    stroke={selected ? '#22d3ee' : '#475569'}
                    strokeWidth={selected ? 0.6 : 0.35}
                    strokeDasharray={selected ? undefined : '2 1.5'}
                    className="cursor-move"
                    onPointerDown={e => onPointerDown(e, v, 'move')}
                  />
                  <text x={r.x + 1.5} y={r.y + 4} fontSize={3} fill={selected ? '#22d3ee' : '#94a3b8'} fontFamily="JetBrains Mono, monospace" pointerEvents="none">
                    {v.id} · {formatScale(v.scale)}
                  </text>
                  {selected && (
                    <rect
                      data-testid="poignee"
                      x={r.x + r.w - 3} y={r.y + r.h - 3} width={6} height={6}
                      fill="#22d3ee" className="cursor-nwse-resize"
                      onPointerDown={e => onPointerDown(e, v, 'resize')}
                    />
                  )}
                </g>
              );
            })}
            <text x={size.w - 2} y={size.h - 2} fontSize={3.5} textAnchor="end" fill="#64748b" fontFamily="JetBrains Mono, monospace">
              {sheet.id} · {sheet.format} {sheet.orientation}
            </text>
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Créez une feuille pour commencer.</div>
        )}
      </div>
    </div>
  );
}
