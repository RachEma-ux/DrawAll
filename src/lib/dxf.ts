// Interopérabilité DXF.
// - Import : LINE, CIRCLE, ARC et LWPOLYLINE (y compris segments courbes « bulge »).
//   Les coordonnées sont converties de l'unité déclarée par le fichier ($INSUNITS)
//   vers l'unité interne (millimètre). Les arcs sont approchés par des polylignes
//   avec un écart de corde borné (ARC_TOLERANCE_MM), annoncé dans le rapport.
// - Export : DXF R2000 (AC1015) avec marqueurs de sous-classe, lisible par les
//   lecteurs stricts (ezdxf, AutoCAD). Les hachures sont exportées en entités HATCH.
// - Chaque échange produit un rapport : ce qui est conservé, transformé ou perdu.
// Convention : DrawAll travaille en Y descendant (SVG), DXF en Y ascendant.
import type { BlockDef, CadObject, Layer, PrimitiveObject, TextAlign, TextObj, WallObj } from '@/types/cad';
import { textLines } from '@/lib/text';
import { norm360 } from '@/lib/arc';
import { dimensionGeometry, dimensionText } from '@/lib/geometry';
import { pdimGeometry } from '@/lib/pdim';
import { PAPER_DIMENSION_STYLE, arrowHead } from '@/lib/annotation';
import { wallsGeometry } from '@/lib/wall';
import { hatchAngles, hatchParamsOf } from '@/lib/hatch';
import { primitiveBounds } from '@/lib/geometry';
import { DEFAULT_LINE_TYPE, DEFAULT_LINE_WEIGHT, LINE_TYPES, dxfLineWeight, lineTypeDef, lineTypeFromDxf } from '@/lib/linestyle';
import { occurrencePrimitives } from '@/lib/materials';

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
const SUPPORTED = new Set(['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'TEXT', 'MTEXT']);
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
  const walls = wallsGeometry(objects.filter((o): o is WallObj => o.kind === 'wall'));
  const out: string[] = [];
  const push = (code: number, value: string | number) => out.push(String(code), typeof value === 'string' ? encodeDxfString(value) : String(value));
  let handle = 0x20;
  const nextHandle = () => (handle++).toString(16).toUpperCase();
  const counts = { wall: 0, pdim: 0, line: 0, circle: 0, arc: 0, polyline: 0, rect: 0, hatch: 0, dimension: 0, blockRef: 0, dimensionSkipped: 0, blockSkipped: 0, text: 0, mtext: 0 };

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
      const pseudo = { ...object, kind: 'polyline', points: [...g.quad.flatMap(q => [q.x, q.y]), g.quad[0].x, g.quad[0].y] } as unknown as PrimitiveObject;
      if (pseudo.hatch && pseudo.hatch !== 'none' && writeHatch(entityHeader, push, pseudo, layer, [], hatchScale)) counts.hatch++;
      continue;
    }
    writeOne(object, layer);
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
  if (counts.text) report.kept.push(`Textes sur une ligne : ${counts.text} (TEXT : contenu, hauteur, rotation, alignement).`);
  if (counts.mtext) report.kept.push(`Textes sur plusieurs lignes : ${counts.mtext} (MTEXT).`);
  if (counts.hatch) report.kept.push(`Hachures : ${counts.hatch} (HATCH : aplat SOLID ou motif défini par l'utilisateur à l'angle, au pas et à l'origine de l'objet ; îlots en boucles intérieures).`);
  if (paperHatches) report.transformed.push(`Hachures à pas papier : ${paperHatches} → pas réel à l'échelle 1:${Math.round(hatchScale * 1000) / 1000} (le DXF ne connaît que le modèle).`);
  if (counts.rect) report.transformed.push(`Rectangles : ${counts.rect} → polylignes fermées (LWPOLYLINE).`);
  if (counts.blockRef) report.transformed.push(`Occurrences de blocs : ${counts.blockRef} → éclatées en entités simples (la définition partagée n'est pas exportée).`);
  if (counts.wall) report.transformed.push(`Murs : ${counts.wall} → traits (LINE, jonctions nettoyées) et hachures ; épaisseur et justification ne sont plus éditables comme mur.`);
  if (counts.pdim) report.transformed.push(`Cotes par points (série, cumulées, angulaires, niveaux) : ${counts.pdim} → traits, arcs et textes ; la mesure n'est plus recalculée.`);
  if (counts.dimension) report.transformed.push(`Cotes : ${counts.dimension} → traits + texte (LINE + TEXT) ; l'association à l'objet coté est perdue.`);
  report.lost.push('Identifiants OBJ-, classification métier, noms d\'objets et historique des versions (non représentables en DXF).');
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
    case 'polyline': return { ...p, points: p.points.map((v, i) => (i % 2 === 0 ? x + v * scale : y + v * scale)) };
  }
}

// ─── Import ────────────────────────────────────────────────────────────────

export function parseDxf(text: string, options: DxfImportOptions): DxfImportResult {
  const pairs = toPairs(text);
  const warnings: string[] = [];
  const importedLayers = new Map<string, Partial<Layer>>();
  const entities: { type: string; body: Pair[] }[] = [];
  const unsupported = new Map<string, number>();
  let declaredUnitCode: number | null = null;

  let section: string | null = null;
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
    if (section === 'ENTITIES' && isEntityName(pair.value)) {
      const body = readBody(pairs, i + 1);
      if (SUPPORTED.has(pair.value)) entities.push({ type: pair.value, body });
      else unsupported.set(pair.value, (unsupported.get(pair.value) ?? 0) + 1);
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

  const stats = { text: 0, line: 0, circle: 0, arc: 0, polyline: 0, bulgeSegments: 0, maxArcError: 0, mirrored: 0, outOfPlane: 0, widths: 0, degenerate: 0 };
  let objectCounter = options.objectStart;
  const objects: CadObject[] = [];
  for (const entity of entities) {
    const body = entity.body;
    // Vecteur d'extrusion : (0,0,1) par défaut ; (0,0,-1) = repère objet symétrique (X inversé).
    const ez = numberOf(body, 230, 1);
    const ex = numberOf(body, 210, 0);
    const ey = numberOf(body, 220, 0);
    const flatNormal = Math.abs(ex) < 1e-6 && Math.abs(ey) < 1e-6;
    if (entity.type !== 'LINE' && !flatNormal) { stats.outOfPlane++; continue; }
    const mirror = entity.type !== 'LINE' && ez < 0;
    if (mirror) stats.mirrored++;
    const sx = mirror ? -1 : 1;

    const layer = ensureLayer(valueOf(body, 8) ?? '0');
    const nextId = () => `OBJ-${String(++objectCounter).padStart(4, '0')}`;
    // Propriétés de trait propres à l'entité (BYLAYER sinon).
    const ownStyle: Pick<CadObject, 'color' | 'lineType' | 'lineWeight'> = {};
    const lt = lineTypeFromDxf(valueOf(body, 6));
    if (lt && lt !== 'bylayer') ownStyle.lineType = lt;
    const lw = Number(valueOf(body, 370));
    if (Number.isFinite(lw) && lw > 0) ownStyle.lineWeight = lw / 100;
    const ownColor = colorFromBody(body);
    if (ownColor) ownStyle.color = ownColor;
    const base = (label: string, id: string) => ({
      id,
      name: `${label} ${id}`,
      classification: 'non-classifie' as const,
      layerId: layer.id,
      hatch: 'none' as const,
      createdSeq: options.createdSeq,
      ...ownStyle,
    });

    if (entity.type === 'LINE') {
      const x1 = numberOf(body, 10, 0) * k;
      const y1 = numberOf(body, 20, 0) * k;
      const x2 = numberOf(body, 11, x1 / k) * k;
      const y2 = numberOf(body, 21, y1 / k) * k;
      if (Math.hypot(x2 - x1, y2 - y1) <= EPS) { stats.degenerate++; continue; }
      const id = nextId();
      objects.push({ ...base('Ligne', id), kind: 'line', x1: round(x1), y1: round(-y1), x2: round(x2), y2: round(-y2) });
      stats.line++;
      continue;
    }
    if (entity.type === 'CIRCLE') {
      const r = Math.abs(numberOf(body, 40, 0)) * k;
      if (r <= EPS) { stats.degenerate++; continue; }
      const cx = sx * numberOf(body, 10, 0) * k;
      const cy = numberOf(body, 20, 0) * k;
      const id = nextId();
      objects.push({ ...base('Cercle', id), kind: 'circle', cx: round(cx), cy: round(-cy), r: round(r) });
      stats.circle++;
      continue;
    }
    if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      const text = parseTextEntity(entity.type, body, k, sx);
      if (!text) { stats.degenerate++; continue; }
      const id = nextId();
      objects.push({ ...base('Texte', id), name: text.content.split('\n')[0].slice(0, 40) || `Texte ${id}`, kind: 'text', ...text });
      stats.text++;
      continue;
    }
    if (entity.type === 'ARC') {
      const r = Math.abs(numberOf(body, 40, 0)) * k;
      if (r <= EPS) { stats.degenerate++; continue; }
      const cx = sx * numberOf(body, 10, 0) * k;
      const cy = numberOf(body, 20, 0) * k;
      let start = numberOf(body, 50, 0);
      let end = numberOf(body, 51, 360);
      // Symétrie X : l'angle θ devient 180° − θ et le sens de parcours s'inverse.
      if (mirror) [start, end] = [180 - end, 180 - start];
      // Arc natif : aucune approximation (même centre, même rayon, mêmes angles).
      const id = nextId();
      objects.push({ ...base('Arc', id), kind: 'arc', cx: round(cx), cy: round(-cy), r: round(r), start: norm360(start), end: norm360(end) });
      stats.arc++;
      continue;
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
    if (vertices.length < 2) { stats.degenerate++; continue; }
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
    const id = nextId();
    objects.push({ ...base('Polyligne', id), kind: 'polyline', points: flipY(pts) });
    stats.polyline++;
  }

  const report: ExchangeReport = { kept: [], transformed: [], lost: [] };
  const unitText = `${unitDef.label}${unitSource === 'fichier' ? ' (déclarée par le fichier)' : unitSource === 'choix' ? ' (choisie à l\'import)' : ' (supposée : non déclarée)'}`;
  if (unitDef.toMm === 1) report.kept.push(`Unité : ${unitText}.`);
  else report.transformed.push(`Unité : ${unitText} → millimètre (×${formatFactor(unitDef.toMm)}).`);
  if (stats.line) report.kept.push(`Lignes : ${stats.line}.`);
  if (stats.circle) report.kept.push(`Cercles : ${stats.circle}.`);
  if (stats.text) report.kept.push(`Textes : ${stats.text} (contenu, hauteur, rotation, alignement ; mise en forme MTEXT simplifiée).`);
  if (stats.polyline) report.kept.push(`Polylignes : ${stats.polyline}.`);
  if (stats.arc) report.kept.push(`Arcs : ${stats.arc} (ARC natif, sans approximation).`);
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
  if (unsupported.size > 0) {
    const text = `Entités DXF ignorées : ${[...unsupported.entries()].map(([name, count]) => `${name} ×${count}`).join(', ')}.`;
    report.lost.push(text);
    warnings.push(text);
  }
  if (entities.length === 0) warnings.push('Aucune entité LINE, CIRCLE, ARC, LWPOLYLINE, TEXT ou MTEXT trouvée dans le fichier DXF.');

  return {
    objects,
    layers,
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
