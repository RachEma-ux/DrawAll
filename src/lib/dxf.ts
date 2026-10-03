// Import/export DXF minimal mais structuré : LINE, CIRCLE et LWPOLYLINE.
// Convention : DrawAll travaille en Y descendant (SVG), DXF en Y ascendant.
import type { BlockDef, CadObject, Layer, PrimitiveObject } from '@/types/cad';
import { dimensionGeometry, dimensionText } from '@/lib/geometry';

export interface DxfImportOptions {
  objectStart: number;
  layerStart: number;
  createdSeq: number;
  existingLayers: Layer[];
}

export interface DxfImportResult {
  objects: CadObject[];
  layers: Layer[];
  warnings: string[];
}

interface Pair { code: number; value: string }

const DEFAULT_LAYER_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185'];
const SUPPORTED = new Set(['LINE', 'CIRCLE', 'LWPOLYLINE']);

export function exportToDxf(objects: CadObject[], layers: Layer[], blocks: BlockDef[]): string {
  const out: string[] = [];
  const push = (code: number, value: string | number) => out.push(String(code), String(value));

  push(0, 'SECTION'); push(2, 'HEADER');
  push(9, '$INSUNITS'); push(70, 4); // millimètres
  push(0, 'ENDSEC');

  push(0, 'SECTION'); push(2, 'TABLES');
  push(0, 'TABLE'); push(2, 'LAYER'); push(70, layers.length);
  for (const layer of layers) {
    push(0, 'LAYER');
    push(2, layer.name);
    push(70, 0);
    push(62, 7);
    push(420, hexToTrueColor(layer.color));
    push(6, 'CONTINUOUS');
  }
  push(0, 'ENDTAB'); push(0, 'ENDSEC');

  push(0, 'SECTION'); push(2, 'ENTITIES');
  for (const object of objects) {
    const layer = layers.find(l => l.id === object.layerId)?.name ?? '0';
    if (object.kind === 'blockRef') {
      const block = blocks.find(b => b.id === object.blockId);
      if (!block) continue;
      for (const primitive of block.primitives) {
        writePrimitive(push, transformPrimitive(primitive, object.x, object.y, object.scale), layer);
      }
      continue;
    }
    if (object.kind === 'dimension') {
      const target = objects.find(o => o.id === object.targetId);
      const geometry = target ? dimensionGeometry(object, target) : null;
      if (!geometry) continue;
      push(0, 'LINE'); push(8, layer);
      push(10, n(geometry.x1)); push(20, n(-geometry.y1));
      push(11, n(geometry.x2)); push(21, n(-geometry.y2));
      push(0, 'TEXT'); push(8, layer);
      push(10, n(geometry.tx)); push(20, n(-geometry.ty)); push(40, 10);
      push(1, dimensionText(object, objects));
      continue;
    }
    writePrimitive(push, object, layer);
  }
  push(0, 'ENDSEC'); push(0, 'EOF');
  return `${out.join('\n')}\n`;
}

export function parseDxf(text: string, options: DxfImportOptions): DxfImportResult {
  const pairs = toPairs(text);
  const warnings: string[] = [];
  const importedLayers = new Map<string, Partial<Layer>>();
  const entities: { type: string; body: Pair[] }[] = [];
  const unsupported = new Map<string, number>();

  let section: string | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
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
        importedLayers.set(normalizeLayerName(name), {
          name,
          color: colorFromBody(body),
          visible: true,
          locked: false,
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
    };
    layerByName.set(clean, layer);
    layers.push(layer);
    return layer;
  };

  let objectCounter = options.objectStart;
  const objects: CadObject[] = [];
  for (const entity of entities) {
    const layer = ensureLayer(valueOf(entity.body, 8) ?? '0');
    const id = `OBJ-${String(++objectCounter).padStart(4, '0')}`;
    const base = {
      id,
      name: `${entity.type === 'LWPOLYLINE' ? 'Polyligne' : entity.type === 'CIRCLE' ? 'Cercle' : 'Ligne'} ${id}`,
      classification: 'non-classifie' as const,
      layerId: layer.id,
      hatch: 'none' as const,
      createdSeq: options.createdSeq,
    };
    if (entity.type === 'LINE') {
      const x1 = numberOf(entity.body, 10, 0);
      const y1 = -numberOf(entity.body, 20, 0);
      const x2 = numberOf(entity.body, 11, x1);
      const y2 = -numberOf(entity.body, 21, y1);
      if (Math.hypot(x2 - x1, y2 - y1) >= 0.001) objects.push({ ...base, kind: 'line', x1, y1, x2, y2 });
      continue;
    }
    if (entity.type === 'CIRCLE') {
      const cx = numberOf(entity.body, 10, 0);
      const cy = -numberOf(entity.body, 20, 0);
      const r = Math.abs(numberOf(entity.body, 40, 0));
      if (r >= 0.001) objects.push({ ...base, kind: 'circle', cx, cy, r });
      continue;
    }
    const points: number[] = [];
    let currentX: number | null = null;
    for (const pair of entity.body) {
      if (pair.code === 10) currentX = Number(pair.value);
      if (pair.code === 20 && currentX !== null && Number.isFinite(currentX)) {
        points.push(round(currentX), round(-Number(pair.value)));
        currentX = null;
      }
    }
    if (points.length >= 4) {
      const closed = (Number(valueOf(entity.body, 70) ?? '0') & 1) === 1;
      const finalPoints = closed && !samePoint(points[0], points[1], points[points.length - 2], points[points.length - 1])
        ? [...points, points[0], points[1]]
        : points;
      objects.push({ ...base, kind: 'polyline', points: finalPoints });
    }
  }

  if (unsupported.size > 0) {
    warnings.push(`Entités DXF ignorées : ${[...unsupported.entries()].map(([name, count]) => `${name} ×${count}`).join(', ')}.`);
  }
  if (entities.length === 0) warnings.push('Aucune entité LINE, CIRCLE ou LWPOLYLINE trouvée dans le fichier DXF.');
  return { objects, layers, warnings };
}

function writePrimitive(push: (code: number, value: string | number) => void, object: PrimitiveObject, layer: string): void {
  if (object.kind === 'line') {
    push(0, 'LINE'); push(8, layer);
    push(10, n(object.x1)); push(20, n(-object.y1));
    push(11, n(object.x2)); push(21, n(-object.y2));
    return;
  }
  if (object.kind === 'circle') {
    push(0, 'CIRCLE'); push(8, layer);
    push(10, n(object.cx)); push(20, n(-object.cy)); push(40, n(object.r));
    return;
  }
  const points = object.kind === 'rect'
    ? [object.x, object.y, object.x + object.w, object.y, object.x + object.w, object.y + object.h, object.x, object.y + object.h]
    : object.points;
  const closed = object.kind === 'rect' || (object.kind === 'polyline' && samePoint(points[0], points[1], points[points.length - 2], points[points.length - 1]));
  push(0, 'LWPOLYLINE'); push(8, layer);
  push(90, points.length / 2); push(70, closed ? 1 : 0);
  const limit = closed && object.kind === 'polyline' ? points.length - 2 : points.length;
  for (let i = 0; i + 1 < limit; i += 2) {
    push(10, n(points[i])); push(20, n(-points[i + 1]));
  }
}

function transformPrimitive(p: PrimitiveObject, x: number, y: number, scale: number): PrimitiveObject {
  switch (p.kind) {
    case 'line': return { ...p, x1: x + p.x1 * scale, y1: y + p.y1 * scale, x2: x + p.x2 * scale, y2: y + p.y2 * scale };
    case 'rect': return { ...p, x: x + p.x * scale, y: y + p.y * scale, w: p.w * scale, h: p.h * scale };
    case 'circle': return { ...p, cx: x + p.cx * scale, cy: y + p.cy * scale, r: p.r * scale };
    case 'polyline': return { ...p, points: p.points.map((v, i) => (i % 2 === 0 ? x + v * scale : y + v * scale)) };
  }
}

function toPairs(text: string): Pair[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (Number.isFinite(code)) pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
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
  const value = Number(valueOf(body, code));
  return Number.isFinite(value) ? value : fallback;
}

function colorFromBody(body: Pair[]): string | undefined {
  const trueColor = Number(valueOf(body, 420));
  if (Number.isFinite(trueColor) && trueColor > 0) return trueColorToHex(trueColor);
  return undefined;
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

function samePoint(x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.hypot(x2 - x1, y2 - y1) < 0.001;
}

function n(value: number): string {
  return String(Math.round(value * 1000000) / 1000000);
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
