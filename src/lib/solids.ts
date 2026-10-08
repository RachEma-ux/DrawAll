// Solides (lot 15.2) : extrusion et révolution d'un contour fermé du plan, booléens (union,
// différence, intersection) et perçage. Le solide est une recette du noyau (src/lib/kernel/recipe.ts),
// évaluée par OCCT dans le Worker ; ce module, pur, construit et contrôle les recettes, calcule leur
// encombrement et leur trace en plan. Millimètres, degrés ; X, Y du plan, Z vers le haut.
import type { CadObject, PrimitiveObject, SolidObj } from '@/types/cad';
import type { FaceRef, LoftSection, PathSeg, SolidRecipe, SweepProfile, Vec3 } from './kernel/recipe';
import { arcEndpoints, arcLength, arcMidpoint } from './arc';
import { splineLength, splineSamples } from './spline';

type P2 = [number, number];
export type Contour = { kind: 'polygon'; points: P2[] } | { kind: 'circle'; cx: number; cy: number; r: number };
export type SolidResult = { recipe: SolidRecipe } | { error: string };

const area2 = (pts: P2[]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const ok = (...v: number[]) => v.every(Number.isFinite);

/** Contour fermé d'un objet du plan : rectangle, cercle, polyligne fermée (dernier sommet = premier). */
export function contourOf(o: CadObject): Contour | { error: string } {
  if (o.kind === 'rect') return o.w > 0 && o.h > 0 ? { kind: 'polygon', points: [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]] } : { error: 'Rectangle aplati : aucun contour.' };
  if (o.kind === 'circle') return o.r > 0 ? { kind: 'circle', cx: o.cx, cy: o.cy, r: o.r } : { error: 'Cercle de rayon nul : aucun contour.' };
  if (o.kind === 'polyline') {
    const pts: P2[] = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) pts.push([o.points[i], o.points[i + 1]]);
    const n = pts.length;
    if (n < 4 || pts[0][0] !== pts[n - 1][0] || pts[0][1] !== pts[n - 1][1]) return { error: 'Polyligne ouverte : un contour fermé est attendu (dernier sommet sur le premier).' };
    const ring = pts.slice(0, -1);
    if (selfIntersects(ring)) return { error: 'Contour qui se recoupe : aucun solide.' };
    if (Math.abs(area2(ring)) < 1e-9) return { error: 'Contour d’aire nulle.' };
    return { kind: 'polygon', points: ring };
  }
  return { error: 'Contour fermé attendu : rectangle, cercle ou polyligne fermée.' };
}

function selfIntersects(pts: P2[]): boolean {
  const n = pts.length;
  const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // côtés voisins
      const [a, b, c, d] = [pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]];
      const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    }
  }
  return false;
}

/**
 * Extrusion verticale d'un contour, de la cote `z` sur `height` (> 0). `name` (lot 15.5) nomme la
 * fonction : ses faces (dessus, dessous, côtés) deviennent désignables (coque, pousser / tirer).
 */
export function extrudeRecipe(c: Contour, height: number, z = 0, name?: string): SolidResult {
  if (!(height > 0) || !ok(height, z)) return { error: 'Extrusion : hauteur positive attendue.' };
  const named = name ? { name } : {};
  if (c.kind === 'circle') return { recipe: { op: 'cylinder', r: c.r, h: height, at: [c.cx, c.cy, z], ...named } };
  return { recipe: { op: 'extrude', profile: c.points, height, ...(z ? { z } : {}), ...named } };
}

/**
 * Révolution d'un contour polygonal autour d'une droite du plan (deux points), de `angle` degrés
 * (0 < angle ≤ 360). Le contour doit être entièrement d'un côté de l'axe (il peut le toucher).
 */
export function revolveRecipe(c: Contour, a: { x: number; y: number }, b: { x: number; y: number }, angle: number): SolidResult {
  if (c.kind !== 'polygon') return { error: 'Révolution : contour polygonal attendu (rectangle ou polyligne fermée).' };
  if (!(angle > 0 && angle <= 360)) return { error: 'Révolution : angle entre 0 (exclu) et 360° attendu.' };
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (!(len > 0)) return { error: 'Révolution : axe de longueur nulle.' };
  const side = c.points.map(p => (dx * (p[1] - a.y) - dy * (p[0] - a.x)) / len);
  if (side.some(s => s > 1e-9) && side.some(s => s < -1e-9)) return { error: 'Révolution : le contour traverse l’axe ; il doit rester d’un seul côté.' };
  if (side.every(s => Math.abs(s) <= 1e-9)) return { error: 'Révolution : contour sur l’axe.' };
  return { recipe: { op: 'revolve', profile: c.points, angle, axis: { origin: [a.x, a.y], dir: [dx / len, dy / len] } } };
}

export type BooleanOp = 'union' | 'cut' | 'intersect';
export const BOOLEAN_LABEL: Record<BooleanOp, string> = { union: 'Union', cut: 'Différence', intersect: 'Intersection' };

/** Encombrement d'une recette (boîte englobante, éventuellement large pour une révolution partielle). */
export function recipeBounds(r: SolidRecipe): { min: Vec3; max: Vec3 } {
  const box = (pts: Vec3[]) => ({ min: [0, 1, 2].map(i => Math.min(...pts.map(p => p[i]))) as Vec3, max: [0, 1, 2].map(i => Math.max(...pts.map(p => p[i]))) as Vec3 });
  const corners = (b: { min: Vec3; max: Vec3 }): Vec3[] => [0, 1, 2, 3, 4, 5, 6, 7].map(k => [k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]]);
  switch (r.op) {
    case 'box': { const at = r.at ?? [0, 0, 0]; return { min: at, max: [at[0] + r.x, at[1] + r.y, at[2] + r.z] }; }
    case 'cylinder': {
      const at = r.at ?? [0, 0, 0], d = r.dir ?? [0, 0, 1], l = Math.hypot(...d), u = d.map(x => x / l) as Vec3;
      const top: Vec3 = [at[0] + u[0] * r.h, at[1] + u[1] * r.h, at[2] + u[2] * r.h];
      // Demi-étendue du disque selon chaque axe : r·√(1 − u_i²).
      const e = u.map(x => r.r * Math.sqrt(Math.max(0, 1 - x * x))) as Vec3;
      const b = box([at, top]);
      return { min: b.min.map((v, i) => v - e[i]) as Vec3, max: b.max.map((v, i) => v + e[i]) as Vec3 };
    }
    case 'extrude': { const z = r.z ?? 0; return box(r.profile.flatMap(p => [[p[0], p[1], z], [p[0], p[1], z + r.height]] as Vec3[])); }
    case 'revolve': {
      if (!r.axis) {
        const rmax = Math.max(...r.profile.map(p => Math.abs(p[0])));
        return box([[-rmax, -rmax, Math.min(...r.profile.map(p => p[1]))], [rmax, rmax, Math.max(...r.profile.map(p => p[1]))]]);
      }
      const { origin: o, dir: u } = r.axis;
      const t = r.profile.map(p => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]);
      const dmax = Math.max(...r.profile.map(p => Math.abs((p[1] - o[1]) * u[0] - (p[0] - o[0]) * u[1])));
      const n: P2 = [-u[1], u[0]];
      const pts: Vec3[] = [];
      for (const tt of [Math.min(...t), Math.max(...t)]) for (const s of [-dmax, dmax]) for (const z of [-dmax, dmax]) pts.push([o[0] + u[0] * tt + n[0] * s, o[1] + u[1] * tt + n[1] * s, z]);
      return box(pts);
    }
    case 'loft': return box(r.sections.flatMap(s => ('circle' in s
      ? [[s.circle.cx - s.circle.r, s.circle.cy - s.circle.r, s.z], [s.circle.cx + s.circle.r, s.circle.cy + s.circle.r, s.z]]
      : s.points.map(p => [p[0], p[1], s.z])) as Vec3[]));
    case 'sweep': {
      // Trajet échantillonné, élargi de la plus grande distance latérale du profil (encombrement sûr).
      const pr = profileRange(r.profile), z = r.z ?? 0, w = Math.max(Math.abs(pr.u[0]), Math.abs(pr.u[1]));
      const pts = pathPoints(r.path);
      const b = box(pts.map(p => [p[0], p[1], 0] as Vec3));
      return { min: [b.min[0] - w, b.min[1] - w, z + pr.v[0]], max: [b.max[0] + w, b.max[1] + w, z + pr.v[1]] };
    }
    case 'union': { const a = recipeBounds(r.a), b = recipeBounds(r.b); return box([a.min, a.max, b.min, b.max]); }
    case 'cut': return recipeBounds(r.a);
    case 'fillet': case 'shell': return recipeBounds(r.of);
    case 'intersect': {
      const a = recipeBounds(r.a), b = recipeBounds(r.b);
      return { min: a.min.map((v, i) => Math.max(v, b.min[i])) as Vec3, max: a.max.map((v, i) => Math.min(v, b.max[i])) as Vec3 };
    }
    case 'translate': { const b = recipeBounds(r.of); return { min: b.min.map((v, i) => v + r.by[i]) as Vec3, max: b.max.map((v, i) => v + r.by[i]) as Vec3 }; }
    case 'rotate': case 'mirror': case 'scale': return box(corners(recipeBounds(r.of)).map(p => moveP3(r, p)));
  }
}

/** Image d'un point par une transformation de recette. */
function moveP3(r: Extract<SolidRecipe, { op: 'rotate' | 'mirror' | 'scale' }>, p: Vec3): Vec3 {
  if (r.op === 'rotate') {
    const c = Math.cos((r.angle * Math.PI) / 180), s = Math.sin((r.angle * Math.PI) / 180), x = p[0] - r.about[0], y = p[1] - r.about[1];
    return [r.about[0] + x * c - y * s, r.about[1] + x * s + y * c, p[2]];
  }
  if (r.op === 'mirror') return r.axis === 'x' ? [2 * r.value - p[0], p[1], p[2]] : [p[0], 2 * r.value - p[1], p[2]];
  return [0, 1, 2].map(i => r.about[i] + (p[i] - r.about[i]) * r.factor) as Vec3;
}

/**
 * Perçage cylindrique vertical de diamètre `d` au point (x, y), depuis le dessus du solide, sur
 * `depth` mm ; `depth` absent : de part en part.
 */
export function holeRecipe(of: SolidRecipe, x: number, y: number, d: number, depth?: number): SolidResult {
  if (!(d > 0) || !ok(d, x, y)) return { error: 'Perçage : diamètre positif attendu.' };
  if (depth !== undefined && !(depth > 0 && Number.isFinite(depth))) return { error: 'Perçage : profondeur positive attendue (vide : traversant).' };
  const b = recipeBounds(of);
  if (x < b.min[0] || x > b.max[0] || y < b.min[1] || y > b.max[1]) return { error: 'Perçage : le point est hors de l’emprise du solide.' };
  // Le foret dépasse d'1 mm au-dessus (et au-dessous si traversant) : aucune peau résiduelle.
  const top = b.max[2], bottom = depth === undefined ? b.min[2] - 1 : top - depth;
  return { recipe: { op: 'cut', a: of, b: { op: 'cylinder', r: d / 2, h: top + 1 - bottom, at: [x, y, bottom] } } };
}

/** Trace en plan : contours des fonctions (une partie retirée, en traits interrompus). */
export type Trace = { pts: P2[]; hidden: boolean; open?: boolean } | { circle: { cx: number; cy: number; r: number }; hidden: boolean };

export function solidTrace(r: SolidRecipe, hidden = false): Trace[] {
  const polys = (pts: P2[]): Trace[] => [{ pts, hidden }];
  switch (r.op) {
    case 'box': { const at = r.at ?? [0, 0, 0]; return polys([[at[0], at[1]], [at[0] + r.x, at[1]], [at[0] + r.x, at[1] + r.y], [at[0], at[1] + r.y]]); }
    case 'cylinder': {
      const d = r.dir ?? [0, 0, 1], at = r.at ?? [0, 0, 0];
      if (Math.abs(d[0]) < 1e-12 && Math.abs(d[1]) < 1e-12) return [{ circle: { cx: at[0], cy: at[1], r: r.r }, hidden }];
      const b = recipeBounds(r);
      return polys([[b.min[0], b.min[1]], [b.max[0], b.min[1]], [b.max[0], b.max[1]], [b.min[0], b.max[1]]]);
    }
    case 'extrude': return polys(r.profile);
    case 'revolve': {
      const b = recipeBounds(r);
      if (!r.axis) return [{ circle: { cx: 0, cy: 0, r: b.max[0] }, hidden }];
      // Emprise de la révolution : bande le long de l'axe, de demi-largeur la plus grande distance à l'axe.
      const { origin: o, dir: u } = r.axis, n: P2 = [-u[1], u[0]];
      const t = r.profile.map(p => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]);
      const dm = Math.max(...r.profile.map(p => Math.abs((p[1] - o[1]) * u[0] - (p[0] - o[0]) * u[1])));
      const at = (tt: number, s: number): P2 => [o[0] + u[0] * tt + n[0] * s, o[1] + u[1] * tt + n[1] * s];
      const [t0, t1] = [Math.min(...t), Math.max(...t)];
      return polys([at(t0, -dm), at(t1, -dm), at(t1, dm), at(t0, dm)]);
    }
    case 'union': case 'intersect': return [...solidTrace(r.a, hidden), ...solidTrace(r.b, hidden)];
    case 'cut': return [...solidTrace(r.a, hidden), ...solidTrace(r.b, true)];
    case 'fillet': case 'shell': return solidTrace(r.of, hidden);
    // Lissage : le contour de chaque section.
    case 'loft': return r.sections.map(s => ('circle' in s ? { circle: s.circle, hidden } : { pts: s.points, hidden }));
    // Balayage : son trajet, ouvert (pas de fermeture ajoutée).
    case 'sweep': return [{ pts: pathPoints(r.path), hidden, open: true }];
    case 'translate': case 'rotate': case 'mirror': case 'scale': {
      const f = (p: P2): P2 => { if (r.op === 'translate') return [p[0] + r.by[0], p[1] + r.by[1]]; const q = moveP3(r, [p[0], p[1], 0]); return [q[0], q[1]]; };
      const k = r.op === 'scale' ? r.factor : 1;
      return solidTrace(r.of, hidden).map(t => ('pts' in t ? { ...t, pts: t.pts.map(f) } : { circle: { ...(([cx, cy]) => ({ cx, cy }))(f([t.circle.cx, t.circle.cy])), r: t.circle.r * k }, hidden: t.hidden }));
    }
  }
}

/** Représentation 2D en primitives (écran, PDF, DXF, accrochage). */
export function solidPrimitives(o: SolidObj): PrimitiveObject[] {
  const base = { ...o, kind: undefined, recipe: undefined } as unknown as Omit<PrimitiveObject, 'kind'>;
  return solidTrace(o.recipe).map((t, i) => {
    const style = { hatch: 'none' as const, ...(t.hidden ? { lineType: 'interrompu' } : {}) };
    if ('circle' in t) return { ...base, ...style, id: `${o.id}#${i}`, kind: 'circle', cx: t.circle.cx, cy: t.circle.cy, r: t.circle.r } as PrimitiveObject;
    return { ...base, ...style, id: `${o.id}#${i}`, kind: 'polyline', points: (t.open ? t.pts : [...t.pts, t.pts[0]]).flat() } as PrimitiveObject;
  });
}

/** Transformations d'un solide : la recette est enveloppée (les déplacements successifs fusionnent). */
export function moveSolid(r: SolidRecipe, dx: number, dy: number, dz = 0): SolidRecipe {
  if (r.op === 'translate') {
    const by: Vec3 = [r.by[0] + dx, r.by[1] + dy, r.by[2] + dz];
    return by.every(v => v === 0) ? r.of : { op: 'translate', of: r.of, by };
  }
  return { op: 'translate', of: r, by: [dx, dy, dz] };
}
export const rotateSolid = (r: SolidRecipe, cx: number, cy: number, angle: number): SolidRecipe => ({ op: 'rotate', of: r, angle, about: [cx, cy] });
export const mirrorSolid = (r: SolidRecipe, axis: 'x' | 'y', value: number): SolidRecipe => ({ op: 'mirror', of: r, axis, value });
export const scaleSolid = (r: SolidRecipe, cx: number, cy: number, factor: number): SolidRecipe => ({ op: 'scale', of: r, factor, about: [cx, cy, 0] });

/** Nombre d'opérations d'une recette (affiché dans l'inspecteur). */
export function recipeSteps(r: SolidRecipe): string[] {
  const label: Record<SolidRecipe['op'], string> = {
    box: 'pavé', cylinder: 'cylindre', extrude: 'extrusion', revolve: 'révolution', union: 'union', cut: 'différence', intersect: 'intersection',
    fillet: 'congé', shell: 'coque', sweep: 'balayage', loft: 'lissage', translate: 'déplacement', rotate: 'rotation', mirror: 'symétrie', scale: 'échelle',
  };
  const out: string[] = [];
  const walk = (x: SolidRecipe) => {
    // Un perçage est une différence par un cylindre vertical : le foret n'est pas une étape.
    const drill = x.op === 'cut' && x.b.op === 'cylinder' && !x.b.dir;
    if ('a' in x) { walk(x.a); if (!drill) walk(x.b); } else if ('of' in x) walk(x.of);
    out.push(drill ? 'perçage' : label[x.op]);
  };
  walk(r);
  return out;
}

/** Recette bien formée (relecture d'un projet) : opérations connues, nombres finis, profondeur bornée. */
export function isRecipe(r: unknown, depth = 0): r is SolidRecipe {
  if (depth > 200 || !r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  const num = (v: unknown, pos = false) => typeof v === 'number' && Number.isFinite(v) && (!pos || v > 0);
  const v3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => num(n));
  const p2 = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(n => num(n));
  const profile = (v: unknown) => Array.isArray(v) && v.length >= 3 && v.every(p2);
  const opt = (v: unknown, f: (v: unknown) => boolean) => v === undefined || f(v);
  switch (x.op) {
    case 'box': return num(x.x, true) && num(x.y, true) && num(x.z, true) && opt(x.at, v3);
    case 'cylinder': return num(x.r, true) && num(x.h, true) && opt(x.at, v3) && opt(x.dir, v3);
    case 'extrude': return profile(x.profile) && num(x.height, true) && opt(x.z, num);
    case 'revolve': return profile(x.profile) && num(x.angle, true) && (x.angle as number) <= 360
      && opt(x.axis, a => !!a && typeof a === 'object' && p2((a as Record<string, unknown>).origin) && p2((a as Record<string, unknown>).dir));
    case 'sweep': {
      const pr = x.profile as Record<string, unknown> | undefined;
      const prof = profile(x.profile) || (!!pr && !Array.isArray(pr) && num(pr.r, true) && p2(pr.c));
      const seg = (g: unknown) => {
        const q = g as Record<string, unknown> | null;
        if (!q || typeof q !== 'object') return false;
        if (q.kind === 'line') return p2(q.from) && p2(q.to);
        if (q.kind === 'arc') return p2(q.from) && p2(q.via) && p2(q.to);
        return q.kind === 'curve' && Array.isArray(q.points) && q.points.length >= 2 && q.points.every(p2);
      };
      return prof && Array.isArray(x.path) && x.path.length > 0 && x.path.every(seg) && opt(x.z, num);
    }
    case 'loft': {
      const sec = (q: unknown) => {
        const o = q as Record<string, unknown> | null;
        if (!o || typeof o !== 'object' || !num(o.z)) return false;
        const c = o.circle as Record<string, unknown> | undefined;
        return profile(o.points) || (!!c && typeof c === 'object' && num(c.cx) && num(c.cy) && num(c.r, true));
      };
      return Array.isArray(x.sections) && x.sections.length >= 2 && x.sections.every(sec) && typeof x.ruled === 'boolean';
    }
    case 'union': case 'cut': case 'intersect': return isRecipe(x.a, depth + 1) && isRecipe(x.b, depth + 1);
    case 'fillet': return num(x.r, true) && isRecipe(x.of, depth + 1);
    case 'shell': {
      const face = (f: unknown) => !!f && typeof f === 'object' && typeof (f as FaceRef).feature === 'string' && typeof (f as FaceRef).role === 'string';
      const open = x.open === undefined || face(x.open) || (Array.isArray(x.open) && x.open.length > 0 && x.open.every(face));
      return num(x.thickness, true) && open && isRecipe(x.of, depth + 1);
    }
    case 'translate': return v3(x.by) && isRecipe(x.of, depth + 1);
    case 'rotate': return num(x.angle) && p2(x.about) && isRecipe(x.of, depth + 1);
    case 'mirror': return (x.axis === 'x' || x.axis === 'y') && num(x.value) && isRecipe(x.of, depth + 1);
    case 'scale': return num(x.factor, true) && v3(x.about) && isRecipe(x.of, depth + 1);
    default: return false;
  }
}

// ——— Balayage et Follow Me (lot 15.3) ———

/** Cercle passant par trois points (centre, rayon), ou null s'ils sont alignés. */
function circle3(a: P2, b: P2, c: P2): { c: P2; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p: P2) => p[0] * p[0] + p[1] * p[1];
  const cx = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d;
  const cy = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
  return { c: [cx, cy], r: Math.hypot(a[0] - cx, a[1] - cy) };
}

/** Arc par trois points : angle de départ et balayage signé (radians), du départ à l'arrivée par le point de passage. */
function arc3(s: Extract<PathSeg, { kind: 'arc' }>) {
  const k = circle3(s.from, s.via, s.to);
  if (!k) return null;
  const ang = (p: P2) => Math.atan2(p[1] - k.c[1], p[0] - k.c[0]);
  const a0 = ang(s.from), norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccwTo = norm(ang(s.to) - a0), ccwVia = norm(ang(s.via) - a0);
  const sweep = ccwVia <= ccwTo ? ccwTo : ccwTo - 2 * Math.PI;
  return { ...k, a0, sweep };
}

/** Points du trajet (arcs à 64 segments par tour), dans l'ordre, sans doublon aux jonctions. */
export function pathPoints(path: PathSeg[]): P2[] {
  const out: P2[] = [];
  const push = (p: P2) => { const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); };
  for (const s of path) {
    if (s.kind === 'line') { push(s.from); push(s.to); continue; }
    if (s.kind === 'curve') { s.points.forEach(push); continue; }
    const a = arc3(s);
    if (!a) { push(s.from); push(s.to); continue; }
    const n = Math.max(2, Math.ceil((Math.abs(a.sweep) / (2 * Math.PI)) * 64));
    for (let i = 0; i <= n; i++) {
      const t = a.a0 + (a.sweep * i) / n;
      push(i === 0 ? s.from : i === n ? s.to : [a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]);
    }
  }
  return out;
}

/** Longueur du trajet : droites et arcs exacts ; courbe : longueur de sa ligne de points. */
export function pathLength(path: PathSeg[]): number {
  return path.reduce((sum, s) => {
    if (s.kind === 'line') return sum + Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
    if (s.kind === 'curve') return sum + s.points.slice(1).reduce((l, p, i) => l + Math.hypot(p[0] - s.points[i][0], p[1] - s.points[i][1]), 0);
    const a = arc3(s);
    return sum + (a ? a.r * Math.abs(a.sweep) : Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]));
  }, 0);
}

/** Trajet d'un objet du plan : ligne, arc, polyligne (ouverte ou fermée), spline (échantillonnée à 10⁻⁴ mm). */
export function pathOf(o: CadObject): { path: PathSeg[]; length: number } | { error: string } {
  const P = (p: { x: number; y: number }): P2 => [p.x, p.y];
  switch (o.kind) {
    case 'line':
      if (!(Math.hypot(o.x2 - o.x1, o.y2 - o.y1) > 0)) return { error: 'Trajet de longueur nulle.' };
      return { path: [{ kind: 'line', from: [o.x1, o.y1], to: [o.x2, o.y2] }], length: Math.hypot(o.x2 - o.x1, o.y2 - o.y1) };
    case 'arc': {
      const [a, b] = arcEndpoints(o);
      if (!(o.r > 0)) return { error: 'Arc de rayon nul.' };
      return { path: [{ kind: 'arc', from: P(a), via: P(arcMidpoint(o)), to: P(b) }], length: arcLength(o) };
    }
    case 'polyline': {
      const pts: P2[] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) { const p: P2 = [o.points[i], o.points[i + 1]]; const l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p); }
      if (pts.length < 2) return { error: 'Trajet de longueur nulle.' };
      const path: PathSeg[] = pts.slice(1).map((p, i) => ({ kind: 'line', from: pts[i], to: p }));
      return { path, length: pathLength(path) };
    }
    case 'spline': {
      const pts = splineSamples(o, 1e-4).map(P);
      if (pts.length < 2) return { error: 'Spline sans longueur.' };
      return { path: [{ kind: 'curve', points: pts }], length: splineLength(o) };
    }
    default: return { error: 'Trajet attendu : ligne, arc, polyligne ou spline.' };
  }
}

/** Étendue (u, v) d'un profil de balayage. */
function profileRange(p: SweepProfile): { u: P2; v: P2 } {
  if (!Array.isArray(p)) return { u: [p.c[0] - p.r, p.c[0] + p.r], v: [p.c[1] - p.r, p.c[1] + p.r] };
  return { u: [Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[0]))], v: [Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[1]))] };
}

/**
 * Profil de balayage tiré d'un contour du plan, « redressé » au départ du trajet : le contour est
 * lu comme vu en élévation (le haut de l'écran vers le haut), le milieu de sa largeur sur le trajet,
 * sa base (son point le plus bas à l'écran) à la cote du trajet.
 */
export function sweepProfileOf(c: Contour): SweepProfile {
  if (c.kind === 'circle') return { r: c.r, c: [0, c.r] };
  const xs = c.points.map(p => p[0]), ys = c.points.map(p => p[1]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2, bottom = Math.max(...ys);
  return c.points.map(([x, y]) => [x - mid, bottom - y]);
}

/** Balayage (Follow Me) d'un contour fermé le long d'un trajet, posé à la cote z. */
export function sweepRecipe(c: Contour, path: PathSeg[], z = 0): SolidResult {
  if (!path.length || !(pathLength(path) > 0)) return { error: 'Balayage : trajet de longueur nulle.' };
  if (!Number.isFinite(z)) return { error: 'Balayage : cote invalide.' };
  return { recipe: { op: 'sweep', profile: sweepProfileOf(c), path, ...(z ? { z } : {}) } };
}

// ——— Lissage (lot 15.4) ———

/**
 * Lissage par des sections : contours fermés du plan, chacun à sa cote, dans l'ordre (cotes
 * strictement croissantes ou strictement décroissantes).
 */
export function loftRecipe(contours: Contour[], zs: number[], ruled: boolean): SolidResult {
  if (contours.length < 2) return { error: 'Lissage : deux sections au moins.' };
  if (zs.length !== contours.length) return { error: `Lissage : ${contours.length} cotes attendues (une par section), ${zs.length} données.` };
  if (!zs.every(Number.isFinite)) return { error: 'Lissage : cote invalide.' };
  const up = zs.every((z, i) => i === 0 || z > zs[i - 1]), down = zs.every((z, i) => i === 0 || z < zs[i - 1]);
  if (!up && !down) return { error: 'Lissage : les cotes doivent croître (ou décroître) strictement d’une section à la suivante.' };
  const sections: LoftSection[] = contours.map((c, i) => (c.kind === 'circle' ? { z: zs[i], circle: { cx: c.cx, cy: c.cy, r: c.r } } : { z: zs[i], points: c.points }));
  return { recipe: { op: 'loft', sections, ruled } };
}

/** Points de contrôle des sections (sommets, milieux des côtés, 8 points par cercle). */
export function loftCheckPoints(sections: LoftSection[]): Vec3[] {
  return sections.flatMap(s => {
    if ('circle' in s) return Array.from({ length: 8 }, (_, i) => [s.circle.cx + s.circle.r * Math.cos((i * Math.PI) / 4), s.circle.cy + s.circle.r * Math.sin((i * Math.PI) / 4), s.z] as Vec3);
    return s.points.flatMap((p, i) => {
      const q = s.points[(i + 1) % s.points.length];
      return [[p[0], p[1], s.z], [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, s.z]] as Vec3[];
    });
  });
}

/** Liste de cotes saisie (« 0 ; 1000 ; 2500 », virgule décimale admise). */
export function parseLevels(text: string): number[] {
  return text.split(';').map(t => t.trim()).filter(Boolean).map(t => Number(t.replace(',', '.')));
}

// ——— Coque (lot 15.5) ———

/** Face désignable d'un solide : référence générative et libellé lisible. */
export interface FaceChoice { ref: FaceRef; label: string }

/** Faces nommées de la recette (fonctions nommées : extrusion, pavé, cylindre), dans l'ordre. */
export function faceChoices(r: SolidRecipe): FaceChoice[] {
  const out: FaceChoice[] = [];
  const f = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const walk = (x: SolidRecipe) => {
    if ('a' in x) { walk(x.a); walk(x.b); return; }
    if ('of' in x) { walk(x.of); return; }
    if (x.op === 'extrude' && x.name) {
      const feature = x.name;
      out.push({ ref: { feature, role: 'top' }, label: `${feature} — dessus` }, { ref: { feature, role: 'bottom' }, label: `${feature} — dessous` });
      x.profile.forEach((p, i) => {
        const q = x.profile[(i + 1) % x.profile.length];
        out.push({ ref: { feature, role: `side:${x.segmentIds?.[i] ?? `s${i}`}` }, label: `${feature} — côté ${i + 1} (${f(p[0])} ; ${f(p[1])}) → (${f(q[0])} ; ${f(q[1])})` });
      });
    } else if (x.op === 'cylinder' && x.name) {
      out.push({ ref: { feature: x.name, role: 'cap' }, label: `${x.name} — dessus` }, { ref: { feature: x.name, role: 'base' }, label: `${x.name} — dessous` }, { ref: { feature: x.name, role: 'wall' }, label: `${x.name} — paroi` });
    } else if (x.op === 'box' && x.name) {
      for (const [role, label] of [['zmax', 'dessus'], ['zmin', 'dessous'], ['xmin', 'côté X min'], ['xmax', 'côté X max'], ['ymin', 'côté Y min'], ['ymax', 'côté Y max']]) out.push({ ref: { feature: x.name, role }, label: `${x.name} — ${label}` });
    }
  };
  walk(r);
  return out;
}

/** Coque d'épaisseur `thickness` (> 0, vers l'intérieur), faces ouvertes désignées (une au moins). */
export function shellRecipe(of: SolidRecipe, thickness: number, open: FaceRef[]): SolidResult {
  if (!(thickness > 0) || !Number.isFinite(thickness)) return { error: 'Coque : épaisseur positive attendue.' };
  if (!open.length) return { error: 'Coque : désignez au moins une face ouverte.' };
  return { recipe: { op: 'shell', of, thickness, open: open.length === 1 ? open[0] : open } };
}
