// Ajuster (couper) et prolonger : fonctions pures sur la géométrie de l'atelier.
// Mode rapide : toutes les autres entités visibles servent d'arêtes de coupe ou de limites.
// Repère écran (Y vers le bas) ; angles d'arc en degrés, repère DXF (cf. arc.ts).
import type { ArcObj, CadObject, LineObj } from '@/types/cad';
import { isClosedPolyline } from '@/types/cad';
import { wallQuad } from '@/lib/wall';
import { angleInArc, angleOf, arcPointAt, arcSweep, norm360 } from '@/lib/arc';

export interface P { x: number; y: number }
interface Seg { x1: number; y1: number; x2: number; y2: number }
interface Circ { cx: number; cy: number; r: number; arc?: { start: number; end: number } }
interface Edges { segs: Seg[]; circs: Circ[] }

const EPS = 1e-9;
const PARAM_EPS = 1e-7;

/** Géométrie d'arête d'un objet (segments et cercles/arcs). Textes, cotes et blocs ne coupent pas. */
export function edgesOf(o: CadObject): Edges {
  const segs: Seg[] = [];
  const circs: Circ[] = [];
  switch (o.kind) {
    case 'line': segs.push({ x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 }); break;
    case 'wall': {
      // Les faces d'un mur servent d'arêtes de coupe.
      const q = wallQuad(o);
      if (q) for (let i = 0; i < 4; i++) segs.push({ x1: q[i].x, y1: q[i].y, x2: q[(i + 1) % 4].x, y2: q[(i + 1) % 4].y });
      break;
    }
    case 'rect': {
      const c = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
      for (let i = 0; i < 4; i++) segs.push({ x1: c[i][0], y1: c[i][1], x2: c[(i + 1) % 4][0], y2: c[(i + 1) % 4][1] });
      break;
    }
    case 'polyline':
      for (let i = 0; i + 3 < o.points.length; i += 2) segs.push({ x1: o.points[i], y1: o.points[i + 1], x2: o.points[i + 2], y2: o.points[i + 3] });
      break;
    case 'circle': circs.push({ cx: o.cx, cy: o.cy, r: o.r }); break;
    case 'arc': circs.push({ cx: o.cx, cy: o.cy, r: o.r, arc: { start: o.start, end: o.end } }); break;
    default: break;
  }
  return { segs, circs };
}

function mergeEdges(objects: CadObject[]): Edges {
  const all: Edges = { segs: [], circs: [] };
  for (const o of objects) {
    const e = edgesOf(o);
    all.segs.push(...e.segs);
    all.circs.push(...e.circs);
  }
  return all;
}

const onCirc = (c: Circ, p: P) => !c.arc || angleInArc({ cx: c.cx, cy: c.cy, r: c.r, ...c.arc }, angleOf(c.cx, c.cy, p), 1e-6);

/** Paramètres t (le long de a→b, non bornés) où la droite (a,b) coupe les arêtes ; les arêtes sont bornées. */
function lineHits(a: P, b: P, edges: Edges): number[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const out: number[] = [];
  for (const s of edges.segs) {
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < EPS) continue;
    const t = ((s.x1 - a.x) * ey - (s.y1 - a.y) * ex) / den;
    const u = ((s.x1 - a.x) * dy - (s.y1 - a.y) * dx) / den;
    if (u >= -PARAM_EPS && u <= 1 + PARAM_EPS) out.push(t);
  }
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return out;
  for (const c of edges.circs) {
    const fx = a.x - c.cx, fy = a.y - c.cy;
    const bb = 2 * (fx * dx + fy * dy);
    const cc = fx * fx + fy * fy - c.r * c.r;
    const disc = bb * bb - 4 * len2 * cc;
    if (disc < -EPS) continue;
    const root = Math.sqrt(Math.max(0, disc));
    for (const t of [(-bb - root) / (2 * len2), (-bb + root) / (2 * len2)]) {
      if (onCirc(c, { x: a.x + t * dx, y: a.y + t * dy })) out.push(t);
    }
  }
  return out;
}

/** Angles (repère DXF) où le cercle (cx, cy, r) coupe les arêtes. */
function circleHits(cx: number, cy: number, r: number, edges: Edges): number[] {
  const pts: P[] = [];
  for (const s of edges.segs) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const a = dx * dx + dy * dy;
    if (a < EPS) continue;
    const fx = s.x1 - cx, fy = s.y1 - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < -EPS) continue;
    const root = Math.sqrt(Math.max(0, disc));
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      if (t >= -PARAM_EPS && t <= 1 + PARAM_EPS) pts.push({ x: s.x1 + t * dx, y: s.y1 + t * dy });
    }
  }
  for (const o of edges.circs) {
    const dx = o.cx - cx, dy = o.cy - cy;
    const d = Math.hypot(dx, dy);
    if (d < EPS || d > r + o.r + 1e-7 || d < Math.abs(r - o.r) - 1e-7) continue;
    const aa = (r * r - o.r * o.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r * r - aa * aa));
    const xm = cx + (aa * dx) / d, ym = cy + (aa * dy) / d;
    for (const p of [{ x: xm + (h * dy) / d, y: ym - (h * dx) / d }, { x: xm - (h * dy) / d, y: ym + (h * dx) / d }]) {
      if (onCirc(o, p)) pts.push(p);
    }
  }
  return pts.map(p => angleOf(cx, cy, p));
}

function uniqueSorted(values: number[], eps = 1e-6): number[] {
  const sorted = [...values].sort((x, y) => x - y);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > eps) out.push(v);
  return out;
}

const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Résultat d'une édition : modifications de l'objet d'origine (ou suppression) et nouveaux objets. */
export interface EditResult {
  patch: Partial<CadObject> | null;
  remove: boolean;
  added: Partial<CadObject>[];
}

// ─── Ajuster ────────────────────────────────────────────────────────────────

/**
 * Coupe la portion de `target` comprise entre les deux intersections qui encadrent `pick`.
 * Renvoie null si aucune arête ne coupe l'objet à cet endroit.
 */
export function trimObject(target: CadObject, others: CadObject[], pick: P): EditResult | null {
  const edges = mergeEdges(others.filter(o => o.id !== target.id));
  switch (target.kind) {
    case 'line': return trimLine(target, edges, pick);
    case 'arc': return trimArc(target, edges, pick);
    case 'circle': return trimCircle(target.cx, target.cy, target.r, edges, pick);
    case 'polyline': return trimPolyline(target.points, isClosedPolyline(target), edges, pick);
    case 'rect': {
      const pts = [target.x, target.y, target.x + target.w, target.y, target.x + target.w, target.y + target.h, target.x, target.y + target.h, target.x, target.y];
      const res = trimPolyline(pts, true, edges, pick);
      // Le rectangle coupé devient une polyligne ouverte.
      return res && { ...res, remove: true, patch: null, added: res.patch ? [{ kind: 'polyline', ...res.patch } as Partial<CadObject>, ...res.added] : res.added };
    }
    default: return null;
  }
}

function trimLine(l: LineObj, edges: Edges, pick: P): EditResult | null {
  const a = { x: l.x1, y: l.y1 }, b = { x: l.x2, y: l.y2 };
  const ts = uniqueSorted(lineHits(a, b, edges).filter(t => t > PARAM_EPS && t < 1 - PARAM_EPS));
  if (ts.length === 0) return null;
  const t0 = projectParam(a, b, pick);
  const cuts = [0, ...ts, 1];
  let i = cuts.findIndex((c, k) => k < cuts.length - 1 && t0 >= c && t0 <= cuts[k + 1]);
  if (i < 0) i = t0 < 0 ? 0 : cuts.length - 2;
  const lo = cuts[i], hi = cuts[i + 1];
  const pieces: [number, number][] = [];
  if (lo > PARAM_EPS) pieces.push([0, lo]);
  if (hi < 1 - PARAM_EPS) pieces.push([hi, 1]);
  const asLine = ([u, v]: [number, number]) => {
    const p = lerp(a, b, u), q = lerp(a, b, v);
    return { x1: r6(p.x), y1: r6(p.y), x2: r6(q.x), y2: r6(q.y) };
  };
  if (pieces.length === 0) return { patch: null, remove: true, added: [] };
  return { patch: asLine(pieces[0]), remove: false, added: pieces.slice(1).map(p => ({ kind: 'line', ...asLine(p) }) as Partial<CadObject>) };
}

function trimArc(arc: ArcObj, edges: Edges, pick: P): EditResult | null {
  const sweep = arcSweep(arc);
  const offs = uniqueSorted(
    circleHits(arc.cx, arc.cy, arc.r, edges)
      .map(a => norm360(a - arc.start))
      .filter(o => o > 1e-6 && o < sweep - 1e-6),
  );
  if (offs.length === 0) return null;
  const o0 = norm360(angleOf(arc.cx, arc.cy, pick) - arc.start);
  const cuts = [0, ...offs, sweep];
  let i = cuts.findIndex((c, k) => k < cuts.length - 1 && o0 >= c && o0 <= cuts[k + 1]);
  if (i < 0) i = o0 > sweep + (360 - sweep) / 2 ? 0 : cuts.length - 2; // hors de l'arc : extrémité la plus proche
  const pieces: [number, number][] = [];
  if (cuts[i] > 1e-6) pieces.push([0, cuts[i]]);
  if (cuts[i + 1] < sweep - 1e-6) pieces.push([cuts[i + 1], sweep]);
  const asArc = ([u, v]: [number, number]) => ({ start: norm360(arc.start + u), end: norm360(arc.start + v) });
  if (pieces.length === 0) return { patch: null, remove: true, added: [] };
  return { patch: asArc(pieces[0]), remove: false, added: pieces.slice(1).map(p => ({ kind: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r, ...asArc(p) }) as Partial<CadObject>) };
}

function trimCircle(cx: number, cy: number, r: number, edges: Edges, pick: P): EditResult | null {
  const angles = uniqueSorted(circleHits(cx, cy, r, edges).map(norm360));
  if (angles.length < 2) return null;
  const a0 = angleOf(cx, cy, pick);
  // Intervalle [a_i, a_{i+1}] (circulaire) qui contient le point désigné : il est retiré.
  let k = angles.length - 1;
  for (let i = 0; i < angles.length; i++) {
    const from = angles[i], to = angles[(i + 1) % angles.length];
    const span = norm360(to - from) || 360;
    if (norm360(a0 - from) <= span) { k = i; break; }
  }
  const removedFrom = angles[k], removedTo = angles[(k + 1) % angles.length];
  // Le cercle devient un arc : de la fin de la partie retirée jusqu'à son début.
  return { patch: null, remove: true, added: [{ kind: 'arc', cx, cy, r, start: norm360(removedTo), end: norm360(removedFrom) } as Partial<CadObject>] };
}

/** Abscisses curvilignes cumulées des sommets. */
function cumulative(points: number[]): number[] {
  const s = [0];
  for (let i = 2; i < points.length; i += 2) s.push(s[s.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]));
  return s;
}

function pointAtS(points: number[], cum: number[], s: number): P {
  for (let i = 1; i < cum.length; i++) {
    if (s <= cum[i] + 1e-9) {
      const seg = cum[i] - cum[i - 1];
      const t = seg > EPS ? (s - cum[i - 1]) / seg : 0;
      return lerp({ x: points[2 * i - 2], y: points[2 * i - 1] }, { x: points[2 * i], y: points[2 * i + 1] }, t);
    }
  }
  return { x: points[points.length - 2], y: points[points.length - 1] };
}

/** Sous-polyligne entre deux abscisses (sommets intermédiaires conservés). */
function slice(points: number[], cum: number[], s0: number, s1: number): number[] {
  const p0 = pointAtS(points, cum, s0), p1 = pointAtS(points, cum, s1);
  const out = [r6(p0.x), r6(p0.y)];
  for (let i = 1; i < cum.length - 1; i++) if (cum[i] > s0 + 1e-9 && cum[i] < s1 - 1e-9) out.push(points[2 * i], points[2 * i + 1]);
  out.push(r6(p1.x), r6(p1.y));
  return out;
}

function trimPolyline(points: number[], closed: boolean, edges: Edges, pick: P): EditResult | null {
  const cum = cumulative(points);
  const total = cum[cum.length - 1];
  if (total < EPS) return null;
  // Intersections le long de chaque segment, converties en abscisse curviligne.
  const hits: number[] = [];
  let pickS = 0, best = Infinity;
  for (let i = 1; i < cum.length; i++) {
    const a = { x: points[2 * i - 2], y: points[2 * i - 1] }, b = { x: points[2 * i], y: points[2 * i + 1] };
    const len = cum[i] - cum[i - 1];
    for (const t of lineHits(a, b, edges)) if (t > -PARAM_EPS && t < 1 + PARAM_EPS) hits.push(cum[i - 1] + Math.min(1, Math.max(0, t)) * len);
    const t0 = Math.min(1, Math.max(0, projectParam(a, b, pick)));
    const q = lerp(a, b, t0);
    const d = Math.hypot(q.x - pick.x, q.y - pick.y);
    if (d < best) { best = d; pickS = cum[i - 1] + t0 * len; }
  }
  const cuts = uniqueSorted(hits.filter(s => closed || (s > 1e-6 && s < total - 1e-6)));
  if (!closed) {
    if (cuts.length === 0) return null;
    const all = [0, ...cuts, total];
    let i = all.findIndex((c, k) => k < all.length - 1 && pickS >= c && pickS <= all[k + 1]);
    if (i < 0) i = 0;
    const pieces: [number, number][] = [];
    if (all[i] > 1e-6) pieces.push([0, all[i]]);
    if (all[i + 1] < total - 1e-6) pieces.push([all[i + 1], total]);
    if (pieces.length === 0) return { patch: null, remove: true, added: [] };
    const asPoly = ([u, v]: [number, number]) => ({ points: slice(points, cum, u, v) });
    return { patch: asPoly(pieces[0]), remove: false, added: pieces.slice(1).map(p => ({ kind: 'polyline', ...asPoly(p) }) as Partial<CadObject>) };
  }
  // Contour fermé : il faut au moins deux coupures ; la partie retirée est celle qui contient le point.
  const cyc = uniqueSorted(cuts.map(s => ((s % total) + total) % total));
  if (cyc.length < 2) return null;
  let k = cyc.length - 1;
  for (let i = 0; i < cyc.length; i++) {
    const from = cyc[i], to = cyc[(i + 1) % cyc.length];
    const span = (((to - from) % total) + total) % total || total;
    if ((((pickS - from) % total) + total) % total <= span) { k = i; break; }
  }
  const keepFrom = cyc[(k + 1) % cyc.length], keepTo = cyc[k];
  // Partie conservée : de keepFrom à keepTo en parcourant le contour (en passant éventuellement par l'origine).
  const kept = keepFrom < keepTo
    ? slice(points, cum, keepFrom, keepTo)
    : [...slice(points, cum, keepFrom, total), ...slice(points, cum, 0, keepTo).slice(2)];
  return { patch: { points: kept }, remove: false, added: [] };
}

function projectParam(a: P, b: P, p: P): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  return l2 < EPS ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
}

// ─── Prolonger ─────────────────────────────────────────────────────────────

/**
 * Prolonge l'extrémité de `target` la plus proche de `pick` jusqu'à la première arête rencontrée.
 * Lignes, arcs et polylignes ouvertes. Renvoie null s'il n'y a rien à atteindre.
 */
export function extendObject(target: CadObject, others: CadObject[], pick: P): EditResult | null {
  const edges = mergeEdges(others.filter(o => o.id !== target.id));
  if (target.kind === 'line') {
    const a = { x: target.x1, y: target.y1 }, b = { x: target.x2, y: target.y2 };
    const atEnd = Math.hypot(pick.x - b.x, pick.y - b.y) <= Math.hypot(pick.x - a.x, pick.y - a.y);
    const hits = lineHits(a, b, edges);
    if (atEnd) {
      const t = Math.min(...hits.filter(t => t > 1 + PARAM_EPS), Infinity);
      if (!Number.isFinite(t)) return null;
      const p = lerp(a, b, t);
      return { patch: { x2: r6(p.x), y2: r6(p.y) }, remove: false, added: [] };
    }
    const t = Math.max(...hits.filter(t => t < -PARAM_EPS), -Infinity);
    if (!Number.isFinite(t)) return null;
    const p = lerp(a, b, t);
    return { patch: { x1: r6(p.x), y1: r6(p.y) }, remove: false, added: [] };
  }
  if (target.kind === 'arc') {
    const sweep = arcSweep(target);
    const s = arcPointAt(target, target.start), e = arcPointAt(target, target.start + sweep);
    const atEnd = Math.hypot(pick.x - e.x, pick.y - e.y) <= Math.hypot(pick.x - s.x, pick.y - s.y);
    const angles = circleHits(target.cx, target.cy, target.r, edges);
    if (atEnd) {
      // Premier angle rencontré après la fin, dans le sens de l'arc, sans refermer le cercle.
      const ext = Math.min(...angles.map(a => norm360(a - target.end)).filter(d => d > 1e-6 && d < 360 - sweep - 1e-6), Infinity);
      if (!Number.isFinite(ext)) return null;
      return { patch: { end: norm360(target.end + ext) }, remove: false, added: [] };
    }
    const ext = Math.min(...angles.map(a => norm360(target.start - a)).filter(d => d > 1e-6 && d < 360 - sweep - 1e-6), Infinity);
    if (!Number.isFinite(ext)) return null;
    return { patch: { start: norm360(target.start - ext) }, remove: false, added: [] };
  }
  if (target.kind === 'polyline' && !isClosedPolyline(target as CadObject) && target.points.length >= 4) {
    const p = target.points, n = p.length;
    const first = { x: p[0], y: p[1] }, last = { x: p[n - 2], y: p[n - 1] };
    const atEnd = Math.hypot(pick.x - last.x, pick.y - last.y) <= Math.hypot(pick.x - first.x, pick.y - first.y);
    if (atEnd) {
      const a = { x: p[n - 4], y: p[n - 3] };
      const t = Math.min(...lineHits(a, last, edges).filter(t => t > 1 + PARAM_EPS), Infinity);
      if (!Number.isFinite(t)) return null;
      const q = lerp(a, last, t);
      return { patch: { points: [...p.slice(0, n - 2), r6(q.x), r6(q.y)] }, remove: false, added: [] };
    }
    const b = { x: p[2], y: p[3] };
    const t = Math.max(...lineHits(first, b, edges).filter(t => t < -PARAM_EPS), -Infinity);
    if (!Number.isFinite(t)) return null;
    const q = lerp(first, b, t);
    return { patch: { points: [r6(q.x), r6(q.y), ...p.slice(2)] }, remove: false, added: [] };
  }
  return null;
}
