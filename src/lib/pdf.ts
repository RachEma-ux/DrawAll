// Export PDF calibré d'une feuille (lot 2.5) : PDF 1.4 vectoriel, une page aux dimensions exactes
// de la feuille, sans dépendance. Les fenêtres sont découpées (chemin de découpe) ; traits, motifs
// et annotations sont à leurs tailles papier. Impression monochrome (noir), usage du dessin technique.
// Repère PDF : origine en bas à gauche, Y vers le haut, unités en points (1 pt = 25,4 / 72 mm).
import type { BlockDef, CadObject, Layer, Level, MicroVersion, OpeningObj, PrimitiveObject, Sheet, TextObj, Viewport, WallObj } from '@/types/cad';
import { dimensionValue, isClosedPolyline } from '@/types/cad';
import { dimensionGeometry, primitiveBounds } from '@/lib/geometry';
import { slabAsPolyline } from '@/lib/slab';
import { roofInput, roofPrimitives } from '@/lib/roof';
import { arcSweep } from '@/lib/arc';
import { ellipseBeziers, isFullEllipse } from '@/lib/ellipse';
import { splineSamples } from '@/lib/spline';
import { effectiveStyle, lineTypeDef } from '@/lib/linestyle';
import { PAPER_DIMENSION_STYLE, arrowHead, dimensionTextPosition } from '@/lib/annotation';
import { pdimGeometry } from '@/lib/pdim';
import { hatchAngles, hatchParamsOf, hatchSegments, loopOf } from '@/lib/hatch';
import { wallHatchShape, wallsGeometry } from '@/lib/wall';
import { openingGeometry } from '@/lib/opening';
import { areaM2, centroid, formatM2, roomPolygons } from '@/lib/rooms';
import { layerVisibleInViewport, modelToPaper, printableArea, scaleRatio, sheetSize } from '@/lib/sheet';
import { textLines, TEXT_FONT_SCALE, TEXT_LINE_SPACING } from '@/lib/text';
import { titleBlockFields, titleBlockRect } from '@/lib/titleblock';
import { occurrencePrimitives, profileById, withProfile, withProfileBlocks, type DrawingProfile } from '@/lib/materials';
import { onLevel, viewportLevelId } from '@/lib/levels';
import { annotationGeometry, isAnnotation } from '@/lib/bom';
import { linkedViews } from '@/lib/views';
import { cutView } from '@/lib/cuts';

export const MM_TO_PT = 72 / 25.4;

export interface PdfInput {
  sheet: Sheet;
  objects: CadObject[];
  layers: Layer[];
  blocks: BlockDef[];
  /** Niveaux du projet : une fenêtre sans niveau valide montre le premier. */
  levels?: Level[];
  versions: MicroVersion[];
  pointer: number;
  /** Date de création inscrite dans le fichier (pour des sorties reproductibles en test). */
  date?: Date;
  /** Profil de dessin : chaque fenêtre en tire les motifs selon son contexte (coupe ou vue). */
  profile?: DrawingProfile;
}

interface P { x: number; y: number }

/** Nombre PDF compact : 3 décimales au plus (1/1000 pt ≈ 0,35 µm). */
const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

// ─── Texte : WinAnsi et largeurs Helvetica ─────────────────────────────────────

const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f, ' ': 0xa0,
  // Signe moins (U+2212, absent de WinAnsi) : tiret demi-cadratin, de même largeur que les chiffres.
  '−': 0x96,
};

/** Chaîne PDF littérale encodée en WinAnsi ; un caractère non représentable devient « ? ». */
export function pdfString(text: string): string {
  let out = '(';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const b = WIN_ANSI_EXTRA[ch] ?? (code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : 0x3f);
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return `${out})`;
}

// Largeurs Helvetica (1/1000 em) pour les caractères 32 à 126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Largeur d'un texte en Helvetica, en unités de la taille de police. */
export function textWidthEm(text: string): number {
  let w = 0;
  for (const ch of text) {
    const base = ch.normalize('NFD')[0];
    const c = base.charCodeAt(0);
    w += (c >= 32 && c <= 126 ? HELVETICA[c - 32] : 556) / 1000;
  }
  return w;
}

// ─── Géométrie ────────────────────────────────────────────────────────────────

/** Arc de cercle en courbes de Bézier (≤ 90° par courbe), angles en degrés dans le sens trigonométrique. */
export function arcPath(c: P, r: number, startDeg: number, sweepDeg: number, moveTo = true): string {
  const parts: string[] = [];
  const segs = Math.max(1, Math.ceil(Math.abs(sweepDeg) / 90 - 1e-9));
  const step = (sweepDeg / segs) * (Math.PI / 180);
  let a = startDeg * (Math.PI / 180);
  const k = (4 / 3) * Math.tan(step / 4);
  if (moveTo) parts.push(`${n(c.x + r * Math.cos(a))} ${n(c.y + r * Math.sin(a))} m`);
  for (let i = 0; i < segs; i++) {
    const b = a + step;
    const p1 = { x: c.x + r * (Math.cos(a) - k * Math.sin(a)), y: c.y + r * (Math.sin(a) + k * Math.cos(a)) };
    const p2 = { x: c.x + r * (Math.cos(b) + k * Math.sin(b)), y: c.y + r * (Math.sin(b) - k * Math.cos(b)) };
    parts.push(`${n(p1.x)} ${n(p1.y)} ${n(p2.x)} ${n(p2.y)} ${n(c.x + r * Math.cos(b))} ${n(c.y + r * Math.sin(b))} c`);
    a = b;
  }
  return parts.join('\n');
}

function primitiveIn(p: PrimitiveObject, x: number, y: number, s: number): PrimitiveObject {
  switch (p.kind) {
    case 'line': return { ...p, x1: x + p.x1 * s, y1: y + p.y1 * s, x2: x + p.x2 * s, y2: y + p.y2 * s };
    case 'rect': return { ...p, x: x + p.x * s, y: y + p.y * s, w: p.w * s, h: p.h * s };
    case 'circle': return { ...p, cx: x + p.cx * s, cy: y + p.cy * s, r: p.r * s };
    case 'arc': return { ...p, cx: x + p.cx * s, cy: y + p.cy * s, r: p.r * s };
    case 'ellipse': return { ...p, cx: x + p.cx * s, cy: y + p.cy * s, rx: p.rx * s, ry: p.ry * s };
    case 'spline':
    case 'polyline': return { ...p, points: p.points.map((v, i) => (i % 2 === 0 ? x + v * s : y + v * s)) };
  }
}

// ─── Écriture de la feuille ───────────────────────────────────────────────────

export function sheetToPdf(input: PdfInput): string {
  const { sheet, layers, blocks } = input;
  const profile = input.profile ?? profileById(undefined);
  const size = sheetSize(sheet.format, sheet.orientation);
  const W = size.w * MM_TO_PT, H = size.h * MM_TO_PT;
  /** Point de la feuille (mm, Y vers le bas) → point PDF (pt, Y vers le haut). */
  const pt = (q: P): P => ({ x: q.x * MM_TO_PT, y: H - q.y * MM_TO_PT });
  const ops: string[] = [];
  const out = (s: string) => ops.push(s);

  const setStroke = (lineWeightMm: number, dashMm?: number[]) => {
    out(`${n(lineWeightMm * MM_TO_PT)} w`);
    out(dashMm && dashMm.length ? `[${dashMm.map(d => n(d * MM_TO_PT)).join(' ')}] 0 d` : '[] 0 d');
  };

  const text = (s: string, at: P, heightMm: number, rotationDeg = 0, align: 'left' | 'center' | 'right' = 'left') => {
    const size = heightMm * TEXT_FONT_SCALE * MM_TO_PT;
    const width = textWidthEm(s) * size;
    const r = (rotationDeg * Math.PI) / 180;
    const shift = align === 'center' ? width / 2 : align === 'right' ? width : 0;
    const p = pt(at);
    const x = p.x - Math.cos(r) * shift, y = p.y - Math.sin(r) * shift;
    out(`BT /F1 ${n(size)} Tf ${n(Math.cos(r))} ${n(Math.sin(r))} ${n(-Math.sin(r))} ${n(Math.cos(r))} ${n(x)} ${n(y)} Tm ${pdfString(s)} Tj ET`);
  };

  out('0 G 0 g 1 J 1 j');

  // Cadre de la zone utile (trait fort 0,5 mm).
  const area = printableArea(sheet);
  setStroke(0.5);
  {
    const a = pt({ x: area.x, y: area.y + area.h });
    out(`${n(a.x)} ${n(a.y)} ${n(area.w * MM_TO_PT)} ${n(area.h * MM_TO_PT)} re S`);
  }

  for (const vp of sheet.viewports) drawViewport(vp);

  // Cartouche.
  if (sheet.titleBlock) {
    const r = titleBlockRect(sheet);
    const fields = titleBlockFields(sheet, input.versions, input.pointer);
    const cols = 4, rows = 2, cw = r.w / cols, rh = r.h / rows;
    out('1 g');
    { const a = pt({ x: r.x, y: r.y + r.h }); out(`${n(a.x)} ${n(a.y)} ${n(r.w * MM_TO_PT)} ${n(r.h * MM_TO_PT)} re f`); }
    out('0 g');
    setStroke(0.5);
    { const a = pt({ x: r.x, y: r.y + r.h }); out(`${n(a.x)} ${n(a.y)} ${n(r.w * MM_TO_PT)} ${n(r.h * MM_TO_PT)} re S`); }
    setStroke(0.18);
    fields.forEach((f, i) => {
      const cx = r.x + (i % cols) * cw, cy = r.y + Math.floor(i / cols) * rh;
      const a = pt({ x: cx, y: cy + rh });
      out(`${n(a.x)} ${n(a.y)} ${n(cw * MM_TO_PT)} ${n(rh * MM_TO_PT)} re S`);
      text(f.label, { x: cx + 1.5, y: cy + 4 }, 1.8);
      // Valeur réduite si elle dépasse la case.
      let h = 2.5;
      const room = cw - 3;
      const wmm = textWidthEm(f.value) * h * TEXT_FONT_SCALE;
      if (wmm > room) h *= room / wmm;
      text(f.value, { x: cx + 1.5, y: cy + 11 }, h);
    });
  }

  const content = ops.join('\n');
  return assemble(W, H, content, sheet, input.date ?? new Date());

  function drawViewport(vp: Viewport) {
    const k = scaleRatio(vp.scale);
    const objects = withProfile(onLevel(input.objects, viewportLevelId(vp, input.levels)), profile, vp.context ?? 'coupe', blocks);
    const vpBlocks = withProfileBlocks(blocks, profile, vp.context ?? 'coupe');
    const toPdf = (q: P) => pt(modelToPaper(vp, q));
    out('q');
    { const a = pt({ x: vp.x, y: vp.y + vp.h }); out(`${n(a.x)} ${n(a.y)} ${n(vp.w * MM_TO_PT)} ${n(vp.h * MM_TO_PT)} re W n`); }
    const visible = new Map(layers.map(l => [l.id, layerVisibleInViewport(vp, l)]));
    const walls = wallsGeometry(objects.filter((o): o is WallObj => o.kind === 'wall' && !!visible.get(o.layerId)), objects.filter((o): o is OpeningObj => o.kind === 'opening'));
    const rooms = roomPolygons(objects.filter(o => !!visible.get(o.layerId)));
    for (const o of objects) {
      if (!visible.get(o.layerId)) continue;
      const layer = layers.find(l => l.id === o.layerId);
      if (o.kind === 'dimension') { drawDimension(o); continue; }
      if (o.kind === 'pdim') { drawPointDimension(o); continue; }
      if (o.kind === 'underlay' || o.kind === 'note') continue; // fond de plan, note de terrain : à l'écran seulement
      if (o.kind === 'cut') {
        const c = cutView(o, objects.find(s => s.id === o.sourceId), objects.find(s => s.id === o.markId), objects, 0, 5 / k);
        if (!c.ok) continue;
        for (const r of c.value.material) {
          const pseudo = { ...o, kind: 'polyline', hatch: 'diagonal', hatchParams: undefined, points: [r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h, r.x, r.y] } as unknown as PrimitiveObject;
          drawHatch(pathOf(pseudo).path, pseudo, []);
        }
        setStroke(0.5);
        for (const [x1, y1, x2, y2] of c.value.visible) { const p = toPdf({ x: x1, y: y1 }), q = toPdf({ x: x2, y: y2 }); out(`${n(p.x)} ${n(p.y)} m ${n(q.x)} ${n(q.y)} l S`); }
        text(c.value.label.text, modelToPaper(vp, c.value.label), 5, 0, 'center');
        continue;
      }
      if (o.kind === 'views') {
        const views = linkedViews(o, objects.find(s => s.id === o.sourceId), objects);
        for (const v of views ?? []) {
          for (const [segs, w, t] of [[v.visible, 0.5, 'continu'], [v.hidden, 0.25, 'interrompu'], [v.axes, 0.18, 'mixte']] as const) {
            setStroke(w, lineTypeDef(t).pattern.map(x => Math.abs(x) * w));
            for (const [x1, y1, x2, y2] of segs) { const p = toPdf({ x: x1, y: y1 }), q = toPdf({ x: x2, y: y2 }); out(`${n(p.x)} ${n(p.y)} m ${n(q.x)} ${n(q.y)} l S`); }
          }
        }
        continue;
      }
      if (isAnnotation(o)) {
        // Symbole, nomenclature ou repère à sa taille papier : traits fins 0,25 mm / forts 0,7 mm, surfaces pleines, textes.
        const g = annotationGeometry(o, 1 / k, objects, blocks);
        if (!g) continue;
        for (const c of g.circles) { setStroke(0.25); out(`${arcPath(toPdf(c.c), c.r * k * MM_TO_PT, 0, 360)} h S`); }
        for (const l of g.lines) {
          setStroke(l.weight === 'fort' ? 0.7 : 0.25, l.dash ? [12, 2, 1, 2] : undefined);
          const p = toPdf(l.a), q = toPdf(l.b);
          out(`${n(p.x)} ${n(p.y)} m ${n(q.x)} ${n(q.y)} l S`);
        }
        for (const f of g.fills) {
          const q = f.map(toPdf);
          out(`${q.map((p, i) => `${n(p.x)} ${n(p.y)} ${i ? 'l' : 'm'}`).join(' ')} h f`);
        }
        for (const t of g.texts) text(t.text, modelToPaper(vp, t.at), t.height * k, 0, t.anchor === 'middle' ? 'center' : 'left');
        continue;
      }
      if (o.kind === 'room') {
        const poly = rooms.get(o.id);
        if (!poly) continue;
        const c = modelToPaper(vp, centroid(poly));
        text(o.name, c, 3.5, 0, 'center');
        text(formatM2(areaM2(poly)), { x: c.x, y: c.y + 4.5 }, 2.5, 0, 'center');
        continue;
      }
      if (o.kind === 'opening') {
        const host = objects.find(h => h.id === o.hostId);
        const g = host?.kind === 'wall' ? openingGeometry(o, host) : null;
        if (!g) continue;
        setStroke(0.18);
        for (const [a, b] of g.glazing ?? []) { const p = toPdf(a), q = toPdf(b); out(`${n(p.x)} ${n(p.y)} m ${n(q.x)} ${n(q.y)} l S`); }
        if (g.leaf) { setStroke(0.35); const p = toPdf(g.leaf[0]), q = toPdf(g.leaf[1]); out(`${n(p.x)} ${n(p.y)} m ${n(q.x)} ${n(q.y)} l S`); }
        if (g.swing) {
          const ang = (p: { x: number; y: number }) => (Math.atan2(-(p.y - g.swing!.cy), p.x - g.swing!.cx) * 180) / Math.PI;
          let s = ang(g.swing.from), e = ang(g.swing.to);
          let sweep = ((e - s) % 360 + 360) % 360;
          if (sweep > 180) { [s, e] = [e, s]; sweep = 360 - sweep; }
          setStroke(0.18);
          out(`${arcPath(toPdf({ x: g.swing.cx, y: g.swing.cy }), g.swing.r * k * MM_TO_PT, s, sweep)} S`);
        }
        continue;
      }
      if (o.kind === 'wall') {
        const g = walls.get(o.id);
        if (!g) continue;
        const { outline: pseudo, islands } = wallHatchShape(o, g.quad, g.bays);
        if (pseudo.hatch && pseudo.hatch !== 'none') drawHatch(pathOf(pseudo).path, pseudo, islands);
        const st = effectiveStyle(o, layer);
        setStroke(o.lineWeight ?? layer?.lineWeight ?? 0.5, lineTypeDef(st.lineType).pattern.map(v => Math.abs(v) * st.lineWeight));
        for (const [a, b] of g.edges) {
          const p = toPdf(a), q = toPdf(b);
          out(`${n(p.x)} ${n(p.y)} m ${n(q.x)} ${n(q.y)} l S`);
        }
        continue;
      }
      if (o.kind === 'text') { drawText(o); continue; }
      if (o.kind === 'blockRef') {
        const block = vpBlocks.find(b => b.id === o.blockId);
        if (!block) continue;
        for (const prim of occurrencePrimitives(block, o)) drawPrimitive(primitiveIn(prim, o.x, o.y, o.scale), effectiveStyle(o, layer));
        continue;
      }
      if (o.kind === 'roof') { for (const p of roofPrimitives(o, roofInput(o))) drawPrimitive(p, effectiveStyle(o, layer)); continue; }
      drawPrimitive(o.kind === 'slab' ? slabAsPolyline(o) as PrimitiveObject : o, effectiveStyle(o, layer), (o.holes ?? []).map(id => objects.find(x => x.id === id)).filter((x): x is CadObject => !!x));
    }
    out('Q');

    function pathOf(o: PrimitiveObject): { path: string; closed: boolean } {
      switch (o.kind) {
        case 'line': { const a = toPdf({ x: o.x1, y: o.y1 }), b = toPdf({ x: o.x2, y: o.y2 }); return { path: `${n(a.x)} ${n(a.y)} m ${n(b.x)} ${n(b.y)} l`, closed: false }; }
        case 'rect': {
          const c = [{ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }].map(toPdf);
          return { path: `${n(c[0].x)} ${n(c[0].y)} m ${c.slice(1).map(q => `${n(q.x)} ${n(q.y)} l`).join(' ')} h`, closed: true };
        }
        case 'circle': return { path: `${arcPath(toPdf({ x: o.cx, y: o.cy }), o.r * k * MM_TO_PT, 0, 360)} h`, closed: true };
        // Les angles d'arc sont dans le repère DXF (Y vers le haut), comme le repère PDF : rien à inverser.
        case 'arc': return { path: arcPath(toPdf({ x: o.cx, y: o.cy }), o.r * k * MM_TO_PT, o.start, arcSweep(o)), closed: false };
        case 'spline': {
          // Spline : polyligne à 0,005 mm papier de la courbe.
          const pts = splineSamples(o, 0.005 / k).map(toPdf);
          return { path: `${n(pts[0].x)} ${n(pts[0].y)} m ${pts.slice(1).map(q => `${n(q.x)} ${n(q.y)} l`).join(' ')}`, closed: false };
        }
        case 'ellipse': {
          // Courbes de Bézier dans le repère modèle, portées sur la feuille (transformation affine).
          const parts = ellipseBeziers(o).map(b => b.map(toPdf));
          const head = `${n(parts[0][0].x)} ${n(parts[0][0].y)} m`;
          const body = parts.map(([, a, b, c]) => `${n(a.x)} ${n(a.y)} ${n(b.x)} ${n(b.y)} ${n(c.x)} ${n(c.y)} c`).join('\n');
          const closed = isFullEllipse(o);
          return { path: `${head}\n${body}${closed ? ' h' : ''}`, closed };
        }
        case 'polyline': {
          const pts: P[] = [];
          for (let i = 0; i + 1 < o.points.length; i += 2) pts.push(toPdf({ x: o.points[i], y: o.points[i + 1] }));
          const closed = isClosedPolyline(o);
          return { path: `${n(pts[0].x)} ${n(pts[0].y)} m ${pts.slice(1).map(q => `${n(q.x)} ${n(q.y)} l`).join(' ')}${closed ? ' h' : ''}`, closed };
        }
      }
    }

    function drawPrimitive(o: PrimitiveObject, st: ReturnType<typeof effectiveStyle>, islands: CadObject[] = []) {
      if (o.kind === 'polyline' && o.points.length < 4) return;
      const { path, closed } = pathOf(o);
      if (closed && o.hatch && o.hatch !== 'none') drawHatch(path, o, islands);
      const def = lineTypeDef(st.lineType);
      setStroke(st.lineWeight, def.pattern.map(v => Math.abs(v) * st.lineWeight));
      out(`${path} S`);
    }

    function drawHatch(path: string, o: PrimitiveObject, islands: CadObject[]) {
      const loops = [loopOf(o as CadObject), ...islands.map(loopOf)].filter((l): l is NonNullable<typeof l> => !!l);
      if (o.hatch === 'solid') {
        // Aplat : contour et îlots en pair-impair.
        const islandPaths = loops.slice(1).map(l => {
          const q = l.map(p => toPdf(p));
          return `${n(q[0].x)} ${n(q[0].y)} m ${q.slice(1).map(v => `${n(v.x)} ${n(v.y)} l`).join(' ')} h`;
        }).join(' ');
        out('0.75 g'); out(`${path} ${islandPaths} f*`); out('0 g');
        return;
      }
      // Traits calculés sur la feuille (mm papier) : angle, pas (papier, ou modèle × échelle), origine.
      const hp = hatchParamsOf(o);
      const paperLoops = loops.map(l => l.map(p => modelToPaper(vp, p)));
      const bmin = primitiveBounds(o);
      const origin = modelToPaper(vp, { x: bmin.minX + (hp.originX ?? 0), y: bmin.minY + (hp.originY ?? 0) });
      const step = hp.unit === 'modele' ? hp.spacing * k : hp.spacing;
      setStroke(0.18);
      for (const angle of hatchAngles(o.hatch, hp)) {
        for (const [x1, y1, x2, y2] of hatchSegments(paperLoops, angle, step, origin)) {
          const a = pt({ x: x1, y: y1 }), b = pt({ x: x2, y: y2 });
          out(`${n(a.x)} ${n(a.y)} m ${n(b.x)} ${n(b.y)} l S`);
        }
      }
    }

    function drawText(t: TextObj) {
      // Hauteur réelle (modèle) ramenée à l'échelle de la fenêtre.
      const lines = textLines(t.content);
      const r = (t.rotation * Math.PI) / 180;
      lines.forEach((line, i) => {
        const down = i * TEXT_LINE_SPACING * t.height;
        // Ligne suivante : vers le bas dans le repère du texte. Écriture u = (cos r, −sin r) en Y vers le bas ;
        // « vers le bas » du texte = (sin r, cos r) (à r = 90°, le texte monte et la ligne suivante est à droite).
        const at = { x: t.x + Math.sin(r) * down, y: t.y + Math.cos(r) * down };
        text(line, modelToPaper(vp, at), t.height * k, t.rotation, t.align);
      });
    }

    function drawPointDimension(d: Extract<CadObject, { kind: 'pdim' }>) {
      const g = pdimGeometry(d);
      if (!g) return;
      const S = PAPER_DIMENSION_STYLE;
      const P = (q: P) => modelToPaper(vp, q);
      setStroke(S.lineWeight);
      for (const [x1, y1, x2, y2] of [...g.ext, ...g.lines]) {
        const a = pt(P({ x: x1, y: y1 })), b = pt(P({ x: x2, y: y2 }));
        out(`${n(a.x)} ${n(a.y)} m ${n(b.x)} ${n(b.y)} l S`);
      }
      for (const a of g.arcs) out(`${arcPath(pt(P({ x: a.cx, y: a.cy })), a.r * k * MM_TO_PT, a.start, a.sweep)} S`);
      for (const a of g.arrows) {
        // Flèche dessinée sur la feuille : direction prise sur le papier, longueur papier.
        const q = arrowHead(P(a.tip), P(a.from), S.arrowLength, S.arrowHalfWidth).map(pt);
        out(`${n(q[0].x)} ${n(q[0].y)} m ${n(q[1].x)} ${n(q[1].y)} l ${n(q[2].x)} ${n(q[2].y)} l h f`);
      }
      for (const o of g.origins) out(`${arcPath(pt(P(o)), (S.arrowLength / 3) * MM_TO_PT, 0, 360)} h S`);
      for (const m of g.levelMarks) {
        const tip = P(m), h = S.arrowLength;
        const q = [tip, { x: tip.x - h * 0.6, y: tip.y - h }, { x: tip.x + h * 0.6, y: tip.y - h }].map(pt);
        out(`${n(q[0].x)} ${n(q[0].y)} m ${n(q[1].x)} ${n(q[1].y)} l ${n(q[2].x)} ${n(q[2].y)} l h S`);
      }
      for (const t of g.texts) {
        const at = P(t.at);
        const pos = { x: at.x + t.normal.x * S.textGap, y: at.y + t.normal.y * (S.textGap + (t.normal.y > 0.7 ? S.textHeight : 0)) };
        const align = Math.abs(t.normal.x) > 0.7 ? (t.normal.x > 0 ? 'left' : 'right') : 'center';
        text(t.value, pos, S.textHeight, 0, align);
      }
    }

    function drawDimension(d: Extract<CadObject, { kind: 'dimension' }>) {
      const target = objects.find(o => o.id === d.targetId);
      const g = target ? dimensionGeometry(d, target) : null;
      if (!g) return;
      const S = PAPER_DIMENSION_STYLE;
      // Épaisseur et type de trait propres à la cote, comme sur la feuille à l'écran (Conventions §5.2).
      const w = d.lineWeight ?? S.lineWeight;
      setStroke(w);
      for (const [x1, y1, x2, y2] of g.ext) {
        const a = toPdf({ x: x1, y: y1 }), b = toPdf({ x: x2, y: y2 });
        out(`${n(a.x)} ${n(a.y)} m ${n(b.x)} ${n(b.y)} l S`);
      }
      // Ligne, flèches et texte calculés sur la feuille (mm papier), puis convertis en points.
      const a = modelToPaper(vp, { x: g.x1, y: g.y1 }), b = modelToPaper(vp, { x: g.x2, y: g.y2 });
      if (d.lineType !== undefined) setStroke(w, lineTypeDef(d.lineType).pattern.map(v => Math.abs(v) * w));
      { const pa = pt(a), pb = pt(b); out(`${n(pa.x)} ${n(pa.y)} m ${n(pb.x)} ${n(pb.y)} l S`); }
      setStroke(w);
      for (const tri of [arrowHead(b, a, S.arrowLength, S.arrowHalfWidth), ...(g.arrows === 'end' ? [] : [arrowHead(a, b, S.arrowLength, S.arrowHalfWidth)])]) {
        const q = tri.map(pt);
        out(`${n(q[0].x)} ${n(q[0].y)} m ${n(q[1].x)} ${n(q[1].y)} l ${n(q[2].x)} ${n(q[2].y)} l h f`);
      }
      const t = dimensionTextPosition({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, S.textGap);
      text(dimensionValue(d, objects), t, S.textHeight, 0, t.anchor === 'middle' ? 'center' : 'left');
    }
  }
}

function assemble(W: number, H: number, content: string, sheet: Sheet, date: Date): string {
  const d = date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${pdfString(`${sheet.id} - ${sheet.name}`)} /Producer (DrawAll) /CreationDate (D:${d}Z) >>`,
  ];
  let body = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

/** Octets du PDF (chaque caractère de la chaîne est un octet, ≤ 0xFF par construction). */
export function pdfBytes(pdf: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(pdf.length));
  for (let i = 0; i < pdf.length; i++) out[i] = pdf.charCodeAt(i) & 0xff;
  return out;
}
