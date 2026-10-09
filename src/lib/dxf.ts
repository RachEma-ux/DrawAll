// Interopérabilité DXF.
// - Import : LINE, CIRCLE, ARC et LWPOLYLINE (y compris segments courbes « bulge »).
//   Les coordonnées sont converties de l'unité déclarée par le fichier ($INSUNITS)
//   vers l'unité interne (millimètre). Les arcs sont approchés par des polylignes
//   avec un écart de corde borné (ARC_TOLERANCE_MM), annoncé dans le rapport.
// - Export : DXF R2000 (AC1015) avec marqueurs de sous-classe, lisible par les
//   lecteurs stricts (ezdxf, AutoCAD). Les hachures sont exportées en entités HATCH.
// - Chaque échange produit un rapport : ce qui est conservé, transformé ou perdu.
// Convention : DrawAll travaille en Y descendant (SVG), DXF en Y ascendant.
import type { BlockDef, CadObject, Layer, OpeningObj, PrimitiveObject, TextAlign, TextObj, WallObj } from '@/types/cad';
import { textLines } from '@/lib/text';
import { slabAsPolyline } from '@/lib/slab';
import { roofInput, roofPrimitives } from '@/lib/roof';
import { structurePrimitives } from '@/lib/structure';
import { effectiveSolid, solidPrimitives } from '@/lib/solids';
import { viewPrimitives } from '@/lib/projection';
import { norm360 } from '@/lib/arc';
import { affineEllipse } from '@/lib/ellipse';
import { isValidSpline, knotsOf } from '@/lib/spline';
import { dimensionGeometry, dimensionText, primitiveBounds } from '@/lib/geometry';
import { pdimGeometry } from '@/lib/pdim';
import { arcPoints as arcCurvePoints, ellipsePoints, sampleCurve, splinePoints } from '@/lib/dxf-curves';
import { PAPER_DIMENSION_STYLE, arrowHead } from '@/lib/annotation';
import { wallHatchShape, wallsGeometry } from '@/lib/wall';
import { openingGeometry } from '@/lib/opening';
import { areaM2, centroid, formatM2, roomPolygons } from '@/lib/rooms';
import { hatchAngles, hatchParamsOf } from '@/lib/hatch';
import { DEFAULT_LINE_TYPE, DEFAULT_LINE_WEIGHT, LINE_TYPES, dxfLineWeight, lineTypeDef, lineTypeFromDxf } from '@/lib/linestyle';
import { occurrencePrimitives } from '@/lib/materials';
import { annotationGeometry, isAnnotation } from '@/lib/bom';
import { linkedViews } from '@/lib/views';
import { cutView } from '@/lib/cuts';

/** Écart maximal entre un arc et la polyligne qui l'approche, en millimètres. */
export const ARC_TOLERANCE_MM = 0.05;

export type DxfUnitKey = 'in' | 'ft' | 'mi' | 'mm' | 'cm' | 'm' | 'km' | 'mil' | 'yd' | 'um' | 'dm';

interface UnitDef { key: DxfUnitKey; code: number; label: string; toMm: number }

/** Codes $INSUNITS (référence DXF Autodesk) pris en charge, avec leur facteur vers le millimètre. */
export const DXF_UNITS: readonly UnitDef[] = [
  { key: 'in', code: 1, label: 'pouce', toMm: 25.4 },
  { key: 'ft', code: 2, label: 'pied', toMm: 304.8 },
  { key: 'mi', code: 3, label: 'mile', toMm: 1609344 },
  { key: 'mm', code: 4, label: 'millimètre', toMm: 1 },
  { key: 'cm', code: 5, label: 'centimètre', toMm: 10 },
  { key: 'm', code: 6, label: 'mètre', toMm: 1000 },
  { key: 'km', code: 7, label: 'kilomètre', toMm: 1000000 },
  { key: 'mil', code: 9, label: 'mil (millième de pouce)', toMm: 0.0254 },
  { key: 'yd', code: 10, label: 'yard', toMm: 914.4 },
  { key: 'um', code: 13, label: 'micromètre', toMm: 0.001 },
  { key: 'dm', code: 14, label: 'décimètre', toMm: 100 },
];

export function dxfUnitByKey(key: string): UnitDef | undefined {
  const clean = key.trim().toLowerCase().replace('µm', 'um');
  return DXF_UNITS.find(u => u.key === clean);
}

export interface DxfImportOptions {
  objectStart: number;
  layerStart: number;
  createdSeq: number;
  existingLayers: Layer[];
  /** Unité à appliquer quand le fichier n'en déclare pas (ou pour forcer une unité). */
  sourceUnit?: DxfUnitKey;
  /** Dernier numéro de bloc (BLQ-) déjà utilisé dans le projet. */
  blockStart?: number;
}

/** Bilan d'un échange : ce qui passe tel quel, ce qui est transformé, ce qui est perdu. */
export interface ExchangeReport {
  kept: string[];
  transformed: string[];
  lost: string[];
}

export interface DxfImportResult {
  objects: CadObject[];
  layers: Layer[];
  /** Blocs conservés (occurrences simples de blocs de primitives). */
  blocks: BlockDef[];
  warnings: string[];
  report: ExchangeReport;
  /** Unité effectivement appliquée et origine de cette unité. */
  unit: { key: DxfUnitKey; label: string; toMm: number; source: 'fichier' | 'choix' | 'défaut' };
  /** Vrai si le fichier ne déclare aucune unité exploitable : l'appelant doit faire choisir l'unité. */
  unitMissing: boolean;
}

export interface DxfExportResult {
  content: string;
  report: ExchangeReport;
}

interface Pair { code: number; value: string }

const DEFAULT_LAYER_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185'];
const SUPPORTED = new Set(['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'TEXT', 'MTEXT', 'INSERT', 'DIMENSION', 'HATCH', 'SPLINE', 'ELLIPSE']);
const EPS = 1e-9;

// ─── Export ────────────────────────────────────────────────────────────────

export function exportToDxf(objects: CadObject[], layers: Layer[], blocks: BlockDef[]): string {
  return exportDxf(objects, layers, blocks).content;
}

export interface DxfExportOptions {
  /** Échelle réel / papier pour convertir les pas de hachure papier (1 par défaut, soit 1:1). */
  hatchPaperScale?: number;
}

export function exportDxf(objects: CadObject[], layers: Layer[], blocks: BlockDef[], options: DxfExportOptions = {}): DxfExportResult {
  const hatchScale = options.hatchPaperScale && options.hatchPaperScale > 0 ? options.hatchPaperScale : 1;
  let paperHatches = 0;
  const rooms = roomPolygons(objects);
  const walls = wallsGeometry(objects.filter((o): o is WallObj => o.kind === 'wall'), objects.filter((o): o is OpeningObj => o.kind === 'opening'));
  const out: string[] = [];
  const push = (code: number, value: string | number) => out.push(String(code), typeof value === 'string' ? encodeDxfString(value) : String(value));
  let handle = 0x20;
  const nextHandle = () => (handle++).toString(16).toUpperCase();
  const counts = { elevation: 0, projection: 0, solid: 0, structure: 0, roof: 0, slab: 0, room: 0, symbol: 0, views: 0, cut: 0, bom: 0, underlay: 0, note: 0, opening: 0, wall: 0, pdim: 0, line: 0, circle: 0, arc: 0, polyline: 0, ellipse: 0, spline: 0, rect: 0, hatch: 0, dimension: 0, blockRef: 0, dimensionSkipped: 0, blockSkipped: 0, text: 0, mtext: 0 };

  const layerNames = new Map<string, string>();
  const usedNames = new Set<string>();
  for (const layer of layers) {
    let name = dxfLayerName(layer.name);
    let suffix = 2;
    while (usedNames.has(name.toUpperCase())) name = `${dxfLayerName(layer.name)}_${suffix++}`;
    usedNames.add(name.toUpperCase());
    layerNames.set(layer.id, name);
  }

  // En-tête : version R2000, unités et mesure métrique.
  push(0, 'SECTION'); push(2, 'HEADER');
  push(9, '$ACADVER'); push(1, 'AC1015');
  push(9, '$DWGCODEPAGE'); push(3, 'ANSI_1252');
  push(9, '$INSUNITS'); push(70, 4); // millimètres
  push(9, '$MEASUREMENT'); push(70, 1); // métrique
  push(0, 'ENDSEC');

  // Tables : types de ligne et calques.
  push(0, 'SECTION'); push(2, 'TABLES');
  // Types de ligne ISO 128-2 (bibliothèque ISO d'AutoCAD, motifs pour une plume de 1 mm).
  push(0, 'TABLE'); push(2, 'LTYPE'); push(5, nextHandle()); push(100, 'AcDbSymbolTable'); push(70, LINE_TYPES.length);
  for (const def of LINE_TYPES) {
    push(0, 'LTYPE'); push(5, nextHandle()); push(100, 'AcDbSymbolTableRecord'); push(100, 'AcDbLinetypeTableRecord');
    push(2, def.dxf); push(70, 0); push(3, def.pattern.length ? `ISO 128-2 type ${def.iso} — ${def.label}` : 'Solid line');
    push(72, 65); push(73, def.pattern.length); push(40, n(def.pattern.reduce((a, v) => a + Math.abs(v), 0)));
    for (const v of def.pattern) { push(49, n(v)); push(74, 0); }
  }
  push(0, 'ENDTAB');
  push(0, 'TABLE'); push(2, 'LAYER'); push(5, nextHandle()); push(100, 'AcDbSymbolTable'); push(70, layers.length);
  for (const layer of layers) {
    push(0, 'LAYER'); push(5, nextHandle()); push(100, 'AcDbSymbolTableRecord'); push(100, 'AcDbLayerTableRecord');
    push(2, layerNames.get(layer.id) ?? '0');
    push(70, layer.locked ? 4 : 0);
    push(62, layer.visible ? 7 : -7);
    push(420, hexToTrueColor(layer.color));
    push(6, lineTypeDef(layer.lineType ?? DEFAULT_LINE_TYPE).dxf);
    push(370, dxfLineWeight(layer.lineWeight ?? DEFAULT_LINE_WEIGHT));
  }
  push(0, 'ENDTAB'); push(0, 'ENDSEC');

  push(0, 'SECTION'); push(2, 'ENTITIES');
  // Propriétés de trait de l'objet en cours d'écriture ; absentes = BYLAYER (rien n'est écrit).
  let style: Pick<CadObject, 'color' | 'lineType' | 'lineWeight'> = {};
  let styled = 0;
  const entityHeader = (type: string, layer: string, subclass: string) => {
    push(0, type); push(5, nextHandle()); push(100, 'AcDbEntity'); push(8, layer);
    if (style.lineType !== undefined) push(6, lineTypeDef(style.lineType).dxf);
    if (style.color !== undefined) push(420, hexToTrueColor(style.color));
    if (style.lineWeight !== undefined) push(370, dxfLineWeight(style.lineWeight));
    push(100, subclass);
  };
  const writeOne = (object: PrimitiveObject, layer: string, inBlock = false) => {
    // Primitive engendrée par un objet (identifiant « OBJ-…#n » : solide, vue, poteau, toiture) : son
    // propre type de trait (partie cachée en interrompu) est écrit sur l'entité, pas celui de l'objet.
    if (object.id.includes('#')) style = { color: object.color, lineType: object.lineType, lineWeight: object.lineWeight };
    writePrimitive(entityHeader, push, object, layer);
    if (object.kind === 'rect') counts.rect++;
    else counts[object.kind]++;
    // Îlots : contours du dessin désignés par l'objet (pas pour les primitives d'un bloc).
    const islands = inBlock ? [] : ((object as CadObject).holes ?? []).map(id => objects.find(o => o.id === id)).filter((o): o is CadObject => !!o);
    if (object.hatch && object.hatch !== 'none' && writeHatch(entityHeader, push, object, layer, islands, hatchScale)) {
      counts.hatch++;
      if (object.hatch !== 'solid' && hatchParamsOf(object).unit === 'papier') paperHatches++;
    }
  };

  for (const object of objects) {
    const layer = layerNames.get(object.layerId) ?? '0';
    style = { color: object.color, lineType: object.lineType, lineWeight: object.lineWeight };
    if (style.color !== undefined || style.lineType !== undefined || style.lineWeight !== undefined) styled++;
    if (object.kind === 'blockRef') {
      const block = blocks.find(b => b.id === object.blockId);
      if (!block) { counts.blockSkipped++; continue; }
      counts.blockRef++;
      for (const primitive of occurrencePrimitives(block, object)) writeOne(transformPrimitive(primitive, object.x, object.y, object.scale), layer, true);
      continue;
    }
    if (object.kind === 'dimension') {
      const target = objects.find(o => o.id === object.targetId);
      const geometry = target ? dimensionGeometry(object, target) : null;
      if (!geometry) { counts.dimensionSkipped++; continue; }
      counts.dimension++;
      for (const [x1, y1, x2, y2] of [[geometry.x1, geometry.y1, geometry.x2, geometry.y2], ...geometry.ext]) {
        entityHeader('LINE', layer, 'AcDbLine');
        push(10, n(x1)); push(20, n(-y1)); push(30, 0);
        push(11, n(x2)); push(21, n(-y2)); push(31, 0);
      }
      entityHeader('TEXT', layer, 'AcDbText');
      push(10, n(geometry.tx)); push(20, n(-geometry.ty)); push(30, 0); push(40, 10);
      push(1, dimensionText(object, objects));
      push(100, 'AcDbText');
      continue;
    }
    if (object.kind === 'text') {
      if (writeText(entityHeader, push, object, layer)) counts.mtext++;
      else counts.text++;
      continue;
    }
    if (object.kind === 'pdim') {
      // Cote par points : traits, arcs et textes (comme les cotes associatives, sans entité DIMENSION).
      const g = pdimGeometry(object);
      if (!g) { counts.dimensionSkipped++; continue; }
      counts.pdim++;
      for (const [x1, y1, x2, y2] of [...g.lines, ...g.ext]) {
        entityHeader('LINE', layer, 'AcDbLine');
        push(10, n(x1)); push(20, n(-y1)); push(30, 0);
        push(11, n(x2)); push(21, n(-y2)); push(31, 0);
      }
      for (const a of g.arcs) {
        writePrimitive(entityHeader, push, { ...object, kind: 'arc', cx: a.cx, cy: a.cy, r: a.r, start: a.start, end: a.start + a.sweep } as PrimitiveObject, layer);
      }
      // Flèches (SOLID), origine des cotes cumulées (CIRCLE) et triangle des cotes de niveau (LINE),
      // dans le rapport du style papier à la hauteur du texte de cote (10 mm dans le modèle).
      const S = PAPER_DIMENSION_STYLE, k = 10 / S.textHeight;
      const len = S.arrowLength * k, half = S.arrowHalfWidth * k;
      for (const a of g.arrows) {
        const [p, q, r] = arrowHead(a.tip, a.from, len, half);
        entityHeader('SOLID', layer, 'AcDbTrace');
        [p, q, r, r].forEach((v, i) => { push(10 + i, n(v.x)); push(20 + i, n(-v.y)); push(30 + i, 0); });
      }
      for (const o of g.origins) writePrimitive(entityHeader, push, { ...object, kind: 'circle', cx: o.x, cy: o.y, r: len / 3 } as unknown as PrimitiveObject, layer);
      for (const m of g.levelMarks) {
        const tri = [m, { x: m.x - len * 0.6, y: m.y - len }, { x: m.x + len * 0.6, y: m.y - len }];
        tri.forEach((a, i) => {
          const b = tri[(i + 1) % 3];
          entityHeader('LINE', layer, 'AcDbLine');
          push(10, n(a.x)); push(20, n(-a.y)); push(30, 0);
          push(11, n(b.x)); push(21, n(-b.y)); push(31, 0);
        });
      }
      for (const t of g.texts) {
        entityHeader('TEXT', layer, 'AcDbText');
        push(10, n(t.at.x + t.normal.x * 5)); push(20, n(-(t.at.y + t.normal.y * 5))); push(30, 0); push(40, 10);
        push(1, t.value);
        push(100, 'AcDbText');
      }
      continue;
    }
    if (object.kind === 'note') { counts.note++; continue; } // note de terrain : ni dessinée ni exportée
    if (object.kind === 'underlay') {
      // Fond de plan : image de référence, non exportée (le DXF ne référencerait qu'un fichier externe).
      counts.underlay++;
      continue;
    }
    if (object.kind === 'cut') {
      // Vue en coupe : contours des surfaces coupées (LINE), hachures HATCH à 45° au pas papier de 3 mm
      // converti à l'échelle, désignation « A–A » (TEXT de 5 mm papier).
      const c = cutView(object, objects.find(o => o.id === object.sourceId), objects.find(o => o.id === object.markId), objects, 0, 5 * hatchScale);
      if (!c.ok) continue;
      counts.cut++;
      const own = style;
      // Comme à l'écran et en PDF : contours coupés en trait continu fort 0,5 mm, hachures fines 0,18 mm.
      style = { ...own, lineType: 'continu', lineWeight: 0.5 };
      for (const [x1, y1, x2, y2] of c.value.visible) {
        entityHeader('LINE', layer, 'AcDbLine');
        push(10, n(x1)); push(20, n(-y1)); push(30, 0);
        push(11, n(x2)); push(21, n(-y2)); push(31, 0);
      }
      style = { ...own, lineType: 'continu', lineWeight: 0.18 };
      for (const r of c.value.material) {
        const pseudo = { ...object, kind: 'polyline', hatch: 'diagonal', hatchParams: undefined, points: [r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h, r.x, r.y] } as unknown as PrimitiveObject;
        if (writeHatch(entityHeader, push, pseudo, layer, [], hatchScale)) counts.hatch++;
      }
      style = own;
      const t = c.value.label;
      entityHeader('TEXT', layer, 'AcDbText');
      push(10, n(t.x)); push(20, n(-t.y)); push(30, 0); push(40, n(5 * hatchScale));
      push(1, t.text);
      push(72, 1); push(11, n(t.x)); push(21, n(-t.y)); push(31, 0);
      push(100, 'AcDbText');
      continue;
    }
    if (object.kind === 'views') {
      // Vues liées : arêtes vues (trait continu 0,5 mm), cachées (interrompu 0,25 mm), axes (mixte 0,18 mm).
      const views = linkedViews(object, objects.find(o => o.id === object.sourceId), objects);
      if (!views) continue;
      counts.views++;
      const own = style;
      const write = (segs: [number, number, number, number][], st: typeof style) => {
        style = st;
        for (const [x1, y1, x2, y2] of segs) {
          entityHeader('LINE', layer, 'AcDbLine');
          push(10, n(x1)); push(20, n(-y1)); push(30, 0);
          push(11, n(x2)); push(21, n(-y2)); push(31, 0);
        }
      };
      for (const v of views) {
        // Comme à l'écran et en PDF : arêtes vues en trait continu fort 0,5 mm, quel que soit le style propre.
        write(v.visible, { ...own, lineType: 'continu', lineWeight: 0.5 });
        write(v.hidden, { ...own, lineType: 'interrompu', lineWeight: 0.25 });
        write(v.axes, { ...own, lineType: 'mixte', lineWeight: 0.18 });
      }
      style = own;
      continue;
    }
    if (isAnnotation(object)) {
      // Symbole, nomenclature ou repère : taille papier convertie à l'échelle de la feuille ; traits,
      // cercles, surfaces pleines (SOLID) et textes.
      const g = annotationGeometry(object, hatchScale, objects, blocks);
      if (!g) continue;
      if (object.kind === 'bom' || object.kind === 'balloon') counts.bom++; else counts.symbol++;
      const own = style;
      for (const l of g.lines) {
        // Comme à l'écran et en PDF : trait fort 0,7 mm ou fin 0,25 mm ; trace de coupe en trait mixte.
        style = { ...own, lineWeight: l.weight === 'fort' ? 0.7 : 0.25, lineType: l.dash ? 'mixte' : 'continu' };
        entityHeader('LINE', layer, 'AcDbLine');
        push(10, n(l.a.x)); push(20, n(-l.a.y)); push(30, 0);
        push(11, n(l.b.x)); push(21, n(-l.b.y)); push(31, 0);
      }
      style = own;
      for (const c of g.circles) writePrimitive(entityHeader, push, { ...object, kind: 'circle', cx: c.c.x, cy: c.c.y, r: c.r } as unknown as PrimitiveObject, layer);
      for (const f of g.fills) {
        // SOLID : sommets dans l'ordre 1, 2, 4, 3 (un triangle répète son dernier sommet) ; un polygone
        // de plus de quatre sommets (point de repère) est découpé en triangles en éventail.
        const quads = f.length === 4 ? [[f[0], f[1], f[3], f[2]]] : f.slice(1, -1).map((p, i) => [f[0], p, f[i + 2], f[i + 2]]);
        for (const q of quads) {
          entityHeader('SOLID', layer, 'AcDbTrace');
          q.forEach((p, i) => { push(10 + i, n(p.x)); push(20 + i, n(-p.y)); push(30 + i, 0); });
        }
      }
      for (const t of g.texts) {
        entityHeader('TEXT', layer, 'AcDbText');
        push(10, n(t.at.x)); push(20, n(-t.at.y)); push(30, 0); push(40, n(t.height));
        push(1, t.text);
        if (t.anchor === 'middle') { push(72, 1); push(11, n(t.at.x)); push(21, n(-t.at.y)); push(31, 0); }
        push(100, 'AcDbText');
      }
      continue;
    }
    if (object.kind === 'room') {
      // Pièce : contour fermé (LWPOLYLINE) et étiquette nom + surface (TEXT).
      const poly = rooms.get(object.id);
      if (!poly) continue;
      counts.room++;
      writePrimitive(entityHeader, push, { ...object, kind: 'polyline', points: [...poly.flatMap(p => [p.x, p.y]), poly[0].x, poly[0].y] } as unknown as PrimitiveObject, layer);
      const c = centroid(poly);
      for (const [text, dy] of [[object.name, 0], [formatM2(areaM2(poly)), 300]] as const) {
        entityHeader('TEXT', layer, 'AcDbText');
        push(10, n(c.x)); push(20, n(-(c.y + dy))); push(30, 0); push(40, 200);
        push(1, text);
        push(72, 1); push(11, n(c.x)); push(21, n(-(c.y + dy))); push(31, 0);
        push(100, 'AcDbText');
      }
      continue;
    }
    if (object.kind === 'opening') {
      // Ouverture : vantail (LINE), débattement (ARC), appuis et vitrage (LINE) ; les tableaux sont avec le mur.
      const host = objects.find(o => o.id === object.hostId);
      const g = host?.kind === 'wall' ? openingGeometry(object, host) : null;
      if (!g) continue;
      counts.opening++;
      for (const [a, b] of [...(g.glazing ?? []), ...(g.leaf ? [g.leaf] : [])]) {
        entityHeader('LINE', layer, 'AcDbLine');
        push(10, n(a.x)); push(20, n(-a.y)); push(30, 0);
        push(11, n(b.x)); push(21, n(-b.y)); push(31, 0);
      }
      if (g.swing) {
        const ang = (p: { x: number; y: number }) => ((Math.atan2(-(p.y - g.swing!.cy), p.x - g.swing!.cx) * 180) / Math.PI + 360) % 360;
        let s = ang(g.swing.from), e = ang(g.swing.to);
        if ((e - s + 360) % 360 > 180) [s, e] = [e, s];
        writePrimitive(entityHeader, push, { ...object, kind: 'arc', cx: g.swing.cx, cy: g.swing.cy, r: g.swing.r, start: s, end: e } as unknown as PrimitiveObject, layer);
      }
      continue;
    }
    if (object.kind === 'wall') {
      // Mur : traits visibles (jonctions nettoyées) en LINE, hachure éventuelle sur son contour.
      const g = walls.get(object.id);
      if (!g) continue;
      counts.wall++;
      for (const [a, b] of g.edges) {
        entityHeader('LINE', layer, 'AcDbLine');
        push(10, n(a.x)); push(20, n(-a.y)); push(30, 0);
        push(11, n(b.x)); push(21, n(-b.y)); push(31, 0);
      }
      const { outline: pseudo, islands } = wallHatchShape(object, g.quad, g.bays);
      if (pseudo.hatch && pseudo.hatch !== 'none' && writeHatch(entityHeader, push, pseudo, layer, islands, hatchScale)) counts.hatch++;
      continue;
    }
    // Toiture (lot 13.2) : rive en LWPOLYLINE fermée, faîtage, arêtiers et flèches en LINE.
    if (object.kind === 'roof') { counts.roof++; for (const p of roofPrimitives(object, roofInput(object))) writeOne(p, layer); continue; }
    // Poteau : LWPOLYLINE fermée ou CIRCLE ; poutre : LINE en trait interrompu (lot 13.4).
    if (object.kind === 'column' || object.kind === 'beam') {
      counts.structure++;
      // Le type de trait engendré (poutre en interrompu) est écrit sur chaque entité.
      for (const p of structurePrimitives(object)) { style = { color: p.color, lineType: p.lineType, lineWeight: p.lineWeight }; writeOne(p, layer); }
      continue;
    }
    // Solide (lot 15.2) : sa trace en plan (LWPOLYLINE, CIRCLE ; parties retirées en interrompu).
    if (object.kind === 'solid' || object.kind === 'occurrence') { counts.solid++; const s = effectiveSolid(object, objects); for (const p of s ? solidPrimitives(s) : []) writeOne(p, layer); continue; }
    // Vue projetée (lot 16.1) : arêtes vues en LINE, cachées en LINE interrompue.
    if (object.kind === 'projection' || object.kind === 'elevation') { counts[object.kind]++; for (const p of viewPrimitives(object, objects)) writeOne(p, layer); continue; }
    if (object.kind === 'slab') counts.slab++;
    // Dalle (lot 13.1) : contour fermé en LWPOLYLINE.
    writeOne(object.kind === 'slab' ? slabAsPolyline(object) as PrimitiveObject : object, layer);
  }
  push(0, 'ENDSEC'); push(0, 'EOF');

  const report: ExchangeReport = { kept: [], transformed: [], lost: [] };
  report.kept.push('Unité : millimètre ($INSUNITS = 4), coordonnées à 10⁻⁶ mm près.');
  report.kept.push(`Calques : ${layers.length} (nom, couleur, type et épaisseur de trait, visibilité, verrouillage).`);
  report.kept.push('Types de trait ISO 128-2 : continu (CONTINUOUS), interrompu (ACAD_ISO02W100), mixte (ACAD_ISO04W100), mixte double (ACAD_ISO05W100) ; épaisseurs en centièmes de mm (groupe 370).');
  if (styled) report.kept.push(`Objets à trait propre : ${styled} (couleur, type ou épaisseur écrits sur l'entité ; sinon « du calque »).`);
  if (counts.line) report.kept.push(`Lignes : ${counts.line} (LINE).`);
  if (counts.circle) report.kept.push(`Cercles : ${counts.circle} (CIRCLE).`);
  if (counts.arc) report.kept.push(`Arcs : ${counts.arc} (ARC natif).`);
  if (counts.polyline) report.kept.push(`Polylignes : ${counts.polyline} (LWPOLYLINE).`);
  if (counts.ellipse) report.kept.push(`Ellipses : ${counts.ellipse} (ELLIPSE natif).`);
  if (counts.spline) report.kept.push(`Splines : ${counts.spline} (SPLINE natif : degré, nœuds, poids, points de contrôle).`);
  if (counts.text) report.kept.push(`Textes sur une ligne : ${counts.text} (TEXT : contenu, hauteur, rotation, alignement).`);
  if (counts.mtext) report.kept.push(`Textes sur plusieurs lignes : ${counts.mtext} (MTEXT).`);
  if (counts.hatch) report.kept.push(`Hachures : ${counts.hatch} (HATCH : aplat SOLID ou motif défini par l'utilisateur à l'angle, au pas et à l'origine de l'objet ; îlots en boucles intérieures).`);
  if (paperHatches) report.transformed.push(`Hachures à pas papier : ${paperHatches} → pas réel à l'échelle 1:${Math.round(hatchScale * 1000) / 1000} (le DXF ne connaît que le modèle).`);
  if (counts.rect) report.transformed.push(`Rectangles : ${counts.rect} → polylignes fermées (LWPOLYLINE).`);
  if (counts.blockRef) report.transformed.push(`Occurrences de blocs : ${counts.blockRef} → éclatées en entités simples (la définition partagée n'est pas exportée).`);
  if (counts.cut) report.transformed.push(`Vues en coupe : ${counts.cut} → contours (LINE), hachures (HATCH) et désignation (TEXT) ; le lien à la face et au repère est perdu.`);
  if (counts.views) report.transformed.push(`Vues liées : ${counts.views} → traits (LINE) vus, cachés (ACAD_ISO02W100) et axes (ACAD_ISO04W100) ; le lien à la vue de face est perdu.`);
  if (counts.bom) report.transformed.push(`Nomenclature, tableaux et repères : ${counts.bom} → traits, cercles et textes figés ; les numéros, quantités et totaux ne sont plus recalculés.`);
  if (counts.symbol) report.transformed.push(`Symboles (nord, repères de coupe, cotes de niveau, états de surface) : ${counts.symbol} → traits, cercles, surfaces pleines (SOLID) et textes, à la taille papier de l'échelle 1:${Math.round(hatchScale * 1000) / 1000}.`);
  if (counts.room) report.transformed.push(`Pièces : ${counts.room} → contour (LWPOLYLINE) et étiquette nom + surface (TEXT) ; la surface n'est plus recalculée.`);
  if (counts.opening) report.transformed.push(`Ouvertures : ${counts.opening} → traits et arcs (baies coupées dans les murs) ; le lien au mur est perdu.`);
  if (counts.elevation) report.transformed.push(`Façades et coupes : ${counts.elevation} → arêtes vues (LINE) ; elles ne sont plus recalculées depuis le modèle.`);
  if (counts.projection) report.transformed.push(`Vues projetées : ${counts.projection} → arêtes (LINE, cachées en interrompu) ; le lien au solide est perdu, la vue n'est plus recalculée.`);
  if (counts.solid) report.transformed.push(`Solides : ${counts.solid} → trace en plan (LWPOLYLINE, CIRCLE ; parties retirées en interrompu) ; le volume et la recette sont perdus.`);
  if (counts.structure) report.transformed.push(`Poteaux et poutres : ${counts.structure} → sections (LWPOLYLINE, CIRCLE) et nus (LINE interrompue) ; sections et hauteurs ne sont plus éditables comme éléments de structure.`);
  if (counts.roof) report.transformed.push(`Toitures : ${counts.roof} → rive (LWPOLYLINE), faîtage, arêtiers et flèches (LINE) ; type, pente, débord et axe ne sont plus éditables comme toiture.`);
  if (counts.slab) report.transformed.push(`Dalles : ${counts.slab} → contour (LWPOLYLINE fermée) ; l'épaisseur et le lien à la pièce sont perdus.`);
  if (counts.wall) report.transformed.push(`Murs : ${counts.wall} → traits (LINE, jonctions nettoyées) et hachures ; épaisseur et justification ne sont plus éditables comme mur.`);
  if (counts.pdim) report.transformed.push(`Cotes par points (série, cumulées, angulaires, niveaux) : ${counts.pdim} → traits, arcs et textes ; la mesure n'est plus recalculée.`);
  if (counts.dimension) report.transformed.push(`Cotes : ${counts.dimension} → traits + texte (LINE + TEXT) ; l'association à l'objet coté est perdue.`);
  report.lost.push('Identifiants OBJ-, classification métier, noms d\'objets et historique des versions (non représentables en DXF).');
  if (counts.underlay) report.lost.push(`Fonds de plan : ${counts.underlay} (images de référence, non exportées).`);
  if (counts.note) report.lost.push(`Notes de terrain : ${counts.note} (textes et photos du relevé, non exportés ; conservés dans le paquet du projet).`);
  if (counts.dimensionSkipped) report.lost.push(`Cotes sans géométrie calculable : ${counts.dimensionSkipped} (non exportées).`);
  if (counts.blockSkipped) report.lost.push(`Occurrences de blocs orphelines : ${counts.blockSkipped} (non exportées).`);

  return { content: `${out.join('\n')}\n`, report };
}

type EntityHeader = (type: string, layer: string, subclass: string) => void;
type Push = (code: number, value: string | number) => void;

function primitivePoints(object: PrimitiveObject): { points: number[]; closed: boolean } | null {
  if (object.kind === 'rect') {
    return { points: [object.x, object.y, object.x + object.w, object.y, object.x + object.w, object.y + object.h, object.x, object.y + object.h], closed: true };
  }
  if (object.kind === 'polyline') {
    const p = object.points;
    const closed = p.length >= 6 && samePoint(p[0], p[1], p[p.length - 2], p[p.length - 1]);
    return { points: closed ? p.slice(0, -2) : p, closed };
  }
  return null;
}

const ALIGN_CODE: Record<TextAlign, number> = { left: 0, center: 1, right: 2 };

/**
 * Texte : une ligne → TEXT (point d'insertion = ligne de base) ; plusieurs lignes → MTEXT
 * (point d'attache en haut, direction donnée par un vecteur pour éviter toute ambiguïté
 * d'unité d'angle). Renvoie vrai si un MTEXT a été écrit.
 */
function writeText(header: EntityHeader, push: Push, t: TextObj, layer: string): boolean {
  const lines = textLines(t.content);
  const rad = (t.rotation * Math.PI) / 180;
  if (lines.length === 1) {
    header('TEXT', layer, 'AcDbText');
    push(10, n(t.x)); push(20, n(-t.y)); push(30, 0);
    push(40, n(t.height));
    push(1, lines[0]);
    if (t.rotation) push(50, n(t.rotation));
    const code = ALIGN_CODE[t.align];
    if (code) push(72, code);
    if (code) { push(11, n(t.x)); push(21, n(-t.y)); push(31, 0); }
    push(100, 'AcDbText');
    return false;
  }
  // Coin haut du bloc de texte : ligne de base + hauteur, dans la direction perpendiculaire.
  const topX = t.x - Math.sin(rad) * t.height;
  const topY = -t.y + Math.cos(rad) * t.height;
  header('MTEXT', layer, 'AcDbMText');
  push(10, n(topX)); push(20, n(topY)); push(30, 0);
  push(40, n(t.height));
  push(71, ALIGN_CODE[t.align] + 1);
  push(72, 1);
  // Le contenu est découpé en morceaux de 250 caractères (codes 3 puis 1).
  const value = lines.map(escapeMText).join('\\P');
  for (let i = 0; i + 250 < value.length; i += 250) push(3, value.slice(i, i + 250));
  push(1, value.slice(Math.floor((value.length - 1) / 250) * 250));
  push(11, n(Math.cos(rad))); push(21, n(Math.sin(rad))); push(31, 0);
  return true;
}

function escapeMText(line: string): string {
  return line.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function writePrimitive(header: EntityHeader, push: Push, object: PrimitiveObject, layer: string): void {
  if (object.kind === 'line') {
    header('LINE', layer, 'AcDbLine');
    push(10, n(object.x1)); push(20, n(-object.y1)); push(30, 0);
    push(11, n(object.x2)); push(21, n(-object.y2)); push(31, 0);
    return;
  }
  if (object.kind === 'circle') {
    header('CIRCLE', layer, 'AcDbCircle');
    push(10, n(object.cx)); push(20, n(-object.cy)); push(30, 0); push(40, n(object.r));
    return;
  }
  if (object.kind === 'arc') {
    header('ARC', layer, 'AcDbCircle');
    push(10, n(object.cx)); push(20, n(-object.cy)); push(30, 0); push(40, n(object.r));
    push(100, 'AcDbArc');
    push(50, n(norm360(object.start))); push(51, n(norm360(object.end)));
    return;
  }
  if (object.kind === 'spline') {
    // SPLINE natif : degré, nœuds, poids (si rationnelle), points de contrôle ; aucun point d'ajustement.
    const count = object.points.length / 2;
    const knots = knotsOf(object);
    const rational = !!object.weights && object.weights.some(w => Math.abs(w - 1) > 1e-12);
    header('SPLINE', layer, 'AcDbSpline');
    push(210, 0); push(220, 0); push(230, 1);
    push(70, 8 | (rational ? 4 : 0) | (object.closed ? 1 : 0));
    push(71, object.degree); push(72, knots.length); push(73, count); push(74, 0);
    push(42, '0.0000000001'); push(43, '0.0000000001');
    for (const k of knots) push(40, nf(k));
    if (rational) for (const w of object.weights!) push(41, nf(w));
    for (let i = 0; i + 1 < object.points.length; i += 2) { push(10, n(object.points[i])); push(20, n(-object.points[i + 1])); push(30, 0); }
    return;
  }
  if (object.kind === 'ellipse') {
    // ELLIPSE natif : grand axe (relatif au centre), rapport petit / grand axe, paramètres en radians.
    const major = object.rx >= object.ry;
    const dir = ((object.rotation + (major ? 0 : 90)) * Math.PI) / 180, R = major ? object.rx : object.ry;
    const shift = major ? 0 : -90;
    const full = object.start === undefined || object.end === undefined;
    let p0 = full ? 0 : ((object.start! + shift) * Math.PI) / 180;
    let p1 = full ? 2 * Math.PI : ((object.end! + shift) * Math.PI) / 180;
    p0 = ((p0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    p1 = full ? p0 + 2 * Math.PI : ((p1 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    header('ELLIPSE', layer, 'AcDbEllipse');
    push(10, n(object.cx)); push(20, n(-object.cy)); push(30, 0);
    push(11, n(R * Math.cos(dir))); push(21, n(R * Math.sin(dir))); push(31, 0);
    push(40, nf(Math.min(object.rx, object.ry) / R)); push(41, nf(p0)); push(42, nf(p1));
    return;
  }
  const poly = primitivePoints(object);
  if (!poly) return;
  header('LWPOLYLINE', layer, 'AcDbPolyline');
  push(90, poly.points.length / 2); push(70, poly.closed ? 1 : 0);
  for (let i = 0; i + 1 < poly.points.length; i += 2) {
    push(10, n(poly.points[i])); push(20, n(-poly.points[i + 1]));
  }
}

/**
 * Hachure associée à un contour fermé. Le pas reproduit l'aperçu de l'atelier :
 * diagonales espacées de 8 mm, croisées espacées d'environ 7,07 mm.
 */
/** Boucle de contour HATCH : cercle par arête d'arc, autres contours par polyligne. */
function writeHatchLoop(push: Push, object: CadObject, external: boolean): boolean {
  if (object.kind === 'circle') {
    push(92, external ? 1 : 0); // arêtes
    push(93, 1);
    push(72, 2); // arc de cercle
    push(10, n(object.cx)); push(20, n(-object.cy)); push(40, n(object.r));
    push(50, 0); push(51, 360); push(73, 1);
    push(97, 0);
    return true;
  }
  const poly = object.kind === 'rect' || object.kind === 'polyline' ? primitivePoints(object) : null;
  if (!poly || !poly.closed) return false;
  push(92, external ? 3 : 2); // polyligne (+ contour externe)
  push(72, 0); push(73, 1); push(93, poly.points.length / 2);
  for (let i = 0; i + 1 < poly.points.length; i += 2) {
    push(10, n(poly.points[i])); push(20, n(-poly.points[i + 1]));
  }
  push(97, 0);
  return true;
}

/**
 * HATCH : aplat (SOLID) ou motif défini par l'utilisateur (_USER) à l'angle, au pas et à l'origine de
 * l'objet ; îlots en boucles intérieures (style pair-impair). Un pas papier est converti en pas réel
 * à l'échelle `paperScale` (réel / papier).
 */
function writeHatch(header: EntityHeader, push: Push, object: PrimitiveObject, layer: string, islands: CadObject[] = [], paperScale = 1): boolean {
  const style = object.hatch;
  if (!style || style === 'none') return false;
  const poly = primitivePoints(object);
  if (object.kind !== 'circle' && !(poly && poly.closed)) return false;
  const loops = islands.filter(i => i.kind === 'circle' || ((i.kind === 'rect' || i.kind === 'polyline') && primitivePoints(i)?.closed));

  const solid = style === 'solid';
  const hp = hatchParamsOf(object);
  const spacing = hp.unit === 'modele' ? hp.spacing : hp.spacing * paperScale;
  header('HATCH', layer, 'AcDbHatch');
  push(10, 0); push(20, 0); push(30, 0);
  push(210, 0); push(220, 0); push(230, 1);
  push(2, solid ? 'SOLID' : '_USER');
  push(70, solid ? 1 : 0);
  push(71, 0);
  push(91, 1 + loops.length);
  writeHatchLoop(push, object as CadObject, true);
  for (const island of loops) writeHatchLoop(push, island, false);
  push(75, 0); // style normal (pair-impair)
  push(76, solid ? 1 : 0); // 1 prédéfini (SOLID), 0 défini par l'utilisateur
  if (!solid) {
    const b = primitiveBounds(object);
    // Origine du motif : coin de l'emprise + décalage, en repère DXF (Y vers le haut).
    const ox = b.minX + (hp.originX ?? 0), oy = -(b.minY + (hp.originY ?? 0));
    push(52, n(hp.angle)); push(41, 1); push(77, style === 'cross' ? 1 : 0);
    const angles = hatchAngles(style, hp);
    push(78, angles.length);
    for (const angle of angles) {
      const rad = (angle * Math.PI) / 180;
      // Décalage perpendiculaire à la direction des traits, d'une longueur égale au pas.
      push(53, n(angle)); push(43, n(ox)); push(44, n(oy));
      push(45, n(-Math.sin(rad) * spacing)); push(46, n(Math.cos(rad) * spacing));
      push(79, 0);
    }
  }
  push(98, 0);
  return true;
}

function transformPrimitive(p: PrimitiveObject, x: number, y: number, scale: number): PrimitiveObject {
  switch (p.kind) {
    case 'line': return { ...p, x1: x + p.x1 * scale, y1: y + p.y1 * scale, x2: x + p.x2 * scale, y2: y + p.y2 * scale };
    case 'rect': return { ...p, x: x + p.x * scale, y: y + p.y * scale, w: p.w * scale, h: p.h * scale };
    case 'circle': return { ...p, cx: x + p.cx * scale, cy: y + p.cy * scale, r: p.r * scale };
    case 'arc': return { ...p, cx: x + p.cx * scale, cy: y + p.cy * scale, r: p.r * scale };
    case 'ellipse': return { ...p, cx: x + p.cx * scale, cy: y + p.cy * scale, rx: p.rx * scale, ry: p.ry * scale };
    case 'spline':
    case 'polyline': return { ...p, points: p.points.map((v, i) => (i % 2 === 0 ? x + v * scale : y + v * scale)) };
  }
}

// ─── Import ────────────────────────────────────────────────────────────────

export function parseDxf(text: string, options: DxfImportOptions): DxfImportResult {
  const pairs = toPairs(text);
  const warnings: string[] = [];
  const importedLayers = new Map<string, Partial<Layer>>();
  const entities: Entity[] = [];
  const blockDefs = new Map<string, { name: string; base: { x: number; y: number }; entities: Entity[] }>();
  const unsupported = new Map<string, number>();
  let declaredUnitCode: number | null = null;

  let section: string | null = null;
  let currentBlock: { name: string; base: { x: number; y: number }; entities: Entity[] } | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (section === 'HEADER' && pair.code === 9 && pair.value === '$INSUNITS') {
      const next = pairs[i + 1];
      if (next?.code === 70) declaredUnitCode = Number(next.value);
      continue;
    }
    if (pair.code !== 0) continue;
    if (pair.value === 'SECTION') {
      section = pairs[i + 1]?.code === 2 ? pairs[i + 1].value : null;
      continue;
    }
    if (pair.value === 'ENDSEC') {
      section = null;
      continue;
    }
    if (section === 'TABLES' && pair.value === 'LAYER') {
      const body = readBody(pairs, i + 1);
      const name = valueOf(body, 2);
      if (name) {
        const lt = lineTypeFromDxf(valueOf(body, 6));
        const lw = Number(valueOf(body, 370));
        importedLayers.set(normalizeLayerName(name), {
          name,
          color: colorFromBody(body),
          visible: true,
          locked: false,
          lineType: lt && lt !== 'bylayer' && lt !== DEFAULT_LINE_TYPE ? lt : undefined,
          lineWeight: Number.isFinite(lw) && lw > 0 ? lw / 100 : undefined,
        });
      }
      i += body.length;
      continue;
    }
    // Définitions de blocs : BLOCK (nom, point de base), entités, ENDBLK.
    if (section === 'BLOCKS' && (pair.value === 'BLOCK' || pair.value === 'ENDBLK')) {
      const body = readBody(pairs, i + 1);
      if (pair.value === 'BLOCK') {
        const name = valueOf(body, 2) ?? '';
        currentBlock = { name, base: { x: numberOf(body, 10, 0), y: numberOf(body, 20, 0) }, entities: [] };
        if (name) blockDefs.set(name, currentBlock);
      } else {
        currentBlock = null;
      }
      i += body.length;
      continue;
    }
    if ((section === 'ENTITIES' || (section === 'BLOCKS' && currentBlock)) && isEntityName(pair.value)) {
      const body = readBody(pairs, i + 1);
      const list = section === 'ENTITIES' ? entities : currentBlock!.entities;
      if (SUPPORTED.has(pair.value)) list.push({ type: pair.value, body });
      else if (section === 'ENTITIES') unsupported.set(pair.value, (unsupported.get(pair.value) ?? 0) + 1);
      i += body.length;
    }
  }

  // Unité : celle choisie par l'utilisateur, sinon celle du fichier, sinon le millimètre par défaut.
  const declared = declaredUnitCode !== null ? DXF_UNITS.find(u => u.code === declaredUnitCode) : undefined;
  const chosen = options.sourceUnit ? dxfUnitByKey(options.sourceUnit) : undefined;
  const unitDef = chosen ?? declared ?? DXF_UNITS.find(u => u.key === 'mm')!;
  const unitSource: DxfImportResult['unit']['source'] = chosen ? 'choix' : declared ? 'fichier' : 'défaut';
  const unitMissing = !declared;
  const k = unitDef.toMm;
  if (declaredUnitCode !== null && declaredUnitCode !== 0 && !declared) {
    warnings.push(`Unité DXF non prise en charge ($INSUNITS = ${declaredUnitCode}) : unité à préciser.`);
  }
  if (!declared && !chosen) {
    warnings.push('Le fichier ne déclare pas d\'unité : les coordonnées ont été lues en millimètres. Vérifiez les dimensions.');
  }

  const layers: Layer[] = [];
  const layerByName = new Map(options.existingLayers.map(l => [normalizeLayerName(l.name), l]));
  let layerCounter = options.layerStart;
  const ensureLayer = (name: string | undefined): Layer => {
    const clean = normalizeLayerName(name ?? '0');
    const existing = layerByName.get(clean);
    if (existing) return existing;
    const imported = importedLayers.get(clean);
    const layer: Layer = {
      id: `LAY-${String(++layerCounter).padStart(4, '0')}`,
      name: imported?.name ?? (name?.trim() || 'DXF'),
      color: imported?.color ?? DEFAULT_LAYER_COLORS[(layerCounter - 1) % DEFAULT_LAYER_COLORS.length],
      visible: true,
      locked: false,
      ...(imported?.lineType ? { lineType: imported.lineType } : {}),
      ...(imported?.lineWeight ? { lineWeight: imported.lineWeight } : {}),
    };
    layerByName.set(clean, layer);
    layers.push(layer);
    return layer;
  };

  const stats = {
    text: 0, line: 0, circle: 0, arc: 0, polyline: 0, bulgeSegments: 0, maxArcError: 0, mirrored: 0, outOfPlane: 0, widths: 0, degenerate: 0,
    blockKept: 0, blockExploded: 0, missingBlock: 0, minsert: 0, dimension: 0, hatch: 0, hatchApprox: 0, hatchIslands: 0,
    spline: 0, splineNative: 0, ellipse: 0, ellipseNative: 0, curveError: 0, curveFit: 0,
  };
  // Identifiants provisoires (les îlots de hachure y font référence), remplacés à la fin.
  let tempCounter = 0;
  const tempId = () => `tmp-${++tempCounter}`;
  const TEMP_NAME = '\u0000';
  const tolLocal = ARC_TOLERANCE_MM / k;

  /** Entités converties dans le repère du modèle (mm, Y vers le bas), calque hérité pour le calque 0 d'un bloc. */
  const convertList = (list: Entity[], depth: number, inherited: Layer | null): CadObject[] => list.flatMap(e => convert(e, depth, inherited));

  const convert = (entity: Entity, depth: number, inherited: Layer | null): CadObject[] => {
    const body = entity.body;
    // Vecteur d'extrusion : (0,0,1) par défaut ; (0,0,-1) = repère objet symétrique (X inversé).
    const ez = numberOf(body, 230, 1);
    const ex = numberOf(body, 210, 0);
    const ey = numberOf(body, 220, 0);
    const flatNormal = Math.abs(ex) < 1e-6 && Math.abs(ey) < 1e-6;
    if (entity.type !== 'LINE' && !flatNormal) { stats.outOfPlane++; return []; }
    const mirror = entity.type !== 'LINE' && ez < 0;
    if (mirror) stats.mirrored++;
    const sx = mirror ? -1 : 1;

    const layerName = valueOf(body, 8) ?? '0';
    const layer = inherited && normalizeLayerName(layerName) === '0' ? inherited : ensureLayer(layerName);
    // Propriétés de trait propres à l'entité (BYLAYER sinon).
    const ownStyle: Pick<CadObject, 'color' | 'lineType' | 'lineWeight'> = {};
    const lt = lineTypeFromDxf(valueOf(body, 6));
    if (lt && lt !== 'bylayer') ownStyle.lineType = lt;
    const lw = Number(valueOf(body, 370));
    if (Number.isFinite(lw) && lw > 0) ownStyle.lineWeight = lw / 100;
    const ownColor = colorFromBody(body);
    if (ownColor) ownStyle.color = ownColor;
    const base = (label: string) => ({
      id: tempId(),
      name: `${TEMP_NAME}${label}`,
      classification: 'non-classifie' as const,
      layerId: layer.id,
      hatch: 'none' as const,
      createdSeq: options.createdSeq,
      ...ownStyle,
    });
    /** Polyligne à partir de points du fichier (repère DXF), unité appliquée. */
    const polylineOf = (label: string, local: { x: number; y: number }[], closed: boolean): CadObject | null => {
      if (local.length < 2) return null;
      const pts = local.flatMap(p => [sx * p.x * k, p.y * k]);
      if (closed && !samePoint(pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1])) pts.push(pts[0], pts[1]);
      return { ...base(label), kind: 'polyline', points: flipY(pts) } as CadObject;
    };

    if (entity.type === 'INSERT' || entity.type === 'DIMENSION') {
      const name = valueOf(body, 2);
      const def = name ? blockDefs.get(name) : undefined;
      if (!def) { stats.missingBlock++; return []; }
      if (depth > 8) { stats.missingBlock++; return []; }
      const isDim = entity.type === 'DIMENSION';
      // Cote : son bloc anonyme est déjà placé dans le repère général (insertion à l'origine).
      const P = isDim ? { x: 0, y: 0 } : { x: sx * numberOf(body, 10, 0) * k, y: numberOf(body, 20, 0) * k };
      let scaleX = isDim ? 1 : numberOf(body, 41, 1);
      const scaleY = isDim ? 1 : numberOf(body, 42, 1);
      let rot = isDim ? 0 : numberOf(body, 50, 0);
      if (mirror) { scaleX = -scaleX; rot = -rot; }
      if (!isDim && (numberOf(body, 70, 1) > 1 || numberOf(body, 71, 1) > 1)) stats.minsert++;
      const local = convertList(def.entities, depth + 1, layer);
      const Bm = { x: def.base.x * k, y: -def.base.y * k };
      const Pm = { x: P.x, y: -P.y };
      if (isDim) {
        stats.dimension++;
        return local.map(o => affineObject(o, { a: 1, b: 0, c: 0, d: 1 }, Pm, Bm, ARC_TOLERANCE_MM));
      }
      // Occurrence simple (sans rotation, échelle uniforme positive) d'un bloc de primitives sans style
      // propre, toutes sur le calque de l'occurrence : bloc conservé (une occurrence DrawAll dessine ses
      // primitives avec son propre calque et son propre trait). Sinon, éclatée : rien n'est perdu.
      const simple = depth === 0 && Math.abs(rot % 360) < 1e-9 && scaleX > 0 && Math.abs(scaleX - scaleY) < 1e-9
        && local.length > 0 && local.every(o => (o.kind === 'line' || o.kind === 'circle' || o.kind === 'arc' || o.kind === 'ellipse' || o.kind === 'spline' || o.kind === 'polyline') && !o.holes
          && o.layerId === layer.id && o.color === undefined && o.lineType === undefined && o.lineWeight === undefined);
      if (simple) {
        let blockId = keptBlocks.get(def.name);
        if (!blockId) {
          blockId = `BLQ-${String(++blockCounter).padStart(4, '0')}`;
          keptBlocks.set(def.name, blockId);
          blocks.push({
            id: blockId, name: def.name, description: 'Importé du DXF',
            primitives: local.map((o, i) => ({ ...(affineObject(o, { a: 1, b: 0, c: 0, d: 1 }, { x: 0, y: 0 }, Bm, ARC_TOLERANCE_MM) as PrimitiveObject), id: `${blockId}-P${i + 1}`, name: `${def.name} — trait ${i + 1}`, createdSeq: 0 })),
          });
        }
        stats.blockKept++;
        return [{ ...base('Bloc'), name: `${def.name} — occurrence`, kind: 'blockRef', blockId, x: round(Pm.x), y: round(Pm.y), scale: scaleX } as CadObject];
      }
      // Sinon éclaté : rotation, échelle non uniforme ou symétrie appliquées à chaque objet (un bloc
      // imbriqué est compté avec l'occurrence qui le contient).
      if (depth === 0) stats.blockExploded++;
      const t = (rot * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
      const M = { a: cos * scaleX, b: sin * scaleY, c: -sin * scaleX, d: cos * scaleY };
      return local.map(o => affineObject(o, M, Pm, Bm, ARC_TOLERANCE_MM));
    }

    if (entity.type === 'LINE') {
      const x1 = numberOf(body, 10, 0) * k;
      const y1 = numberOf(body, 20, 0) * k;
      const x2 = numberOf(body, 11, x1 / k) * k;
      const y2 = numberOf(body, 21, y1 / k) * k;
      if (Math.hypot(x2 - x1, y2 - y1) <= EPS) { stats.degenerate++; return []; }
      stats.line++;
      return [{ ...base('Ligne'), kind: 'line', x1: round(x1), y1: round(-y1), x2: round(x2), y2: round(-y2) } as CadObject];
    }
    if (entity.type === 'CIRCLE') {
      const r = Math.abs(numberOf(body, 40, 0)) * k;
      if (r <= EPS) { stats.degenerate++; return []; }
      const cx = sx * numberOf(body, 10, 0) * k;
      const cy = numberOf(body, 20, 0) * k;
      stats.circle++;
      return [{ ...base('Cercle'), kind: 'circle', cx: round(cx), cy: round(-cy), r: round(r) } as CadObject];
    }
    if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      const t = parseTextEntity(entity.type, body, k, sx);
      if (!t) { stats.degenerate++; return []; }
      stats.text++;
      return [{ ...base('Texte'), name: t.content.split('\n')[0].slice(0, 40) || `${TEMP_NAME}Texte`, kind: 'text', ...t } as CadObject];
    }
    if (entity.type === 'ARC') {
      const r = Math.abs(numberOf(body, 40, 0)) * k;
      if (r <= EPS) { stats.degenerate++; return []; }
      const cx = sx * numberOf(body, 10, 0) * k;
      const cy = numberOf(body, 20, 0) * k;
      let start = numberOf(body, 50, 0);
      let end = numberOf(body, 51, 360);
      // Symétrie X : l'angle θ devient 180° − θ et le sens de parcours s'inverse.
      if (mirror) [start, end] = [180 - end, 180 - start];
      // Arc natif : aucune approximation (même centre, même rayon, mêmes angles).
      stats.arc++;
      return [{ ...base('Arc'), kind: 'arc', cx: round(cx), cy: round(-cy), r: round(r), start: norm360(start), end: norm360(end) } as CadObject];
    }
    if (entity.type === 'ELLIPSE') {
      const c = { x: numberOf(body, 10, 0), y: numberOf(body, 20, 0) };
      const major = { x: numberOf(body, 11, 0), y: numberOf(body, 21, 0) };
      const ratio = numberOf(body, 40, 1);
      const p0 = numberOf(body, 41, 0), p1 = numberOf(body, 42, 2 * Math.PI);
      const R = Math.hypot(major.x, major.y);
      if (R * k <= EPS || !(ratio > 0)) { stats.degenerate++; return []; }
      // Tour complet à 10⁻⁶ rad près (paramètres parfois écrits avec six décimales).
      const full = Math.abs(p1 - p0 - 2 * Math.PI) < 1e-6 || Math.abs(p1 - p0) < 1e-12;
      if (Math.abs(ratio - 1) < 1e-9) {
        // Ellipse circulaire : cercle ou arc exacts.
        const cx = sx * c.x * k, cy = c.y * k, r = R * k;
        stats.ellipse++;
        if (full) return [{ ...base('Cercle'), kind: 'circle', cx: round(cx), cy: round(-cy), r: round(r) } as CadObject];
        const rot = (Math.atan2(major.y, major.x) * 180) / Math.PI;
        let start = rot + (p0 * 180) / Math.PI, end = rot + (p1 * 180) / Math.PI;
        if (mirror) [start, end] = [180 - end, 180 - start];
        return [{ ...base('Arc'), kind: 'arc', cx: round(cx), cy: round(-cy), r: round(r), start: norm360(start), end: norm360(end) } as CadObject];
      }
      // ELLIPSE natif (lot 10.1) : aucune approximation. Le paramètre t devient −t en repère symétrique.
      let rotation = (Math.atan2(major.y, major.x) * 180) / Math.PI;
      let start = (p0 * 180) / Math.PI, end = (p1 * 180) / Math.PI;
      if (mirror) { rotation = 180 - rotation; [start, end] = [-end, -start]; }
      stats.ellipseNative++;
      return [{
        ...base('Ellipse'), kind: 'ellipse', cx: round(sx * c.x * k), cy: round(-c.y * k), rx: round(R * k), ry: round(ratio * R * k),
        rotation: norm360(rotation), ...(full ? {} : { start: norm360(start), end: norm360(end) }),
      } as CadObject];
    }
    if (entity.type === 'SPLINE') {
      const degree = numberOf(body, 71, 3);
      const knots = body.filter(p => p.code === 40).map(p => Number(p.value));
      const weights = body.filter(p => p.code === 41).map(p => Number(p.value));
      const ctrl = xyPairs(body, 10, 20), fit = xyPairs(body, 11, 21);
      const closed = (numberOf(body, 70, 0) & 1) === 1;
      // SPLINE natif (lot 10.2) : points de contrôle, nœuds et poids conservés ; repère symétrique : X opposé.
      const w = weights.length === ctrl.length && weights.length > 0 && weights.some(v => Math.abs(v - 1) > 1e-12) ? weights : undefined;
      const native = { points: ctrl.flatMap(p => [round(sx * p.x * k), round(-p.y * k)]), degree, knots, ...(w ? { weights: w } : {}) };
      if (ctrl.length > 0 && isValidSpline(native)) {
        stats.splineNative++;
        return [{ ...base('Spline'), kind: 'spline', ...native, ...(closed ? { closed: true } : {}) } as CadObject];
      }
      const s = splinePoints(degree, knots, ctrl, weights.length === ctrl.length && weights.length > 0 ? weights : null, fit, tolLocal);
      if (!s) { stats.degenerate++; return []; }
      stats.spline++;
      if (Number.isNaN(s.error)) stats.curveFit++;
      else stats.curveError = Math.max(stats.curveError, s.error * k);
      const o = polylineOf('Spline', s.points, closed);
      return o ? [o] : [];
    }
    if (entity.type === 'HATCH') {
      const h = parseHatch(body, tolLocal);
      if (!h || h.loops.length === 0) { stats.degenerate++; return []; }
      stats.hatch++;
      stats.curveError = Math.max(stats.curveError, h.error * k);
      // Contour extérieur : le premier marqué « externe », sinon le plus grand ; les autres sont des îlots.
      const area = (l: { x: number; y: number }[]) => Math.abs(l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
      let outerIndex = h.loops.findIndex(l => l.external);
      if (outerIndex < 0) outerIndex = h.loops.reduce((best, l, i) => (area(l.points) > area(h.loops[best].points) ? i : best), 0);
      const islands = h.loops.filter((_, i) => i !== outerIndex).map(l => polylineOf('Îlot', l.points, true)).filter((o): o is CadObject => !!o);
      const outer = polylineOf('Hachure', h.loops[outerIndex].points, true);
      if (!outer) { stats.degenerate++; return []; }
      stats.hatchIslands += islands.length;
      if (h.approximated) stats.hatchApprox++;
      const style = { hatch: h.style, ...(h.style !== 'solid' ? { hatchParams: { angle: norm360(sx < 0 ? 180 - h.angle : h.angle), spacing: round(h.spacing * k), unit: 'modele' as const } } : {}) };
      return [{ ...outer, ...style, ...(islands.length ? { holes: islands.map(o => o.id) } : {}) } as CadObject, ...islands];
    }

    // LWPOLYLINE : sommets (10/20) et courbure éventuelle (42) attachée au sommet qui la précède.
    const vertices: { x: number; y: number; bulge: number }[] = [];
    let currentX: number | null = null;
    for (const pair of body) {
      if (pair.code === 10) currentX = Number(pair.value);
      else if (pair.code === 20 && currentX !== null && Number.isFinite(currentX)) {
        vertices.push({ x: sx * currentX * k, y: Number(pair.value) * k, bulge: 0 });
        currentX = null;
      } else if (pair.code === 42 && vertices.length > 0) {
        const b = Number(pair.value);
        vertices[vertices.length - 1].bulge = Number.isFinite(b) ? sx * b : 0;
      } else if ((pair.code === 40 || pair.code === 41 || pair.code === 43) && Number(pair.value) !== 0) {
        stats.widths++;
      }
    }
    if (vertices.length < 2) { stats.degenerate++; return []; }
    const closed = (Number(valueOf(body, 70) ?? '0') & 1) === 1;
    const segmentCount = closed ? vertices.length : vertices.length - 1;
    const pts: number[] = [vertices[0].x, vertices[0].y];
    for (let s = 0; s < segmentCount; s++) {
      const a = vertices[s];
      const b = vertices[(s + 1) % vertices.length];
      if (Math.abs(a.bulge) > EPS) {
        const arc = bulgeArc(a.x, a.y, b.x, b.y, a.bulge);
        if (arc) {
          stats.bulgeSegments++;
          stats.maxArcError = Math.max(stats.maxArcError, arc.error);
          for (let i = 2; i < arc.points.length; i++) pts.push(arc.points[i]);
          continue;
        }
      }
      pts.push(b.x, b.y);
    }
    if (closed && !samePoint(pts[0], pts[1], pts[pts.length - 2], pts[pts.length - 1])) pts.push(pts[0], pts[1]);
    stats.polyline++;
    return [{ ...base('Polyligne'), kind: 'polyline', points: flipY(pts) } as CadObject];
  };

  const blocks: BlockDef[] = [];
  const keptBlocks = new Map<string, string>();
  let blockCounter = options.blockStart ?? 0;
  const converted = convertList(entities, 0, null);

  // Identifiants définitifs (OBJ-), dans l'ordre du fichier ; les îlots de hachure suivent.
  let objectCounter = options.objectStart;
  const finalIds = new Map<string, string>();
  for (const o of converted) finalIds.set(o.id, `OBJ-${String(++objectCounter).padStart(4, '0')}`);
  const objects = converted.map(o => {
    const id = finalIds.get(o.id)!;
    const named = o.name.startsWith(TEMP_NAME) ? `${o.name.slice(1)} ${id}` : o.name;
    return { ...o, id, name: named, ...(o.holes ? { holes: o.holes.map(h => finalIds.get(h) ?? h) } : {}) } as CadObject;
  });

  const report: ExchangeReport = { kept: [], transformed: [], lost: [] };
  const unitText = `${unitDef.label}${unitSource === 'fichier' ? ' (déclarée par le fichier)' : unitSource === 'choix' ? ' (choisie à l\'import)' : ' (supposée : non déclarée)'}`;
  if (unitDef.toMm === 1) report.kept.push(`Unité : ${unitText}.`);
  else report.transformed.push(`Unité : ${unitText} → millimètre (×${formatFactor(unitDef.toMm)}).`);
  if (stats.line) report.kept.push(`Lignes : ${stats.line}.`);
  if (stats.circle) report.kept.push(`Cercles : ${stats.circle}.`);
  if (stats.text) report.kept.push(`Textes : ${stats.text} (contenu, hauteur, rotation, alignement ; mise en forme MTEXT simplifiée).`);
  if (stats.polyline) report.kept.push(`Polylignes : ${stats.polyline}.`);
  if (stats.arc) report.kept.push(`Arcs : ${stats.arc} (ARC natif, sans approximation).`);
  if (stats.blockKept) report.kept.push(`Blocs : ${stats.blockKept} occurrence(s) conservée(s) comme blocs (${blocks.length} définition(s), point de base et échelle).`);
  if (stats.blockExploded) report.transformed.push(`Blocs : ${stats.blockExploded} occurrence(s) éclatée(s) en objets (rotation, échelle non uniforme, symétrie, imbrication ou textes et hachures dans le bloc).`);
  if (stats.dimension) report.transformed.push(`Cotes DIMENSION : ${stats.dimension} → géométrie dessinée (traits, flèches, textes) ; elles ne sont plus associatives.`);
  if (stats.hatch) report.kept.push(`Hachures : ${stats.hatch} (contour, ${stats.hatchIslands} îlot(s), angle et pas ; aplat SOLID conservé).`);
  if (stats.hatchApprox) report.transformed.push(`Motifs de hachure : ${stats.hatchApprox} motif(s) prédéfini(s) ramené(s) à des traits parallèles ou croisés (angle et pas de la première famille).`);
  if (stats.ellipseNative) report.kept.push(`Ellipses : ${stats.ellipseNative} (ELLIPSE natif, sans approximation).`);
  if (stats.ellipse) report.kept.push(`Ellipses circulaires : ${stats.ellipse} → cercles ou arcs exacts.`);
  if (stats.splineNative) report.kept.push(`Splines : ${stats.splineNative} (SPLINE natif : degré, points de contrôle, nœuds et poids conservés).`);
  if (stats.spline) {
    report.transformed.push(`Courbes : ${stats.spline} spline(s) sans points de contrôle exploitables approchée(s) par des polylignes (écart maximal ${formatMm(stats.curveError)} mm, tolérance ${formatMm(ARC_TOLERANCE_MM)} mm${stats.curveFit ? ` ; ${stats.curveFit} spline(s) par points d'ajustement reliés` : ''}).`);
  }
  if (stats.bulgeSegments) {
    const parts = `${stats.bulgeSegments} segment(s) courbe(s) de polyligne`;
    report.transformed.push(`Courbes : ${parts} approchés par des polylignes (écart maximal ${formatMm(stats.maxArcError)} mm, tolérance ${formatMm(ARC_TOLERANCE_MM)} mm).`);
    if (stats.maxArcError > ARC_TOLERANCE_MM + 1e-9) {
      const text = `Tolérance d'approximation dépassée : écart de ${formatMm(stats.maxArcError)} mm sur un arc trop grand (plafond de ${MAX_ARC_STEPS.toLocaleString('fr-FR')} segments).`;
      report.lost.push(text);
      warnings.push(text);
    }
  }
  if (stats.mirrored) report.transformed.push(`Entités en repère symétrique (extrusion 0,0,−1) : ${stats.mirrored}, replacées dans le repère général.`);
  if (stats.widths) report.lost.push(`Largeurs de polyligne : ${stats.widths} valeur(s) non nulle(s) ignorée(s).`);
  if (stats.outOfPlane) report.lost.push(`Entités hors du plan XY : ${stats.outOfPlane} (non importées).`);
  if (stats.degenerate) report.lost.push(`Entités dégénérées (longueur ou rayon nul) : ${stats.degenerate} (non importées).`);
  if (stats.missingBlock) report.lost.push(`Références de blocs introuvables ou trop imbriquées : ${stats.missingBlock} (non importées).`);
  if (stats.minsert) report.lost.push(`Réseaux d'insertion (MINSERT) : ${stats.minsert} — seule la première occurrence est importée.`);
  if (unsupported.size > 0) {
    const text = `Entités DXF ignorées : ${[...unsupported.entries()].map(([name, count]) => `${name} ×${count}`).join(', ')}.`;
    report.lost.push(text);
    warnings.push(text);
  }
  if (entities.length === 0) warnings.push('Aucune entité prise en charge (LINE, CIRCLE, ARC, LWPOLYLINE, TEXT, MTEXT, INSERT, DIMENSION, HATCH, SPLINE, ELLIPSE) trouvée dans le fichier DXF.');

  return {
    objects,
    layers,
    blocks,
    warnings,
    report,
    unit: { key: unitDef.key, label: unitDef.label, toMm: unitDef.toMm, source: unitSource },
    unitMissing,
  };
}

/** Codes de contrôle des TEXT (%%c, %%d, %%p) et de mise en forme des MTEXT, ramenés à du texte simple. */
export function decodeDxfText(raw: string, mtext: boolean): string {
  let t = raw.replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '').replace(/%%%/g, '%');
  if (!mtext) return t;
  t = t
    .replace(/\\\\/g, '\uE000')
    .replace(/\\\{/g, '\uE001')
    .replace(/\\\}/g, '\uE002')
    .replace(/\\P/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\S([^;]*)[\^#/]([^;]*);/g, '$1/$2')
    .replace(/\\[ACcFfHhQqTtWwp][^;]*;/g, '')
    .replace(/\\[LlOoKkNn]/g, '')
    .replace(/[{}]/g, '')
    .replace(/\uE001/g, '{')
    .replace(/\uE002/g, '}')
    .replace(/\uE000/g, '\\');
  return t;
}

function parseTextEntity(type: 'TEXT' | 'MTEXT', body: Pair[], k: number, sx: number): Pick<TextObj, 'x' | 'y' | 'content' | 'height' | 'rotation' | 'align'> | null {
  const height = Math.abs(numberOf(body, 40, 0)) * k;
  if (height <= EPS) return null;
  if (type === 'TEXT') {
    const content = decodeDxfText(valueOf(body, 1) ?? '', false);
    if (!content.trim()) return null;
    // Justification (référence DXF TEXT) : 72 = horizontale (0 gauche, 1 centre, 2 droite,
    // 3 alignée, 4 milieu, 5 ajustée) ; 73 = verticale (0 ligne de base, 1 bas, 2 milieu, 3 haut).
    // Dès qu'une justification n'est pas « gauche / ligne de base », le point d'ancrage est 11/21.
    const h = Number(valueOf(body, 72) ?? '0') || 0;
    const v = Number(valueOf(body, 73) ?? '0') || 0;
    const baselineStart = h === 3 || h === 5; // alignée / ajustée : 10/20 est le début de la ligne de base
    const align: TextAlign = baselineStart ? 'left' : h === 1 || h === 4 ? 'center' : h === 2 ? 'right' : 'left';
    const useAlignPoint = !baselineStart && (h !== 0 || v !== 0) && valueOf(body, 11) !== undefined;
    let rotation = numberOf(body, 50, 0);
    let x = sx * numberOf(body, useAlignPoint ? 11 : 10, 0) * k;
    let y = numberOf(body, useAlignPoint ? 21 : 20, 0) * k;
    // Décalage du point d'ancrage vers la ligne de base, perpendiculairement au texte (repère DXF).
    const vertical = h === 4 ? 2 : baselineStart ? 0 : v;
    const up = vertical === 1 ? height * 0.25 : vertical === 2 ? -height / 2 : vertical === 3 ? -height : 0;
    if (useAlignPoint && up !== 0) {
      const r = (rotation * Math.PI) / 180;
      x += -Math.sin(r) * up * sx;
      y += Math.cos(r) * up;
    }
    if (sx < 0) rotation = 180 - rotation;
    return { x: round(x), y: round(-y), content, height: round(height), rotation: normalizeDeg(rotation), align };
  }
  // MTEXT : contenu en morceaux (codes 3) puis fin (code 1).
  const raw = body.filter(p => p.code === 3).map(p => p.value).join('') + (valueOf(body, 1) ?? '');
  const content = decodeDxfText(raw, true).replace(/\n+$/, '');
  if (!content.trim()) return null;
  const attach = Math.min(9, Math.max(1, Number(valueOf(body, 71) ?? '1') || 1));
  const align: TextAlign = (['left', 'center', 'right'] as const)[(attach - 1) % 3];
  const row = Math.floor((attach - 1) / 3); // 0 haut, 1 milieu, 2 bas
  let rotation = valueOf(body, 11) !== undefined
    ? (Math.atan2(numberOf(body, 21, 0), numberOf(body, 11, 1)) * 180) / Math.PI
    : numberOf(body, 50, 0);
  if (sx < 0) rotation = 180 - rotation;
  const lines = content.split('\n').length;
  const blockHeight = height + (lines - 1) * height * 1.4;
  // Distance (vers le bas, repère local) du point d'attache à la ligne de base de la 1re ligne.
  const down = row === 0 ? height : row === 1 ? height - blockHeight / 2 : -(lines - 1) * height * 1.4;
  const rad = (rotation * Math.PI) / 180;
  const ax = sx * numberOf(body, 10, 0) * k;
  const ay = numberOf(body, 20, 0) * k;
  const bx = ax + Math.sin(rad) * down;
  const by = ay - Math.cos(rad) * down;
  return { x: round(bx), y: round(-by), content, height: round(height), rotation: normalizeDeg(rotation), align };
}

function normalizeDeg(deg: number): number {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 1e6) / 1e6;
}

/** Texte lisible d'un rapport d'échange (pour une boîte de dialogue ou un journal). */
export function formatExchangeReport(title: string, report: ExchangeReport): string {
  const block = (label: string, lines: string[]) => (lines.length ? [`${label} :`, ...lines.map(l => `  • ${l}`)] : []);
  return [
    title,
    ...block('Conservé', report.kept),
    ...block('Transformé', report.transformed),
    ...block('Perdu', report.lost),
  ].join('\n');
}

// ─── Géométrie des arcs ───────────────────────────────────────────────────

/**
 * Discrétise un arc (repère Y ascendant, angles en radians, sens trigonométrique)
 * avec un écart de corde ≤ ARC_TOLERANCE_MM. Renvoie les points et l'écart effectif.
 */
export function arcPoints(cx: number, cy: number, r: number, start: number, sweep: number): { points: number[]; error: number } {
  const steps = arcSteps(r, Math.abs(sweep));
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return { points, error: r * (1 - Math.cos(Math.abs(sweep) / steps / 2)) };
}

/** Garde-fou mémoire : au-delà, la tolérance n'est plus tenue et le rapport le signale. */
const MAX_ARC_STEPS = 100000;

function arcSteps(r: number, sweep: number): number {
  if (r <= ARC_TOLERANCE_MM) return Math.max(1, Math.ceil(sweep / (Math.PI / 2)));
  const maxStep = 2 * Math.acos(1 - ARC_TOLERANCE_MM / r);
  return Math.min(MAX_ARC_STEPS, Math.max(1, Math.ceil(sweep / maxStep)));
}

/** Segment courbe d'une LWPOLYLINE : courbure b = tan(θ/4), θ > 0 = sens trigonométrique. */
export function bulgeArc(x1: number, y1: number, x2: number, y2: number, bulge: number): { points: number[]; error: number } | null {
  const dx = x2 - x1, dy = y2 - y1;
  const chord = Math.hypot(dx, dy);
  if (chord <= EPS) return null;
  const theta = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.abs(Math.sin(theta / 2)));
  // Centre : milieu de la corde décalé sur la normale à gauche (sens trigonométrique).
  const h = (chord / 2) / Math.tan(theta / 2);
  const cx = (x1 + x2) / 2 - (dy / chord) * h;
  const cy = (y1 + y2) / 2 + (dx / chord) * h;
  const start = Math.atan2(y1 - cy, x1 - cx);
  const arc = arcPoints(cx, cy, r, start, theta);
  // Extrémités exactes (évite l'accumulation d'erreurs d'arrondi).
  arc.points[0] = x1; arc.points[1] = y1;
  arc.points[arc.points.length - 2] = x2; arc.points[arc.points.length - 1] = y2;
  return arc;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────

function flipY(points: number[]): number[] {
  return points.map((v, i) => round(i % 2 === 0 ? v : -v));
}

function toPairs(text: string): Pair[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (Number.isFinite(code)) pairs.push({ code, value: decodeDxfString(lines[i + 1].trim()) });
  }
  return pairs;
}

/**
 * Chaînes DXF R2000 : les caractères hors ASCII s'écrivent « \U+XXXX » (lisibles quel que soit
 * le jeu de caractères du lecteur) ; les caractères au-delà de U+FFFF passent par leurs deux moitiés UTF-16.
 */
export function encodeDxfString(value: string): string {
  return value.replace(/[\u0080-\uFFFF]/g, ch => `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
}

export function decodeDxfString(value: string): string {
  return value.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function readBody(pairs: Pair[], start: number): Pair[] {
  const body: Pair[] = [];
  for (let i = start; i < pairs.length; i++) {
    if (pairs[i].code === 0) break;
    body.push(pairs[i]);
  }
  return body;
}

function valueOf(body: Pair[], code: number): string | undefined {
  return body.find(p => p.code === code)?.value;
}

function numberOf(body: Pair[], code: number, fallback: number): number {
  const raw = valueOf(body, code);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Couleurs ACI de base (1 à 9) ; les autres index ne sont pas traduits. */
const ACI_BASE: Record<number, string> = {
  1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0',
};

function colorFromBody(body: Pair[]): string | undefined {
  // Vraie couleur : 0 est le noir (#000000), à distinguer d'un groupe 420 absent.
  const raw = valueOf(body, 420);
  const trueColor = raw === undefined ? NaN : Number(raw);
  if (Number.isFinite(trueColor) && trueColor >= 0) return trueColorToHex(trueColor);
  const aci = Math.abs(Number(valueOf(body, 62)));
  return ACI_BASE[aci];
}

function hexToTrueColor(hex: string): number {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  return Number.isFinite(value) ? value : 16777215;
}

function trueColorToHex(value: number): string {
  return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
}

function isEntityName(value: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(value) && !['SECTION', 'ENDSEC', 'TABLE', 'ENDTAB', 'EOF', 'LAYER'].includes(value);
}

function normalizeLayerName(name: string): string {
  return name.trim().toLocaleLowerCase('fr-FR') || '0';
}

/** Nom de calque DXF valide : caractères interdits remplacés. */
function dxfLayerName(name: string): string {
  const clean = name.replace(/[<>/\\":;?*|=`,]/g, '_').trim();
  return clean || '0';
}

function samePoint(x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.hypot(x2 - x1, y2 - y1) < 1e-6;
}

function n(value: number): string {
  const rounded = Math.round(value * 1000000) / 1000000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Valeur sans unité de longueur (rapport, paramètre en radians) : douze décimales. */
function nf(value: number): string {
  const rounded = Number(value.toFixed(12));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function round(value: number): number {
  const rounded = Math.round(value * 1000000) / 1000000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatMm(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

function formatFactor(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 6 });
}

// ─── Import : blocs, hachures, courbes (lot 6.1) ─────────────────────────────

interface Entity { type: string; body: Pair[] }

/** Couples (x, y) d'une entité, dans l'ordre : codes 10/20 (contrôle) ou 11/21 (ajustement). */
function xyPairs(body: Pair[], cx: number, cy: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x: number | null = null;
  for (const p of body) {
    if (p.code === cx) x = Number(p.value);
    else if (p.code === cy && x !== null) { out.push({ x, y: Number(p.value) }); x = null; }
  }
  return out;
}

/**
 * Transformation affine d'un objet importé (repère du modèle) : q = T + M (p − B). Une similitude
 * (rotation, échelle uniforme, symétrie) garde cercles, arcs et textes ; sinon cercles et arcs
 * deviennent des polylignes (écart de corde ≤ tolérance).
 */
function affineObject(o: CadObject, M: { a: number; b: number; c: number; d: number }, T: { x: number; y: number }, B: { x: number; y: number }, tolMm: number): CadObject {
  const out = affineShape(o, M, T, B, tolMm);
  if (!o.hatchParams || out.kind !== 'polyline' || o.kind !== 'polyline') return out;
  // Le motif suit la transformation : direction des traits transformée, pas modèle mesuré
  // perpendiculairement aux traits transformés, origine (relative à l'emprise) déplacée avec la figure.
  const hp = o.hatchParams;
  const t = (hp.angle * Math.PI) / 180, v = { x: Math.cos(t), y: -Math.sin(t) }; // angle compté à l'écran (Y vers le bas)
  const w = { x: M.a * v.x + M.b * v.y, y: M.c * v.x + M.d * v.y };
  const wl = Math.hypot(w.x, w.y), det = Math.abs(M.a * M.d - M.b * M.c);
  if (wl < 1e-12 || det < 1e-12) return out;
  const minOf = (pts: number[], k: number) => Math.min(...pts.filter((_, i) => i % 2 === k));
  const b0 = { x: minOf(o.points, 0), y: minOf(o.points, 1) }, b1 = { x: minOf(out.points, 0), y: minOf(out.points, 1) };
  const O = { x: b0.x + (hp.originX ?? 0) - B.x, y: b0.y + (hp.originY ?? 0) - B.y };
  const O2 = { x: T.x + M.a * O.x + M.b * O.y, y: T.y + M.c * O.x + M.d * O.y };
  const angle = norm360((Math.atan2(-w.y, w.x) * 180) / Math.PI) % 180;
  return {
    ...out,
    hatchParams: {
      ...hp,
      angle: round(angle),
      spacing: hp.unit === 'modele' ? round((hp.spacing * det) / wl) : hp.spacing,
      originX: round(O2.x - b1.x), originY: round(O2.y - b1.y),
    },
  };
}

function affineShape(o: CadObject, M: { a: number; b: number; c: number; d: number }, T: { x: number; y: number }, B: { x: number; y: number }, tolMm: number): CadObject {
  const map = (x: number, y: number) => ({ x: round(T.x + M.a * (x - B.x) + M.b * (y - B.y)), y: round(T.y + M.c * (x - B.x) + M.d * (y - B.y)) });
  const sxLen = Math.hypot(M.a, M.c), syLen = Math.hypot(M.b, M.d);
  const det = M.a * M.d - M.b * M.c;
  const similar = Math.abs(sxLen - syLen) < 1e-9 * Math.max(1, sxLen) && Math.abs(M.a * M.b + M.c * M.d) < 1e-9 * Math.max(1, sxLen * syLen);
  // Direction d'angle DXF (sens trigonométrique, Y vers le haut) dans le repère du modèle (Y vers le bas).
  const angleOf = (deg: number) => { const t = (deg * Math.PI) / 180; const v = { x: M.a * Math.cos(t) - M.b * Math.sin(t), y: M.c * Math.cos(t) - M.d * Math.sin(t) }; return (Math.atan2(-v.y, v.x) * 180) / Math.PI; };
  const curve = (cx: number, cy: number, r: number, start: number, sweep: number) => {
    const f = (t: number) => map(cx + r * Math.cos(t), cy - r * Math.sin(t));
    const s = sampleCurve(f, (start * Math.PI) / 180, ((start + sweep) * Math.PI) / 180, tolMm, Math.max(8, Math.ceil(sweep / 11.25)));
    return s.points.flatMap(p => [p.x, p.y]);
  };
  switch (o.kind) {
    case 'line': { const a = map(o.x1, o.y1), b = map(o.x2, o.y2); return { ...o, x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
    case 'polyline': {
      const points: number[] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) { const p = map(o.points[i], o.points[i + 1]); points.push(p.x, p.y); }
      return { ...o, points };
    }
    case 'circle': {
      if (similar) { const c = map(o.cx, o.cy); return { ...o, cx: c.x, cy: c.y, r: round(o.r * sxLen) }; }
      const { cx: _cx, cy: _cy, r: _r, ...rest } = o;
      void _cx; void _cy; void _r;
      return { ...rest, kind: 'polyline', points: curve(o.cx, o.cy, o.r, 0, 360) } as CadObject;
    }
    case 'arc': {
      const sweep = ((o.end - o.start) % 360 + 360) % 360 || 360;
      if (similar) {
        const c = map(o.cx, o.cy);
        let start = angleOf(o.start), end = angleOf(o.end);
        if (det < 0) [start, end] = [end, start];
        return { ...o, cx: c.x, cy: c.y, r: round(o.r * sxLen), start: norm360(start), end: norm360(end) };
      }
      const { cx: _cx, cy: _cy, r: _r, start: _s, end: _e, ...rest } = o;
      void _cx; void _cy; void _r; void _s; void _e;
      return { ...rest, kind: 'polyline', points: curve(o.cx, o.cy, o.r, o.start, sweep) } as CadObject;
    }
    case 'spline': {
      // Transformation affine exacte : elle s'applique aux points de contrôle.
      const points: number[] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) { const p = map(o.points[i], o.points[i + 1]); points.push(p.x, p.y); }
      return { ...o, points };
    }
    case 'ellipse': {
      // Image affine exacte (une ellipse reste une ellipse, même par échelle non uniforme).
      const g = affineEllipse(o, M, T, B);
      if (!g) return o;
      return { ...o, cx: round(g.cx), cy: round(g.cy), rx: round(g.rx), ry: round(g.ry), rotation: round(g.rotation), ...(g.start !== undefined ? { start: round(g.start), end: round(g.end!) } : {}) };
    }
    case 'text': {
      const p = map(o.x, o.y);
      let rotation = angleOf(o.rotation);
      let align = o.align;
      // Symétrie : le texte reste lisible (MIRRTEXT = 0) ; il change de sens et d'alignement.
      if (det < 0) { rotation += 180; align = align === 'left' ? 'right' : align === 'right' ? 'left' : align; }
      return { ...o, x: p.x, y: p.y, height: round(o.height * syLen), rotation: normalizeDeg(rotation), align };
    }
    default: return o;
  }
}

interface HatchData {
  loops: { points: { x: number; y: number }[]; external: boolean }[];
  style: 'solid' | 'diagonal' | 'cross';
  angle: number;
  spacing: number;
  approximated: boolean;
  error: number;
}

/**
 * Lecture d'une HATCH : chemins de contour (polyligne avec courbures, ou arêtes ligne / arc / arc
 * d'ellipse / spline), motif plein ou traits (angle et pas de la première famille de traits).
 */
function parseHatch(body: Pair[], tol: number): HatchData | null {
  let i = 0;
  const seek = (code: number) => { while (i < body.length && body[i].code !== code) i++; return i < body.length ? body[i++] : undefined; };
  const num = (code: number, fallback = 0) => { const p = seek(code); const v = p ? Number(p.value) : NaN; return Number.isFinite(v) ? v : fallback; };
  const patternName = (valueOf(body, 2) ?? '').toUpperCase();
  const solid = Number(valueOf(body, 70) ?? '0') === 1 || patternName === 'SOLID';
  const nPaths = num(91);
  const loops: HatchData['loops'] = [];
  let error = 0;
  for (let pth = 0; pth < nPaths && i < body.length; pth++) {
    const flags = num(92);
    const points: { x: number; y: number }[] = [];
    if (flags & 2) {
      // Chemin polyligne : 72 courbures présentes, 73 fermé, 93 nombre de sommets.
      const hasBulge = num(72) !== 0;
      num(73);
      const n = num(93);
      const verts: { x: number; y: number; bulge: number }[] = [];
      for (let v = 0; v < n; v++) {
        const x = num(10), y = num(20);
        verts.push({ x, y, bulge: hasBulge ? num(42) : 0 });
      }
      for (let v = 0; v < verts.length; v++) {
        const a = verts[v], b = verts[(v + 1) % verts.length];
        points.push({ x: a.x, y: a.y });
        if (Math.abs(a.bulge) > EPS) {
          // Courbure approchée dans le repère en mm (tolérance de corde en mm), puis ramenée aux unités du fichier.
          const k = ARC_TOLERANCE_MM / tol;
          const arc = bulgeArc(a.x * k, a.y * k, b.x * k, b.y * k, a.bulge);
          if (arc) { for (let q = 2; q + 2 < arc.points.length; q += 2) points.push({ x: arc.points[q] / k, y: arc.points[q + 1] / k }); error = Math.max(error, arc.error / k); }
        }
      }
    } else {
      const nEdges = num(93);
      for (let e = 0; e < nEdges; e++) {
        const type = num(72);
        let seg: { x: number; y: number }[] = [];
        if (type === 1) {
          seg = [{ x: num(10), y: num(20) }, { x: num(11), y: num(21) }];
        } else if (type === 2) {
          const c = { x: num(10), y: num(20) }, r = num(40), a0 = num(50), a1 = num(51), ccw = num(73, 1) !== 0;
          const s = arcCurvePoints(c, r, a0, a1, ccw, tol);
          seg = s.points; error = Math.max(error, s.error);
        } else if (type === 3) {
          const c = { x: num(10), y: num(20) }, major = { x: num(11), y: num(21) }, ratio = num(40, 1), a0 = num(50), a1 = num(51, 360), ccw = num(73, 1) !== 0;
          let p0 = (a0 * Math.PI) / 180, p1 = (a1 * Math.PI) / 180;
          if (!ccw) [p0, p1] = [-p0, -p1];
          const s = ellipsePoints(c, major, ratio, Math.min(p0, p1), Math.max(p0, p1), tol);
          seg = ccw ? s.points : s.points.reverse(); error = Math.max(error, s.error);
        } else if (type === 4) {
          const degree = num(94, 3);
          // 73 rationnelle : un poids (42) suit chaque point de contrôle ; 74 périodique.
          const rational = num(73) !== 0;
          num(74);
          const nk = num(95), nc = num(96);
          const knots = Array.from({ length: nk }, () => num(40));
          const weights: number[] = [];
          const ctrl = Array.from({ length: nc }, () => {
            const p = { x: num(10), y: num(20) };
            if (rational) weights.push(num(42, 1));
            return p;
          });
          const s = splinePoints(degree, knots, ctrl, rational ? weights : null, [], tol);
          if (s) { seg = s.points; if (!Number.isNaN(s.error)) error = Math.max(error, s.error); }
        } else {
          return null;
        }
        // Arêtes consécutives : le point commun n'est pas répété.
        if (points.length && seg.length && Math.hypot(points[points.length - 1].x - seg[0].x, points[points.length - 1].y - seg[0].y) < 1e-9) seg = seg.slice(1);
        points.push(...seg);
      }
    }
    // Objets source associés (97 nombre, 330 références) : sans effet ici.
    if (points.length >= 3) loops.push({ points, external: (flags & 1) === 1 });
  }
  // Motif : angle et pas de la première famille de traits (53 angle, 45/46 décalage) ; deux familles
  // perpendiculaires = traits croisés.
  const lineAngles = body.filter(p => p.code === 53).map(p => Number(p.value));
  const dx = Number(valueOf(body, 45) ?? 'NaN'), dy = Number(valueOf(body, 46) ?? 'NaN');
  const known = patternName === 'ANSI31' || patternName === 'ANSI37' || patternName === 'USER' || patternName === '_USER' || solid;
  const cross = lineAngles.length >= 2 && Math.abs(Math.abs(((lineAngles[1] - lineAngles[0]) % 180 + 180) % 180) - 90) < 1e-6;
  return {
    loops,
    style: solid ? 'solid' : cross ? 'cross' : 'diagonal',
    angle: lineAngles.length ? lineAngles[0] : 45 + numberOf(body, 52, 0),
    spacing: Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0 ? Math.hypot(dx, dy) : 3.175 * numberOf(body, 41, 1),
    approximated: !known,
    error,
  };
}
