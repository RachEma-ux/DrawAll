// Moteur géométrique 2D de l'atelier : accrochages objet, intersections,
// contrainte orthogonale et limites de vue. Les fonctions sont pures pour être testables.
import type { BlockDef, CadObject, DimensionObj, HatchParams, Layer, PrimitiveObject } from '@/types/cad';
import { dimensionValue, effectiveDimensionStyle, isClosedPolyline, polylineExtents } from '@/types/cad';
import { normalizeAngle, textBounds } from '@/lib/text';
import { angleInArc, angleOf, arcBounds, arcEndpoints, arcMidpoint, norm360 } from '@/lib/arc';
import { pdimGeometry, pdimPoints, transformPdim } from '@/lib/pdim';
import { hatchParamsOf } from '@/lib/hatch';
import { wallQuad } from '@/lib/wall';
import { openingGeometry } from '@/lib/opening';

export interface Point { x: number; y: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export type SnapType = 'intersection' | 'endpoint' | 'center' | 'midpoint' | 'corner' | 'quadrant' | 'insertion' | 'perpendicular' | 'tangent' | 'nearest' | 'grid';

/** Types d'accrochage objet que l'utilisateur peut activer ou couper (la grille reste toujours active). */
export type ObjectSnapType = Exclude<SnapType, 'grid'>;

export interface SnapPoint extends Point {
  type: SnapType;
  label: string;
  objectId?: string;
  distance: number;
}

interface Segment { x1: number; y1: number; x2: number; y2: number; objectId: string }
interface CircleGeom { cx: number; cy: number; r: number; objectId: string; arc?: { start: number; end: number } }

const SNAP_PRIORITY: Record<SnapType, number> = {
  intersection: 0,
  endpoint: 1,
  center: 2,
  midpoint: 3,
  corner: 4,
  quadrant: 5,
  insertion: 6,
  perpendicular: 7,
  tangent: 7,
  nearest: 8,
  grid: 9,
};

const SNAP_LABEL: Record<SnapType, string> = {
  intersection: 'Intersection',
  endpoint: 'Extrémité',
  center: 'Centre',
  midpoint: 'Milieu',
  corner: 'Coin',
  quadrant: 'Quadrant',
  insertion: 'Insertion',
  perpendicular: 'Perpendiculaire',
  tangent: 'Tangent',
  nearest: 'Proche',
  grid: 'Grille',
};

/** Ordre de présentation des accrochages objet. */
export const OBJECT_SNAP_TYPES: ObjectSnapType[] = ['endpoint', 'midpoint', 'center', 'intersection', 'corner', 'quadrant', 'insertion', 'perpendicular', 'tangent', 'nearest'];

/** Accrochages actifs par défaut : tous sauf « proche », qui masquerait la grille près des objets. */
export const DEFAULT_SNAP_TYPES: ObjectSnapType[] = OBJECT_SNAP_TYPES.filter(t => t !== 'nearest');

export interface SnapOptions {
  /** Types actifs ; tous les types objet si absent. */
  types?: readonly ObjectSnapType[];
  /** Point précédent du tracé : origine des accrochages perpendiculaire et tangent. */
  from?: Point;
}

export function snapLabel(type: SnapType): string {
  return SNAP_LABEL[type];
}

export function gridSnap(value: number, gridSize = 10): number {
  return Math.round(value / gridSize) * gridSize;
}

export function constrainOrtho(origin: Point, point: Point): Point {
  const dx = Math.abs(point.x - origin.x);
  const dy = Math.abs(point.y - origin.y);
  return dx >= dy ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function findSnap(
  objects: CadObject[],
  layers: Layer[],
  blocks: BlockDef[],
  x: number,
  y: number,
  tolerance: number,
  gridSize = 10,
  options: SnapOptions = {},
): SnapPoint {
  const visible = objects.filter(o => layers.find(l => l.id === o.layerId)?.visible !== false);
  const active = new Set<SnapType>(options.types ?? OBJECT_SNAP_TYPES);
  const candidates: SnapPoint[] = [];
  for (const object of visible) collectObjectSnaps(object, visible, blocks, x, y, tolerance, candidates);
  if (active.has('intersection')) collectIntersections(visible, blocks, x, y, tolerance, candidates);
  if (active.has('perpendicular') || active.has('tangent') || active.has('nearest')) {
    collectCurveSnaps(visible, blocks, x, y, tolerance, active, options.from, candidates);
  }

  const unique = dedupeSnaps(candidates.filter(c => active.has(c.type)));
  unique.sort((a, b) => SNAP_PRIORITY[a.type] - SNAP_PRIORITY[b.type] || a.distance - b.distance);
  const objectSnap = unique.find(s => s.distance <= tolerance);
  if (objectSnap) return objectSnap;

  const gx = gridSnap(x, gridSize);
  const gy = gridSnap(y, gridSize);
  return { x: gx, y: gy, type: 'grid', label: SNAP_LABEL.grid, distance: Math.hypot(gx - x, gy - y) };
}

function collectObjectSnaps(
  object: CadObject,
  objects: CadObject[],
  blocks: BlockDef[],
  x: number,
  y: number,
  tolerance: number,
  out: SnapPoint[],
): void {
  const add = (type: SnapType, px: number, py: number, objectId = object.id) => {
    const d = Math.hypot(px - x, py - y);
    if (d <= tolerance) out.push({ x: round(px), y: round(py), type, label: SNAP_LABEL[type], objectId, distance: d });
  };

  switch (object.kind) {
    case 'line':
      add('endpoint', object.x1, object.y1);
      add('endpoint', object.x2, object.y2);
      add('midpoint', (object.x1 + object.x2) / 2, (object.y1 + object.y2) / 2);
      return;
    case 'wall': {
      // Trait de référence (pour enchaîner les murs) et coins du mur.
      add('endpoint', object.x1, object.y1);
      add('endpoint', object.x2, object.y2);
      add('midpoint', (object.x1 + object.x2) / 2, (object.y1 + object.y2) / 2);
      for (const q of wallQuad(object) ?? []) add('corner', q.x, q.y);
      return;
    }
    case 'rect':
      for (const [px, py] of rectCorners(object)) add('corner', px, py);
      add('midpoint', object.x + object.w / 2, object.y);
      add('midpoint', object.x + object.w, object.y + object.h / 2);
      add('midpoint', object.x + object.w / 2, object.y + object.h);
      add('midpoint', object.x, object.y + object.h / 2);
      add('center', object.x + object.w / 2, object.y + object.h / 2);
      return;
    case 'circle':
      add('center', object.cx, object.cy);
      add('quadrant', object.cx + object.r, object.cy);
      add('quadrant', object.cx, object.cy + object.r);
      add('quadrant', object.cx - object.r, object.cy);
      add('quadrant', object.cx, object.cy - object.r);
      return;
    case 'arc': {
      const [e1, e2] = arcEndpoints(object);
      add('endpoint', e1.x, e1.y);
      add('endpoint', e2.x, e2.y);
      const m = arcMidpoint(object);
      add('midpoint', m.x, m.y);
      add('center', object.cx, object.cy);
      return;
    }
    case 'polyline':
      for (let i = 0; i + 1 < object.points.length; i += 2) add('endpoint', object.points[i], object.points[i + 1]);
      for (let i = 0; i + 3 < object.points.length; i += 2) {
        add('midpoint', (object.points[i] + object.points[i + 2]) / 2, (object.points[i + 1] + object.points[i + 3]) / 2);
      }
      return;
    case 'pdim':
      for (const q of pdimPoints(object)) add('endpoint', q.x, q.y);
      return;
    case 'dimension': {
      const target = objects.find(o => o.id === object.targetId);
      const geometry = target ? dimensionGeometry(object, target) : null;
      if (!geometry) return;
      add('endpoint', geometry.x1, geometry.y1);
      add('endpoint', geometry.x2, geometry.y2);
      add('midpoint', (geometry.x1 + geometry.x2) / 2, (geometry.y1 + geometry.y2) / 2);
      return;
    }
    case 'blockRef': {
      add('insertion', object.x, object.y);
      const block = blocks.find(b => b.id === object.blockId);
      if (!block) return;
      for (const primitive of block.primitives) {
        const p = transformPrimitive(primitive, object.x, object.y, object.scale);
        collectPrimitiveSnaps(p, x, y, tolerance, out, object.id);
      }
      return;
    }
    case 'text':
      add('insertion', object.x, object.y);
      return;
  }
}

function collectPrimitiveSnaps(
  object: PrimitiveObject,
  x: number,
  y: number,
  tolerance: number,
  out: SnapPoint[],
  objectId: string,
): void {
  const pseudo: CadObject = { ...object, id: objectId } as CadObject;
  collectObjectSnaps(pseudo, [], [], x, y, tolerance, out);
}

function collectIntersections(objects: CadObject[], blocks: BlockDef[], x: number, y: number, tolerance: number, out: SnapPoint[]): void {
  const segments: Segment[] = [];
  const circles: CircleGeom[] = [];
  for (const object of objects) collectGeometry(object, blocks, segments, circles);

  const add = (px: number, py: number, objectId: string) => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const d = Math.hypot(px - x, py - y);
    if (d <= tolerance) out.push({ x: round(px), y: round(py), type: 'intersection', label: SNAP_LABEL.intersection, objectId, distance: d });
  };

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const p = segmentIntersection(segments[i], segments[j]);
      if (p) add(p.x, p.y, segments[j].objectId);
    }
    for (const circle of circles) {
      for (const p of segmentCircleIntersections(segments[i], circle)) if (onCircleGeom(circle, p)) add(p.x, p.y, circle.objectId);
    }
  }
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      for (const p of circleCircleIntersections(circles[i], circles[j])) {
        if (onCircleGeom(circles[i], p) && onCircleGeom(circles[j], p)) add(p.x, p.y, circles[j].objectId);
      }
    }
  }
}

function collectGeometry(object: CadObject, blocks: BlockDef[], segments: Segment[], circles: CircleGeom[]): void {
  switch (object.kind) {
    case 'line':
      segments.push({ x1: object.x1, y1: object.y1, x2: object.x2, y2: object.y2, objectId: object.id });
      return;
    case 'wall': {
      const q = wallQuad(object);
      if (q) for (let i = 0; i < 4; i++) segments.push({ x1: q[i].x, y1: q[i].y, x2: q[(i + 1) % 4].x, y2: q[(i + 1) % 4].y, objectId: object.id });
      return;
    }
    case 'rect': {
      const [a, b, c, d] = rectCorners(object);
      segments.push(
        { x1: a[0], y1: a[1], x2: b[0], y2: b[1], objectId: object.id },
        { x1: b[0], y1: b[1], x2: c[0], y2: c[1], objectId: object.id },
        { x1: c[0], y1: c[1], x2: d[0], y2: d[1], objectId: object.id },
        { x1: d[0], y1: d[1], x2: a[0], y2: a[1], objectId: object.id },
      );
      return;
    }
    case 'circle':
      circles.push({ cx: object.cx, cy: object.cy, r: object.r, objectId: object.id });
      return;
    case 'arc':
      circles.push({ cx: object.cx, cy: object.cy, r: object.r, objectId: object.id, arc: { start: object.start, end: object.end } });
      return;
    case 'polyline':
      for (let i = 0; i + 3 < object.points.length; i += 2) {
        segments.push({ x1: object.points[i], y1: object.points[i + 1], x2: object.points[i + 2], y2: object.points[i + 3], objectId: object.id });
      }
      if (isClosedPolyline(object) && object.points.length >= 6) {
        const last = object.points.length;
        segments.push({ x1: object.points[last - 2], y1: object.points[last - 1], x2: object.points[0], y2: object.points[1], objectId: object.id });
      }
      return;
    case 'blockRef': {
      const block = blocks.find(b => b.id === object.blockId);
      if (!block) return;
      for (const primitive of block.primitives) {
        collectGeometry({ ...transformPrimitive(primitive, object.x, object.y, object.scale), id: object.id } as CadObject, [], segments, circles);
      }
      return;
    }
    case 'dimension':
    case 'pdim':
    case 'text':
      return;
  }
}

/**
 * Accrochages qui dépendent de la courbe entière : perpendiculaire et tangent (depuis le point
 * précédent du tracé), et point le plus proche du curseur.
 */
function collectCurveSnaps(
  objects: CadObject[],
  blocks: BlockDef[],
  x: number,
  y: number,
  tolerance: number,
  active: Set<SnapType>,
  from: Point | undefined,
  out: SnapPoint[],
): void {
  const segments: Segment[] = [];
  const circles: CircleGeom[] = [];
  for (const object of objects) collectGeometry(object, blocks, segments, circles);
  const add = (type: SnapType, p: Point, objectId: string) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= tolerance) out.push({ x: round(p.x), y: round(p.y), type, label: SNAP_LABEL[type], objectId, distance: d });
  };

  for (const s of segments) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    const foot = (p: Point) => {
      const t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2;
      return { t, p: { x: s.x1 + t * dx, y: s.y1 + t * dy } };
    };
    if (active.has('perpendicular') && from) {
      const f = foot(from);
      if (f.t >= -1e-9 && f.t <= 1 + 1e-9 && Math.hypot(f.p.x - from.x, f.p.y - from.y) > 1e-9) add('perpendicular', f.p, s.objectId);
    }
    if (active.has('nearest')) {
      const f = foot({ x, y });
      const t = Math.max(0, Math.min(1, f.t));
      add('nearest', { x: s.x1 + t * dx, y: s.y1 + t * dy }, s.objectId);
    }
  }

  for (const c of circles) {
    if (c.r <= 0) continue;
    if (from) {
      const vx = from.x - c.cx, vy = from.y - c.cy;
      const dist = Math.hypot(vx, vy);
      if (dist > 1e-9) {
        const ux = vx / dist, uy = vy / dist;
        if (active.has('perpendicular')) {
          // Le rayon passant par le point précédent coupe le cercle à angle droit.
          for (const k of [1, -1]) {
            const p = { x: c.cx + k * ux * c.r, y: c.cy + k * uy * c.r };
            if (onCircleGeom(c, p)) add('perpendicular', p, c.objectId);
          }
        }
        if (active.has('tangent') && dist > c.r + 1e-9) {
          // Points de tangence : angle α = acos(r / d) de part et d'autre de la direction centre → point.
          const alpha = Math.acos(c.r / dist);
          const base = Math.atan2(uy, ux);
          for (const sgn of [1, -1]) {
            const a = base + sgn * alpha;
            const p = { x: c.cx + c.r * Math.cos(a), y: c.cy + c.r * Math.sin(a) };
            if (onCircleGeom(c, p)) add('tangent', p, c.objectId);
          }
        }
      }
    }
    if (active.has('nearest')) {
      const vx = x - c.cx, vy = y - c.cy;
      const dist = Math.hypot(vx, vy);
      if (dist > 1e-9) {
        const p = { x: c.cx + (vx / dist) * c.r, y: c.cy + (vy / dist) * c.r };
        if (onCircleGeom(c, p)) add('nearest', p, c.objectId);
        else if (c.arc) {
          // Hors de l'ouverture de l'arc : le point le plus proche est l'extrémité la plus proche.
          const [e1, e2] = arcEndpoints({ cx: c.cx, cy: c.cy, r: c.r, ...c.arc });
          add('nearest', Math.hypot(e1.x - x, e1.y - y) <= Math.hypot(e2.x - x, e2.y - y) ? e1 : e2, c.objectId);
        }
      }
    }
  }
}

/** Un point d'un cercle porteur appartient-il à l'arc (ou au cercle complet) ? */
function onCircleGeom(c: CircleGeom, p: Point): boolean {
  return !c.arc || angleInArc({ cx: c.cx, cy: c.cy, r: c.r, ...c.arc }, angleOf(c.cx, c.cy, p), 1e-6);
}

function segmentIntersection(a: Segment, b: Segment): Point | null {
  const d = (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b.x1 - a.x1) * (b.y2 - b.y1) - (b.y1 - a.y1) * (b.x2 - b.x1)) / d;
  const u = ((b.x1 - a.x1) * (a.y2 - a.y1) - (b.y1 - a.y1) * (a.x2 - a.x1)) / d;
  if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
  return { x: a.x1 + t * (a.x2 - a.x1), y: a.y1 + t * (a.y2 - a.y1) };
}

function segmentCircleIntersections(s: Segment, c: CircleGeom): Point[] {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const fx = s.x1 - c.cx;
  const fy = s.y1 - c.cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return [];
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < -1e-7) return [];
  const root = Math.sqrt(Math.max(0, disc));
  const values = Math.abs(disc) < 1e-7 ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  return values
    .filter(t => t >= -1e-7 && t <= 1 + 1e-7)
    .map(t => ({ x: s.x1 + t * dx, y: s.y1 + t * dy }));
}

function circleCircleIntersections(a: CircleGeom, b: CircleGeom): Point[] {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > a.r + b.r + 1e-7 || d < Math.abs(a.r - b.r) - 1e-7) return [];
  const aa = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const h2 = a.r * a.r - aa * aa;
  const xm = a.cx + (aa * dx) / d;
  const ym = a.cy + (aa * dy) / d;
  if (h2 < 1e-7) return [{ x: xm, y: ym }];
  const h = Math.sqrt(h2);
  return [
    { x: xm + (h * dy) / d, y: ym - (h * dx) / d },
    { x: xm - (h * dy) / d, y: ym + (h * dx) / d },
  ];
}

function rectCorners(r: { x: number; y: number; w: number; h: number }): [number, number][] {
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
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

function dedupeSnaps(points: SnapPoint[]): SnapPoint[] {
  const map = new Map<string, SnapPoint>();
  for (const p of points) {
    const key = `${Math.round(p.x * 1000)}:${Math.round(p.y * 1000)}`;
    const previous = map.get(key);
    if (!previous || SNAP_PRIORITY[p.type] < SNAP_PRIORITY[previous.type] || p.distance < previous.distance) map.set(key, p);
  }
  return [...map.values()];
}

export function objectBounds(object: CadObject, blocks: BlockDef[], objects: CadObject[]): Bounds | null {
  switch (object.kind) {
    case 'line': return boundsOfPoints([{ x: object.x1, y: object.y1 }, { x: object.x2, y: object.y2 }]);
    case 'wall': { const q = wallQuad(object); return q ? boundsOfPoints(q) : boundsOfPoints([{ x: object.x1, y: object.y1 }, { x: object.x2, y: object.y2 }]); }
    case 'opening': {
      const host = objects.find(o => o.id === object.hostId);
      const g = host?.kind === 'wall' ? openingGeometry(object, host) : null;
      if (!g) return null;
      return boundsOfPoints([...g.rect, ...(g.leaf ?? [])]);
    }
    case 'rect': return { minX: object.x, minY: object.y, maxX: object.x + object.w, maxY: object.y + object.h };
    case 'circle': return { minX: object.cx - object.r, minY: object.cy - object.r, maxX: object.cx + object.r, maxY: object.cy + object.r };
    case 'arc': return arcBounds(object);
    case 'polyline': {
      const pts: Point[] = [];
      for (let i = 0; i + 1 < object.points.length; i += 2) pts.push({ x: object.points[i], y: object.points[i + 1] });
      return pts.length ? boundsOfPoints(pts) : null;
    }
    case 'blockRef': {
      const block = blocks.find(b => b.id === object.blockId);
      if (!block) return null;
      const b = blockBounds(block);
      return { minX: object.x + b.minX * object.scale, minY: object.y + b.minY * object.scale, maxX: object.x + b.maxX * object.scale, maxY: object.y + b.maxY * object.scale };
    }
    case 'dimension': {
      const target = objects.find(o => o.id === object.targetId);
      const g = target ? dimensionGeometry(object, target) : null;
      return g ? boundsOfPoints([{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }]) : null;
    }
    case 'text':
      return textBounds(object);
    case 'pdim': {
      const g = pdimGeometry(object);
      const q = pdimPoints(object);
      if (g) {
        for (const [x1, y1, x2, y2] of [...g.lines, ...g.ext]) q.push({ x: x1, y: y1 }, { x: x2, y: y2 });
        for (const a of g.arcs) q.push({ x: a.cx - a.r, y: a.cy - a.r }, { x: a.cx + a.r, y: a.cy + a.r });
      }
      return q.length ? boundsOfPoints(q) : null;
    }
  }
}

export function projectBounds(objects: CadObject[], blocks: BlockDef[]): Bounds | null {
  const bounds = objects.map(o => objectBounds(o, blocks, objects)).filter((b): b is Bounds => !!b);
  return unionBounds(bounds);
}

/** Union d'emprises, sans étaler de grands tableaux en arguments (pile d'appels). */
export function unionBounds(bounds: Bounds[]): Bounds | null {
  if (bounds.length === 0) return null;
  const u = { ...bounds[0] };
  for (const b of bounds) {
    if (b.minX < u.minX) u.minX = b.minX;
    if (b.minY < u.minY) u.minY = b.minY;
    if (b.maxX > u.maxX) u.maxX = b.maxX;
    if (b.maxY > u.maxY) u.maxY = b.maxY;
  }
  return u;
}

export function blockBounds(block: BlockDef): Bounds {
  const bounds = block.primitives.map(primitiveBounds);
  return {
    minX: Math.min(...bounds.map(b => b.minX), 0),
    minY: Math.min(...bounds.map(b => b.minY), 0),
    maxX: Math.max(...bounds.map(b => b.maxX), 1),
    maxY: Math.max(...bounds.map(b => b.maxY), 1),
  };
}

export function primitiveBounds(o: PrimitiveObject): Bounds {
  switch (o.kind) {
    case 'line': return { minX: Math.min(o.x1, o.x2), minY: Math.min(o.y1, o.y2), maxX: Math.max(o.x1, o.x2), maxY: Math.max(o.y1, o.y2) };
    case 'rect': return { minX: o.x, minY: o.y, maxX: o.x + o.w, maxY: o.y + o.h };
    case 'circle': return { minX: o.cx - o.r, minY: o.cy - o.r, maxX: o.cx + o.r, maxY: o.cy + o.r };
    case 'arc': return arcBounds(o);
    case 'polyline': {
      const pts: Point[] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) pts.push({ x: o.points[i], y: o.points[i + 1] });
      return boundsOfPoints(pts.length ? pts : [{ x: 0, y: 0 }]);
    }
  }
}

function boundsOfPoints(points: Point[]): Bounds {
  return unionBounds(points.map(p => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })))!;
}

export function dimensionGeometry(dim: DimensionObj, target: CadObject): { x1: number; y1: number; x2: number; y2: number; tx: number; ty: number; ext: [number, number, number, number][]; arrows?: 'end' } | null {
  const style = effectiveDimensionStyle(dim.style, target);
  if (!style) return null;
  if (style === 'radial' && target.kind === 'arc') {
    const m = arcMidpoint(target);
    if (dim.radialMode === 'diametre') {
      // Diamètre : ligne d'un bord à l'autre en passant par le centre, dans la direction du milieu de l'arc.
      const x1 = 2 * target.cx - m.x, y1 = 2 * target.cy - m.y;
      return { x1, y1, x2: m.x, y2: m.y, tx: target.cx, ty: target.cy - 8, ext: [] };
    }
    return { x1: target.cx, y1: target.cy, x2: m.x, y2: m.y, tx: (target.cx + m.x) / 2, ty: (target.cy + m.y) / 2 - 8, ext: [], arrows: 'end' };
  }
  if (style === 'radial' && target.kind === 'circle') {
    const a = -Math.PI / 4;
    const x2 = target.cx + Math.cos(a) * target.r;
    const y2 = target.cy + Math.sin(a) * target.r;
    if ((dim.radialMode ?? 'diametre') === 'diametre') {
      const x1 = 2 * target.cx - x2, y1 = 2 * target.cy - y2;
      return { x1, y1, x2, y2, tx: target.cx, ty: target.cy - 8, ext: [] };
    }
    return { x1: target.cx, y1: target.cy, x2, y2, tx: (target.cx + x2) / 2, ty: (target.cy + y2) / 2 - 8, ext: [], arrows: 'end' };
  }
  if (style === 'aligned' && target.kind === 'line') {
    const len = Math.hypot(target.x2 - target.x1, target.y2 - target.y1) || 1;
    const nx = -(target.y2 - target.y1) / len;
    const ny = (target.x2 - target.x1) / len;
    const off = dim.offset;
    const x1 = target.x1 + nx * off, y1 = target.y1 + ny * off;
    const x2 = target.x2 + nx * off, y2 = target.y2 + ny * off;
    return { x1, y1, x2, y2, tx: (x1 + x2) / 2, ty: (y1 + y2) / 2 - 8, ext: [[target.x1, target.y1, x1, y1], [target.x2, target.y2, x2, y2]] };
  }
  // Cotes horizontales (ΔX) et verticales (ΔY) : mesurées entre deux points de référence.
  if (style !== 'horizontal' && style !== 'vertical') return null;
  const refs = dimensionReferencePoints(target, style, dim.offset >= 0);
  if (!refs) return null;
  const [a, b] = refs;
  if (style === 'horizontal') {
    const y = dim.offset >= 0 ? Math.max(a.y, b.y) + dim.offset : Math.min(a.y, b.y) + dim.offset;
    return {
      x1: a.x, y1: y, x2: b.x, y2: y,
      tx: (a.x + b.x) / 2, ty: y - 8,
      ext: [[a.x, a.y, a.x, y], [b.x, b.y, b.x, y]],
    };
  }
  if (style === 'vertical') {
    const x = dim.offset >= 0 ? Math.max(a.x, b.x) + dim.offset : Math.min(a.x, b.x) + dim.offset;
    return {
      x1: x, y1: a.y, x2: x, y2: b.y,
      tx: x + 8, ty: (a.y + b.y) / 2,
      ext: [[a.x, a.y, x, a.y], [b.x, b.y, x, b.y]],
    };
  }
  return null;
}

/** Points de référence d'une cote horizontale ou verticale (extrémités de la mesure). */
// Pour une emprise (rectangle, polyligne), l'arête de référence est celle du côté de la cote :
// décalage positif = sous l'objet (horizontale) ou à sa droite (verticale), négatif = au-dessus ou à gauche.
function dimensionReferencePoints(target: CadObject, style: 'horizontal' | 'vertical', positive: boolean): [Point, Point] | null {
  let e: Bounds;
  switch (target.kind) {
    case 'line': return [{ x: target.x1, y: target.y1 }, { x: target.x2, y: target.y2 }];
    case 'rect': e = { minX: target.x, minY: target.y, maxX: target.x + target.w, maxY: target.y + target.h }; break;
    case 'polyline': e = polylineExtents(target.points); break;
    default: return null;
  }
  if (style === 'horizontal') {
    const y = positive ? e.maxY : e.minY;
    return [{ x: e.minX, y }, { x: e.maxX, y }];
  }
  const x = positive ? e.maxX : e.minX;
  return [{ x, y: e.minY }, { x, y: e.maxY }];
}

export function distanceSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function moveObject(object: CadObject, dx: number, dy: number): Partial<CadObject> {
  switch (object.kind) {
    case 'line': return { x1: object.x1 + dx, y1: object.y1 + dy, x2: object.x2 + dx, y2: object.y2 + dy };
    case 'wall': return { x1: object.x1 + dx, y1: object.y1 + dy, x2: object.x2 + dx, y2: object.y2 + dy };
    case 'opening': return {}; // l'ouverture suit son mur
    case 'rect': return { x: object.x + dx, y: object.y + dy };
    case 'circle': return { cx: object.cx + dx, cy: object.cy + dy };
    case 'arc': return { cx: object.cx + dx, cy: object.cy + dy };
    case 'polyline': return { points: object.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
    case 'dimension': return { offset: object.offset + (object.style === 'vertical' ? dx : dy) };
    case 'pdim': return transformPdim(object, q => ({ x: q.x + dx, y: q.y + dy })) ?? {};
    case 'blockRef': return { x: object.x + dx, y: object.y + dy };
    case 'text': return { x: object.x + dx, y: object.y + dy };
  }
}

export function dimensionText(dim: DimensionObj, objects: CadObject[]): string {
  return dimensionValue(dim, objects);
}

// ─── Transformations d'édition (rotation, miroir, échelle, décalage) ────────
// Fonctions pures : elles retournent un patch partiel, comme moveObject.

function rotatePoint(px: number, py: number, cx: number, cy: number, rad: number): Point {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: round(cx + dx * c - dy * s), y: round(cy + dx * s + dy * c) };
}

/** Rotation autour d'un centre, angle en degrés (sens trigonométrique, Y descendant). */
/**
 * Les hachures suivent l'objet : l'angle tourne avec lui, le pas modèle suit l'échelle et l'origine
 * (relative à l'emprise) suit la transformation. Un motif propre aux paramètres par défaut les reçoit
 * explicitement ; le motif d'un objet à matériau reste celui du profil de dessin.
 */
function withHatch(object: CadObject, patch: Partial<CadObject> | null, change: (h: HatchParams) => HatchParams, mapPoint: (p: Point) => Point): Partial<CadObject> | null {
  if (!patch) return patch;
  const patterned = !object.materialId && (object.hatch === 'diagonal' || object.hatch === 'cross');
  const current = object.hatchParams ?? (patterned ? hatchParamsOf(object) : null);
  if (!current) return patch;
  let next = change(current);
  if (current.originX !== undefined || current.originY !== undefined) {
    const before = objectBounds(object, [], []);
    const after = objectBounds({ ...object, ...patch } as CadObject, [], []);
    if (before && after) {
      const origin = mapPoint({ x: before.minX + (current.originX ?? 0), y: before.minY + (current.originY ?? 0) });
      next = { ...next, originX: origin.x - after.minX, originY: origin.y - after.minY };
    }
  }
  return { ...patch, hatchParams: next };
}

export function rotateObject(object: CadObject, cx: number, cy: number, angleDeg: number): Partial<CadObject> | null {
  // angleDeg > 0 : sens horaire à l'écran ; l'angle des hachures est antihoraire.
  const rad = (angleDeg * Math.PI) / 180;
  return withHatch(object, rotateObjectGeometry(object, cx, cy, angleDeg), h => ({ ...h, angle: norm360(h.angle - angleDeg) }), p => rotatePoint(p.x, p.y, cx, cy, rad));
}

function rotateObjectGeometry(object: CadObject, cx: number, cy: number, angleDeg: number): Partial<CadObject> | null {
  const rad = (angleDeg * Math.PI) / 180;
  switch (object.kind) {
    case 'line':
    case 'wall': {
      const a = rotatePoint(object.x1, object.y1, cx, cy, rad);
      const b = rotatePoint(object.x2, object.y2, cx, cy, rad);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case 'rect': {
      if (Math.abs(((angleDeg % 90) + 90) % 90) > 1e-9) return null; // rectangles axis-aligned : multiples de 90° seulement
      const a = rotatePoint(object.x, object.y, cx, cy, rad);
      const b = rotatePoint(object.x + object.w, object.y + object.h, cx, cy, rad);
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    }
    case 'circle': {
      const p = rotatePoint(object.cx, object.cy, cx, cy, rad);
      return { cx: p.x, cy: p.y };
    }
    case 'arc': {
      // angleDeg > 0 = sens horaire à l'écran = angles DXF décroissants.
      const p = rotatePoint(object.cx, object.cy, cx, cy, rad);
      return { cx: p.x, cy: p.y, start: norm360(object.start - angleDeg), end: norm360(object.end - angleDeg) };
    }
    case 'polyline': {
      const points: number[] = [];
      for (let i = 0; i + 1 < object.points.length; i += 2) {
        const p = rotatePoint(object.points[i], object.points[i + 1], cx, cy, rad);
        points.push(p.x, p.y);
      }
      return { points };
    }
    case 'blockRef': {
      const p = rotatePoint(object.x, object.y, cx, cy, rad);
      return { x: p.x, y: p.y };
    }
    case 'dimension':
      return null; // cote associative : elle suit sa cible
    case 'pdim':
      return transformPdim(object, q => rotatePoint(q.x, q.y, cx, cy, rad), { rotation: angleDeg });
    case 'opening':
      return {};
    case 'text': {
      // angleDeg > 0 tourne dans le sens horaire à l'écran ; la rotation du texte est trigonométrique (repère DXF).
      const p = rotatePoint(object.x, object.y, cx, cy, rad);
      return { x: p.x, y: p.y, rotation: normalizeAngle(object.rotation - angleDeg) };
    }
  }
}

/** Symétrie par rapport à un axe vertical ('x' = valeur X de l'axe) ou horizontal. */
export function mirrorObject(object: CadObject, axis: 'x' | 'y', value: number): Partial<CadObject> {
  return withHatch(object, mirrorObjectGeometry(object, axis, value), h => ({ ...h, angle: norm360(axis === 'x' ? 180 - h.angle : -h.angle) }),
    p => (axis === 'x' ? { x: 2 * value - p.x, y: p.y } : { x: p.x, y: 2 * value - p.y })) ?? {};
}

function mirrorObjectGeometry(object: CadObject, axis: 'x' | 'y', value: number): Partial<CadObject> {
  const mx = (v: number) => round(2 * value - v);
  switch (object.kind) {
    case 'line':
      return axis === 'x'
        ? { x1: mx(object.x1), x2: mx(object.x2) }
        : { y1: mx(object.y1), y2: mx(object.y2) };
    case 'wall': {
      // La symétrie inverse le côté : un mur au nu gauche devient au nu droit.
      const justification = object.justification === 'gauche' ? 'droite' as const : object.justification === 'droite' ? 'gauche' as const : 'axe' as const;
      return axis === 'x'
        ? { x1: mx(object.x1), x2: mx(object.x2), justification }
        : { y1: mx(object.y1), y2: mx(object.y2), justification };
    }
    case 'rect':
      return axis === 'x'
        ? { x: mx(object.x + object.w) }
        : { y: mx(object.y + object.h) };
    case 'circle':
      return axis === 'x' ? { cx: mx(object.cx) } : { cy: mx(object.cy) };
    case 'arc':
      // Symétrie : l'angle θ devient 180° − θ (axe vertical) ou −θ (axe horizontal) et le sens s'inverse.
      return axis === 'x'
        ? { cx: mx(object.cx), start: norm360(180 - object.end), end: norm360(180 - object.start) }
        : { cy: mx(object.cy), start: norm360(-object.end), end: norm360(-object.start) };
    case 'polyline':
      return { points: object.points.map((v, i) => (i % 2 === 0) === (axis === 'x') ? mx(v) : v) };
    case 'blockRef':
      return axis === 'x' ? { x: mx(object.x) } : { y: mx(object.y) };
    case 'dimension':
      return { offset: -object.offset };
    case 'pdim':
      return transformPdim(object, q => (axis === 'x' ? { x: mx(q.x), y: q.y } : { x: q.x, y: mx(q.y) })) ?? {};
    case 'opening':
      return {};
    case 'text':
      // Le texte reste lisible (pas de lettres en miroir) : seul son point d'insertion est symétrisé.
      return axis === 'x' ? { x: mx(object.x) } : { y: mx(object.y) };
  }
}

/** Homothétie depuis un centre fixe. */
export function scaleObject(object: CadObject, cx: number, cy: number, factor: number): Partial<CadObject> | null {
  return withHatch(object, scaleObjectGeometry(object, cx, cy, factor), h => (h.unit === 'modele' ? { ...h, spacing: h.spacing * factor } : h),
    p => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor }));
}

function scaleObjectGeometry(object: CadObject, cx: number, cy: number, factor: number): Partial<CadObject> | null {
  if (!(factor > 0) || !Number.isFinite(factor)) return null;
  const s = (v: number, c: number) => round(c + (v - c) * factor);
  switch (object.kind) {
    case 'line': return { x1: s(object.x1, cx), y1: s(object.y1, cy), x2: s(object.x2, cx), y2: s(object.y2, cy) };
    case 'wall': return { x1: s(object.x1, cx), y1: s(object.y1, cy), x2: s(object.x2, cx), y2: s(object.y2, cy), thickness: round(object.thickness * factor) };
    case 'rect': return { x: s(object.x, cx), y: s(object.y, cy), w: round(object.w * factor), h: round(object.h * factor) };
    case 'circle': return { cx: s(object.cx, cx), cy: s(object.cy, cy), r: round(object.r * factor) };
    case 'arc': return { cx: s(object.cx, cx), cy: s(object.cy, cy), r: round(object.r * factor) };
    case 'polyline': return { points: object.points.map((v, i) => s(v, i % 2 === 0 ? cx : cy)) };
    case 'blockRef': return { x: s(object.x, cx), y: s(object.y, cy), scale: round(object.scale * factor) };
    case 'dimension': return { offset: round(object.offset * factor) };
    case 'pdim': return transformPdim(object, q => ({ x: s(q.x, cx), y: s(q.y, cy) }), { factor });
    case 'opening': return { position: round(object.position * factor), width: round(object.width * factor) };
    case 'text': return { x: s(object.x, cx), y: s(object.y, cy), height: round(object.height * factor) };
  }
}

/**
 * Décalage parallèle (offset) : ligne → parallèle à distance d (normale gauche),
 * rectangle et cercle → dilatation/ contraction de d, polyligne non supportée.
 */
export function offsetObject(object: CadObject, d: number): Partial<CadObject> | null {
  switch (object.kind) {
    case 'line': {
      const len = Math.hypot(object.x2 - object.x1, object.y2 - object.y1);
      if (len < 1e-9) return null;
      const nx = (-(object.y2 - object.y1) / len) * d;
      const ny = ((object.x2 - object.x1) / len) * d;
      return { x1: object.x1 + nx, y1: object.y1 + ny, x2: object.x2 + nx, y2: object.y2 + ny };
    }
    case 'rect': {
      const w = object.w + 2 * d;
      const h = object.h + 2 * d;
      if (!(w > 0) || !(h > 0)) return null;
      return { x: object.x - d, y: object.y - d, w, h };
    }
    case 'circle':
    case 'arc': {
      const r = object.r + d;
      if (!(r > 0)) return null;
      return { r };
    }
    case 'polyline':
    case 'dimension':
    case 'pdim':
    case 'blockRef':
    case 'text':
    case 'wall':
    case 'opening':
      return null;
  }
}

/** Centre géométrique d'un objet — pivot par défaut des transformations. */
export function objectCenter(object: CadObject, blocks: BlockDef[], objects: CadObject[]): Point | null {
  const b = objectBounds(object, blocks, objects);
  return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : null;
}

/** Centre commun d'une sélection (pour rotation / miroir groupés). */
export function selectionCenter(ids: string[], objects: CadObject[], blocks: BlockDef[]): Point | null {
  const bounds = ids
    .map(id => objects.find(o => o.id === id))
    .filter((o): o is CadObject => !!o)
    .map(o => objectBounds(o, blocks, objects))
    .filter((b): b is Bounds => !!b);
  const u = unionBounds(bounds);
  if (!u) return null;
  return { x: (u.minX + u.maxX) / 2, y: (u.minY + u.maxY) / 2 };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
