// Contraintes dans l'atelier (lot 12.1) : passage des objets du dessin à l'esquisse du solveur retenu
// par la note de décision P0 (solveur écrit pour DrawAll, lot 11.1), et retour.
// Points : extrémités de ligne (a, b), centres de cercle et d'arc (c), sommets de polyligne repérés
// par un identifiant permanent (v:<id>). Une référence qui ne se retrouve plus est « à réparer » :
// la contrainte est mise de côté, jamais reportée sur un autre élément. Fonctions pures.
import type { CadObject, CurveRef, GeoConstraint, PointRef, PolylineObj, SegRef } from '@/types/cad';
import { isClosedPolyline } from '@/types/cad';
import type { Constraint, Sketch } from './sketch';
import { solveSketch } from './solver';

type Pt = { x: number; y: number };

export const CONSTRAINT_LABEL: Record<GeoConstraint['type'], string> = {
  coincident: 'Coïncidence', horizontal: 'Horizontale', vertical: 'Verticale', parallel: 'Parallèle', perpendicular: 'Perpendiculaire',
  equal: 'Égalité de longueur', distance: 'Distance', length: 'Longueur', radius: 'Rayon', tangent: 'Tangence', fixed: 'Fixe',
};

/** Éléments à désigner, dans l'ordre, pour chaque type. */
export const CONSTRAINT_PICKS: Record<GeoConstraint['type'], ('point' | 'seg' | 'curve')[]> = {
  coincident: ['point', 'point'], horizontal: ['seg'], vertical: ['seg'], parallel: ['seg', 'seg'], perpendicular: ['seg', 'seg'],
  equal: ['seg', 'seg'], distance: ['point', 'point'], length: ['seg'], radius: ['curve'], tangent: ['seg', 'curve'], fixed: ['point'],
};

// ─── Identifiants permanents des sommets de polyligne ─────────────────────────

/** Les identifiants de sommets sont-ils à jour (un par point enregistré, fermeture comprise) ? */
export function vertexIdsValid(o: PolylineObj): boolean {
  const n = o.points.length / 2;
  if (!o.vids || o.vids.length !== n) return false;
  const closed: boolean = isClosedPolyline(o), vids = o.vids;
  const distinct = closed ? vids.slice(0, -1) : vids;
  return new Set(distinct).size === distinct.length && (!closed || vids[0] === vids[n - 1]);
}

/** Polyligne munie d'identifiants de sommets (gardés s'ils sont à jour). Fermée : le dernier point reprend le premier. */
export function withVertexIds(o: PolylineObj): PolylineObj {
  if (vertexIdsValid(o)) return o;
  // Identifiants neufs, jamais repris : des identifiants périmés (sommets ajoutés ou retirés depuis)
  // restent sans sommet, et les contraintes qui les citent restent « à réparer ».
  const start = Math.max(0, ...(o.vids ?? []).map(v => Number(/^v(\d+)$/.exec(v)?.[1] ?? 0))) + 1;
  const n = o.points.length / 2, closed: boolean = isClosedPolyline(o);
  const vids = Array.from({ length: n }, (_, i) => `v${start + i}`);
  if (closed) vids[n - 1] = vids[0];
  return { ...o, vids };
}

// ─── Lecture des références ───────────────────────────────────────────────────

const pid = (obj: string, at: string) => `${obj}|${at}`;
const byId = (objects: CadObject[]) => new Map(objects.map(o => [o.id, o]));

/** Coordonnées d'un point désigné, ou null s'il ne se retrouve plus. */
export function pointOf(objects: Map<string, CadObject> | CadObject[], r: PointRef): Pt | null {
  const o = (objects instanceof Map ? objects : byId(objects)).get(r.obj);
  if (!o) return null;
  if (o.kind === 'line') return r.at === 'a' ? { x: o.x1, y: o.y1 } : r.at === 'b' ? { x: o.x2, y: o.y2 } : null;
  if (o.kind === 'circle' || o.kind === 'arc') return r.at === 'c' ? { x: o.cx, y: o.cy } : null;
  if (o.kind === 'polyline' && r.at.startsWith('v:') && vertexIdsValid(o)) {
    const i = o.vids!.indexOf(r.at.slice(2));
    return i < 0 ? null : { x: o.points[2 * i], y: o.points[2 * i + 1] };
  }
  return null;
}

/** Extrémités d'un segment désigné, ou null. */
export function segOf(objects: Map<string, CadObject> | CadObject[], r: SegRef): [Pt, Pt, string, string] | null {
  const o = (objects instanceof Map ? objects : byId(objects)).get(r.obj);
  if (!o) return null;
  if (o.kind === 'line' && r.from === undefined) return [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }, 'a', 'b'];
  if (o.kind === 'polyline' && r.from !== undefined && vertexIdsValid(o)) {
    const i = o.vids!.indexOf(r.from);
    if (i < 0 || 2 * i + 3 >= o.points.length) return null;
    return [{ x: o.points[2 * i], y: o.points[2 * i + 1] }, { x: o.points[2 * i + 2], y: o.points[2 * i + 3] }, `v:${o.vids![i]}`, `v:${o.vids![i + 1]}`];
  }
  return null;
}

export function curveOf(objects: Map<string, CadObject> | CadObject[], r: CurveRef): { c: Pt; r: number } | null {
  const o = (objects instanceof Map ? objects : byId(objects)).get(r.obj);
  return o && (o.kind === 'circle' || o.kind === 'arc') ? { c: { x: o.cx, y: o.cy }, r: o.r } : null;
}

/** Objets visés par une contrainte. */
export function constraintObjects(k: GeoConstraint): string[] {
  switch (k.type) {
    case 'coincident': case 'distance': return [k.a.obj, k.b.obj];
    case 'horizontal': case 'vertical': case 'length': return [k.seg.obj];
    case 'parallel': case 'perpendicular': case 'equal': return [k.s1.obj, k.s2.obj];
    case 'radius': return [k.curve.obj];
    case 'tangent': return [k.seg.obj, k.curve.obj];
    case 'fixed': return [k.p.obj];
  }
}

/** La contrainte se résout-elle sur les objets actuels ? */
export function resolvable(objects: Map<string, CadObject>, k: GeoConstraint): boolean {
  switch (k.type) {
    case 'coincident': case 'distance': return !!pointOf(objects, k.a) && !!pointOf(objects, k.b);
    case 'horizontal': case 'vertical': case 'length': return !!segOf(objects, k.seg);
    case 'parallel': case 'perpendicular': case 'equal': return !!segOf(objects, k.s1) && !!segOf(objects, k.s2);
    case 'radius': return !!curveOf(objects, k.curve);
    case 'tangent': return !!segOf(objects, k.seg) && !!curveOf(objects, k.curve);
    case 'fixed': return !!pointOf(objects, k.p);
  }
}

// ─── Esquisse ─────────────────────────────────────────────────────────────────

export interface BuiltSketch { sketch: Sketch; unresolved: string[]; involved: Set<string> }

/** Esquisse des objets contraints ; `hold` : identifiants de points tenus à leur position actuelle. */
export function buildSketch(objects: CadObject[], constraints: GeoConstraint[], hold: Set<string> = new Set()): BuiltSketch {
  const map = byId(objects);
  const unresolved: string[] = [], ok: GeoConstraint[] = [];
  for (const k of constraints) { if (resolvable(map, k)) ok.push(k); else unresolved.push(k.id); }
  const involved = new Set(ok.flatMap(constraintObjects));
  const sketch: Sketch = { points: [], lines: [], circles: [], constraints: [] };
  const addPoint = (id: string, x: number, y: number) => { if (!sketch.points.some(p => p.id === id)) sketch.points.push({ id, x, y, ...(hold.has(id) ? { fixed: true } : {}) }); };
  for (const id of involved) {
    const o = map.get(id)!;
    if (o.kind === 'line') {
      addPoint(pid(id, 'a'), o.x1, o.y1); addPoint(pid(id, 'b'), o.x2, o.y2);
      sketch.lines.push({ id: pid(id, 'seg'), p1: pid(id, 'a'), p2: pid(id, 'b') });
    } else if (o.kind === 'circle' || o.kind === 'arc') {
      addPoint(pid(id, 'c'), o.cx, o.cy);
      sketch.circles.push({ id: pid(id, 'curve'), c: pid(id, 'c'), r: o.r });
    } else if (o.kind === 'polyline') {
      const v = o.vids!;
      for (let i = 0; i < v.length; i++) addPoint(pid(id, `v:${v[i]}`), o.points[2 * i], o.points[2 * i + 1]);
      for (let i = 0; i + 1 < v.length; i++) sketch.lines.push({ id: pid(id, `s:${v[i]}`), p1: pid(id, `v:${v[i]}`), p2: pid(id, `v:${v[i + 1]}`) });
    }
  }
  const P = (r: PointRef) => pid(r.obj, r.at);
  const S = (r: SegRef) => (r.from === undefined ? pid(r.obj, 'seg') : pid(r.obj, `s:${r.from}`));
  const C = (r: CurveRef) => pid(r.obj, 'curve');
  for (const k of ok) {
    let c: Constraint | null = null;
    switch (k.type) {
      case 'coincident': c = { id: k.id, type: 'coincident', a: P(k.a), b: P(k.b) }; break;
      case 'horizontal': case 'vertical': c = { id: k.id, type: k.type, line: S(k.seg) }; break;
      case 'parallel': case 'perpendicular': case 'equal': c = { id: k.id, type: k.type, l1: S(k.s1), l2: S(k.s2) }; break;
      case 'distance': c = { id: k.id, type: 'distance', a: P(k.a), b: P(k.b), value: k.value }; break;
      case 'length': c = { id: k.id, type: 'length', line: S(k.seg), value: k.value }; break;
      case 'radius': c = { id: k.id, type: 'radius', circle: C(k.curve), value: k.value }; break;
      case 'tangent': c = { id: k.id, type: 'tangent', line: S(k.seg), circle: C(k.curve) }; break;
      case 'fixed': {
        // Fixe : coïncidence avec une ancre immobile à la position enregistrée ; la contrainte est
        // ainsi visible du solveur (nommée dans un conflit ou une redondance comme les autres).
        const anchor = `${k.id}|ancre`;
        sketch.points.push({ id: anchor, x: k.x, y: k.y, fixed: true });
        c = { id: k.id, type: 'coincident', a: P(k.p), b: anchor };
        break;
      }
    }
    if (c) sketch.constraints.push(c);
  }
  return { sketch, unresolved, involved };
}

const r9 = (v: number) => { const r = Math.round(v * 1e9) / 1e9; return Object.is(r, -0) ? 0 : r; };

/** Reporte les positions et rayons de l'esquisse résolue sur les objets. */
export function applySketch(objects: CadObject[], sketch: Sketch, involved: Set<string>): CadObject[] {
  const pts = new Map(sketch.points.map(p => [p.id, p]));
  const circles = new Map(sketch.circles.map(c => [c.id, c]));
  const at = (id: string) => pts.get(id)!;
  return objects.map(o => {
    if (!involved.has(o.id)) return o;
    if (o.kind === 'line') {
      const a = at(pid(o.id, 'a')), b = at(pid(o.id, 'b'));
      return { ...o, x1: r9(a.x), y1: r9(a.y), x2: r9(b.x), y2: r9(b.y) };
    }
    if (o.kind === 'circle' || o.kind === 'arc') {
      const c = at(pid(o.id, 'c'));
      return { ...o, cx: r9(c.x), cy: r9(c.y), r: r9(circles.get(pid(o.id, 'curve'))!.r) };
    }
    if (o.kind === 'polyline') {
      return { ...o, points: o.vids!.flatMap(v => { const p = at(pid(o.id, `v:${v}`)); return [r9(p.x), r9(p.y)]; }) };
    }
    return o;
  });
}

/** Points de l'esquisse dont la position a changé entre deux états des objets. */
function movedPoints(prev: CadObject[], next: CadObject[], constraints: GeoConstraint[]): Set<string> {
  const a = buildSketch(prev, constraints).sketch.points, b = buildSketch(next, constraints).sketch.points;
  const before = new Map(a.map(p => [p.id, p]));
  return new Set(b.filter(p => { const q = before.get(p.id); return !q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-9; }).map(p => p.id));
}

export interface EnforceResult { objects: CadObject[]; solved: boolean }

/**
 * Re-résolution après une modification. Les points que l'utilisateur vient de déplacer sont tenus ;
 * si c'est impossible, l'esquisse est résolue sans les tenir (la modification est ramenée au plus
 * près). Si aucune solution n'existe, les objets restent tels que l'utilisateur les a laissés et le
 * diagnostic (`diagnose`) explique le conflit.
 */
export function enforceConstraints(prev: CadObject[], next: CadObject[], constraints: GeoConstraint[] | undefined): EnforceResult {
  if (!constraints?.length) return { objects: next, solved: true };
  const hold = movedPoints(prev, next, constraints);
  for (const attempt of [hold, new Set<string>()]) {
    const b = buildSketch(next, constraints, attempt);
    if (!b.sketch.constraints.length && !b.sketch.points.some(p => p.fixed)) return { objects: next, solved: true };
    const r = solveSketch(b.sketch);
    if (r.solved) return { objects: applySketch(next, r.sketch, b.involved), solved: true };
    if (!attempt.size) break;
  }
  return { objects: next, solved: false };
}

export type ConstraintState = 'satisfaite' | 'redondante' | 'conflit' | 'à réparer';
export interface Diagnosis { states: Record<string, ConstraintState>; dof: number; solved: boolean; conflicting: string[]; redundant: string[]; unresolved: string[] }

/** État de chaque contrainte : satisfaite, redondante, en conflit, ou à réparer (référence perdue). */
export function diagnose(objects: CadObject[], constraints: GeoConstraint[] | undefined): Diagnosis {
  const states: Record<string, ConstraintState> = {};
  if (!constraints?.length) return { states, dof: 0, solved: true, conflicting: [], redundant: [], unresolved: [] };
  const b = buildSketch(objects, constraints);
  const r = solveSketch(b.sketch);
  for (const k of constraints) {
    states[k.id] = b.unresolved.includes(k.id) ? 'à réparer' : r.conflicting.includes(k.id) ? 'conflit' : r.redundant.includes(k.id) ? 'redondante' : 'satisfaite';
  }
  return { states, dof: r.dof, solved: r.solved, conflicting: r.conflicting, redundant: r.redundant, unresolved: b.unresolved };
}

// ─── Désignation sur le canevas ───────────────────────────────────────────────

export type Pick =
  | { type: 'point'; ref: PointRef; at: Pt }
  | { type: 'seg'; ref: SegRef; at: Pt }
  | { type: 'curve'; ref: CurveRef; at: Pt };

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/**
 * Élément désigné près de `p` (à `tol` mm) : un point d'abord (extrémité, sommet, centre), sinon un
 * segment, sinon un cercle ou un arc. `polylines` reçoit les polylignes qui ont dû être munies
 * d'identifiants de sommets (à enregistrer avec la contrainte).
 */
export function pickElement(objects: CadObject[], p: Pt, tol: number, polylines?: Map<string, PolylineObj>): Pick | null {
  const found: { best: { d: number; pick: Pick } | null } = { best: null };
  const offer = (d: number, pick: Pick) => { if (d <= tol && (!found.best || d < found.best.d)) found.best = { d, pick }; };
  const poly = (o: PolylineObj) => polylines?.get(o.id) ?? withVertexIds(o);
  for (const o of objects) {
    if (o.kind === 'line') {
      offer(Math.hypot(p.x - o.x1, p.y - o.y1), { type: 'point', ref: { obj: o.id, at: 'a' }, at: { x: o.x1, y: o.y1 } });
      offer(Math.hypot(p.x - o.x2, p.y - o.y2), { type: 'point', ref: { obj: o.id, at: 'b' }, at: { x: o.x2, y: o.y2 } });
    } else if (o.kind === 'circle' || o.kind === 'arc') {
      offer(Math.hypot(p.x - o.cx, p.y - o.cy), { type: 'point', ref: { obj: o.id, at: 'c' }, at: { x: o.cx, y: o.cy } });
    } else if (o.kind === 'polyline') {
      const q = poly(o);
      for (let i = 0; i < q.vids!.length; i++) offer(Math.hypot(p.x - q.points[2 * i], p.y - q.points[2 * i + 1]), { type: 'point', ref: { obj: o.id, at: `v:${q.vids![i]}` }, at: { x: q.points[2 * i], y: q.points[2 * i + 1] } });
    }
  }
  if (found.best) return finish(found.best);
  for (const o of objects) {
    if (o.kind === 'line') offer(segDist(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }), { type: 'seg', ref: { obj: o.id }, at: p });
    else if (o.kind === 'polyline') {
      const q = poly(o);
      for (let i = 0; i + 1 < q.vids!.length; i++) offer(segDist(p, { x: q.points[2 * i], y: q.points[2 * i + 1] }, { x: q.points[2 * i + 2], y: q.points[2 * i + 3] }), { type: 'seg', ref: { obj: o.id, from: q.vids![i] }, at: p });
    } else if (o.kind === 'circle' || o.kind === 'arc') offer(Math.abs(Math.hypot(p.x - o.cx, p.y - o.cy) - o.r), { type: 'curve', ref: { obj: o.id }, at: p });
  }
  return found.best ? finish(found.best) : null;

  function finish(b: { pick: Pick }): Pick {
    const o = objects.find(x => x.id === b.pick.ref.obj);
    if (o?.kind === 'polyline' && polylines && !vertexIdsValid(o)) polylines.set(o.id, poly(o));
    return b.pick;
  }
}

/** Contrainte construite à partir des éléments désignés ; valeur absente : la mesure actuelle. */
export function makeConstraint(id: string, type: GeoConstraint['type'], picks: Pick[], objects: CadObject[], value?: number): GeoConstraint | { error: string } {
  const need = CONSTRAINT_PICKS[type];
  if (picks.length !== need.length || picks.some((p, i) => p.type !== need[i])) {
    const names = { point: 'un point', seg: 'un segment', curve: 'un cercle ou un arc' };
    return { error: `${CONSTRAINT_LABEL[type]} : désignez ${need.map(n => names[n]).join(' puis ')}.` };
  }
  const ref = <T,>(i: number) => picks[i].ref as T;
  const map = byId(objects);
  const v = (measured: number | null) => {
    const x = value ?? measured;
    return x !== null && x !== undefined && Number.isFinite(x) && x > 0 ? x : null;
  };
  switch (type) {
    case 'coincident': return { id, type, a: ref<PointRef>(0), b: ref<PointRef>(1) };
    case 'horizontal': case 'vertical': case 'length': {
      if (type !== 'length') return { id, type, seg: ref<SegRef>(0) };
      const s = segOf(map, ref<SegRef>(0));
      const value_ = v(s ? Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) : null);
      return value_ === null ? { error: 'Longueur : valeur positive attendue.' } : { id, type, seg: ref<SegRef>(0), value: value_ };
    }
    case 'parallel': case 'perpendicular': case 'equal':
      if (ref<SegRef>(0).obj === ref<SegRef>(1).obj && ref<SegRef>(0).from === ref<SegRef>(1).from) return { error: `${CONSTRAINT_LABEL[type]} : désignez deux segments différents.` };
      return { id, type, s1: ref<SegRef>(0), s2: ref<SegRef>(1) };
    case 'distance': {
      const a = picks[0].at, b = picks[1].at;
      const value_ = v(Math.hypot(b.x - a.x, b.y - a.y));
      return value_ === null ? { error: 'Distance : valeur positive attendue.' } : { id, type, a: ref<PointRef>(0), b: ref<PointRef>(1), value: value_ };
    }
    case 'radius': {
      const c = curveOf(map, ref<CurveRef>(0));
      const value_ = v(c ? c.r : null);
      return value_ === null ? { error: 'Rayon : valeur positive attendue.' } : { id, type, curve: ref<CurveRef>(0), value: value_ };
    }
    case 'tangent': return { id, type, seg: ref<SegRef>(0), curve: ref<CurveRef>(1) };
    case 'fixed': return { id, type, p: ref<PointRef>(0), x: picks[0].at.x, y: picks[0].at.y };
  }
}

/** Libellé court d'une contrainte (symbole et valeur) pour le canevas et la liste. */
export function constraintGlyph(k: GeoConstraint): string {
  const n = (x: number) => (Math.round(x * 100) / 100).toString().replace('.', ',');
  switch (k.type) {
    case 'coincident': return '◉';
    case 'horizontal': return 'H';
    case 'vertical': return 'V';
    case 'parallel': return '∥';
    case 'perpendicular': return '⊥';
    case 'equal': return '=';
    // Cote pilotée par un paramètre (lot 12.2) : l'expression, puis sa valeur.
    case 'distance': return `↔ ${k.expr ? `${k.expr} = ` : ''}${n(k.value)}`;
    case 'length': return `L ${k.expr ? `${k.expr} = ` : ''}${n(k.value)}`;
    case 'radius': return `R ${k.expr ? `${k.expr} = ` : ''}${n(k.value)}`;
    case 'tangent': return 'T';
    case 'fixed': return '⚓';
  }
}

/** Points d'ancrage des symboles d'une contrainte sur le canevas (un par élément visé). */
export function constraintAnchors(objects: CadObject[], k: GeoConstraint): Pt[] {
  const map = byId(objects);
  const mid = (r: SegRef) => { const s = segOf(map, r); return s ? { x: (s[0].x + s[1].x) / 2, y: (s[0].y + s[1].y) / 2 } : null; };
  const onCurve = (r: CurveRef) => { const c = curveOf(map, r); return c ? { x: c.c.x + c.r * Math.SQRT1_2, y: c.c.y - c.r * Math.SQRT1_2 } : null; };
  const list: (Pt | null)[] = (() => {
    switch (k.type) {
      case 'coincident': return [pointOf(map, k.a)];
      case 'distance': { const a = pointOf(map, k.a), b = pointOf(map, k.b); return [a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null]; }
      case 'horizontal': case 'vertical': case 'length': return [mid(k.seg)];
      case 'parallel': case 'perpendicular': case 'equal': return [mid(k.s1), mid(k.s2)];
      case 'radius': return [onCurve(k.curve)];
      case 'tangent': return [mid(k.seg)];
      case 'fixed': return [pointOf(map, k.p)];
    }
  })();
  return list.filter((p): p is Pt => !!p);
}

/** Retire les contraintes dont un objet visé n'existe plus (suppression) ; les autres restent. */
export function pruneConstraints(objects: CadObject[], constraints: GeoConstraint[] | undefined): GeoConstraint[] | undefined {
  if (!constraints?.length) return constraints;
  const ids = new Set(objects.map(o => o.id));
  const kept = constraints.filter(k => constraintObjects(k).every(id => ids.has(id)));
  return kept.length === constraints.length ? constraints : kept;
}
