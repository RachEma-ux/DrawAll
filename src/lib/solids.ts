// Solides (lot 15.2) : extrusion et révolution d'un contour fermé du plan, booléens (union,
// différence, intersection) et perçage. Le solide est une recette du noyau (src/lib/kernel/recipe.ts),
// évaluée par OCCT dans le Worker ; ce module, pur, construit et contrôle les recettes, calcule leur
// encombrement et leur trace en plan. Millimètres, degrés ; X, Y du plan, Z vers le haut.
import type { CadObject, PrimitiveObject, SolidObj } from '@/types/cad';
import type { FaceRef, LoftSection, PathSeg, SolidRecipe, SweepProfile, Vec3 } from './kernel/recipe';
import { arcEndpoints, arcLength, arcMidpoint } from './arc';
import { featureSupports, supportOf } from './kernel/references';
import { splineLength, splineSamples } from './spline';

type P2 = [number, number];
/** Direction rendue unitaire (axe de révolution : une direction de longueur quelconque le désigne). */
const unit2 = (d: P2): P2 => { const l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; };
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
      const o = r.axis.origin, u = unit2(r.axis.dir);
      const t = r.profile.map(p => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]);
      const dmax = Math.max(...r.profile.map(p => Math.abs((p[1] - o[1]) * u[0] - (p[0] - o[0]) * u[1])));
      const n: P2 = [-u[1], u[0]];
      const pts: Vec3[] = [];
      for (const tt of [Math.min(...t), Math.max(...t)]) for (const s of [-dmax, dmax]) for (const z of [-dmax, dmax]) pts.push([o[0] + u[0] * tt + n[0] * s, o[1] + u[1] * tt + n[1] * s, z]);
      return box(pts);
    }
    case 'compound': { const bs = r.parts.map(recipeBounds); return box(bs.flatMap(b => [b.min, b.max])); }
    case 'step': return { min: [...r.bounds.min] as Vec3, max: [...r.bounds.max] as Vec3 };
    case 'polyhedron': return box(r.faces.flat());
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
    case 'pushpull': {
      const b = recipeBounds(r.of), moved = pushedFace(r);
      return moved && r.distance > 0 ? box([b.min, b.max, ...moved.after]) : b;
    }
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
      const o = r.axis.origin, u = unit2(r.axis.dir), n: P2 = [-u[1], u[0]];
      const t = r.profile.map(p => (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1]);
      const dm = Math.max(...r.profile.map(p => Math.abs((p[1] - o[1]) * u[0] - (p[0] - o[0]) * u[1])));
      const at = (tt: number, s: number): P2 => [o[0] + u[0] * tt + n[0] * s, o[1] + u[1] * tt + n[1] * s];
      const [t0, t1] = [Math.min(...t), Math.max(...t)];
      return polys([at(t0, -dm), at(t1, -dm), at(t1, dm), at(t0, dm)]);
    }
    case 'union': case 'intersect': return [...solidTrace(r.a, hidden), ...solidTrace(r.b, hidden)];
    case 'cut': return [...solidTrace(r.a, hidden), ...solidTrace(r.b, true)];
    case 'fillet': case 'shell': return solidTrace(r.of, hidden);
    case 'pushpull': {
      // Face latérale poussée ou tirée : emprise de la tranche ajoutée (ou retirée, en interrompu).
      const moved = pushedFace(r), base = solidTrace(r.of, hidden);
      if (!moved || moved.vertical) return base;
      return [...base, { pts: hull2([...moved.before, ...moved.after].map(p => [p[0], p[1]] as P2)), hidden: hidden || r.distance < 0 }];
    }
    case 'compound': return r.parts.flatMap(p => solidTrace(p, hidden));
    // Solide importé : arêtes vues de dessus, relevées à l'import.
    case 'step': return r.trace.map(l => ({ pts: Array.from({ length: l.length / 2 }, (_, i) => [l[2 * i], l[2 * i + 1]] as P2), hidden, open: true }));
    case 'polyhedron': return r.faces.map(f => ({ pts: f.map(p => [p[0], p[1]] as P2), hidden }));
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
    fillet: 'congé', shell: 'coque', sweep: 'balayage', loft: 'lissage', pushpull: 'pousser / tirer', compound: 'assemblage', polyhedron: 'faces', step: 'import STEP', translate: 'déplacement', rotate: 'rotation', mirror: 'symétrie', scale: 'échelle',
  };
  const out: string[] = [];
  const walk = (x: SolidRecipe) => {
    // Un perçage est une différence par un cylindre vertical : le foret n'est pas une étape.
    const drill = x.op === 'cut' && x.b.op === 'cylinder' && !x.b.dir;
    if ('a' in x) { walk(x.a); if (!drill) walk(x.b); } else if ('of' in x) walk(x.of); else if (x.op === 'compound') x.parts.forEach(walk);
    out.push(drill ? 'perçage' : label[x.op]);
  };
  walk(r);
  return out;
}

/**
 * Contour plan constructible : au moins trois sommets distincts, aire non nulle, aucune arête qui en
 * croise ou touche une autre non voisine. Sinon le noyau ne bâtit aucun volume.
 */
export function profileError(pts: readonly (readonly [number, number])[]): string | null {
  const p: [number, number][] = [];
  for (const q of pts) { const l = p[p.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) p.push([q[0], q[1]]); }
  if (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
  const n = p.length;
  if (n < 3) return 'contour de moins de trois sommets distincts';
  let area = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
    minX = Math.min(minX, x1); minY = Math.min(minY, y1); maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(Math.abs(area / 2) > 1e-9 * span * span)) return 'contour d’aire nulle (sommets alignés)';
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const on = (a: number[], b: number[], c: number[]) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  const meet = (a: number[], b: number[], c: number[], d: number[]) => {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Arêtes voisines : elles partagent un sommet, sans se croiser pour autant, sauf repli sur elles-mêmes.
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
      if (adjacent) {
        // Repli : l'arête suivante revient sur la précédente (colinéaires, sens opposé).
        const [u, v, w] = j === i + 1 ? [a, b, d] : [c, a, b];
        if (cross(u, v, w) === 0 && (v[0] - u[0]) * (w[0] - v[0]) + (v[1] - u[1]) * (w[1] - v[1]) < 0) return 'contour replié sur lui-même';
        continue;
      }
      if (meet(a, b, c, d)) return 'contour qui se recoupe';
    }
  }
  return null;
}

/** Premier contour inconstructible d'une recette (extrusion, révolution, balayage, lissage), ou null. */
export function recipeProfileError(r: SolidRecipe, depth = 0): string | null {
  if (depth > 200) return null;
  switch (r.op) {
    case 'extrude': { const e = profileError(r.profile); return e && `extrusion : ${e}`; }
    case 'revolve': {
      const e = profileError(r.profile);
      if (e) return `révolution : ${e}`;
      // Comme revolveRecipe : le contour reste d'un seul côté de l'axe (axe Z du plan XZ par défaut).
      const side = r.axis
        ? (() => { const u = unit2(r.axis!.dir), o = r.axis!.origin; return r.profile.map(p => u[0] * (p[1] - o[1]) - u[1] * (p[0] - o[0])); })()
        : r.profile.map(p => p[0]);
      if (side.some(v => v > 1e-9) && side.some(v => v < -1e-9)) return 'révolution : le contour traverse l’axe ; il doit rester d’un seul côté';
      return null;
    }
    case 'sweep': {
      const e = Array.isArray(r.profile) ? profileError(r.profile) : null;
      if (e) return `balayage : ${e}`;
      // Trajet : chaque segment de longueur non nulle, chaque arc défini par trois points non alignés.
      const ends = (g: PathSeg): [P2, P2] => (g.kind === 'curve' ? [g.points[0], g.points[g.points.length - 1]] : [g.from, g.to]);
      for (let i = 0; i < r.path.length; i++) {
        const seg = r.path[i];
        if (!(pathLength([seg]) > 0)) return 'balayage : segment de trajet de longueur nulle';
        if (seg.kind === 'arc' && !arc3(seg)) return 'balayage : arc de trajet aux trois points alignés';
        // Trajet d'un seul tenant : chaque segment part de la fin du précédent.
        if (i > 0) { const a = ends(r.path[i - 1])[1], b = ends(seg)[0]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) return `balayage : trajet discontinu (segment ${i + 1})`; }
      }
      return null;
    }
    case 'loft': {
      for (const s of r.sections) { const e = 'points' in s ? profileError(s.points) : null; if (e) return `lissage : ${e}`; }
      // Cotes strictement croissantes ou strictement décroissantes, comme dans l'atelier.
      const zs = r.sections.map(s => s.z);
      const up = zs.every((z, i) => i === 0 || z > zs[i - 1]), down = zs.every((z, i) => i === 0 || z < zs[i - 1]);
      return up || down ? null : 'lissage : les cotes des sections doivent croître (ou décroître) strictement';
    }
    case 'compound': { for (const p of r.parts) { const e = recipeProfileError(p, depth + 1); if (e) return e; } return null; }
    // Faces désignées (pousser / tirer, coque, congé d'arêtes) : nommées dans la recette d'entrée,
    // sinon le noyau ne saurait pas les retrouver (référence « à réparer » dès la création).
    case 'pushpull': case 'shell': case 'fillet': {
      const label = r.op === 'pushpull' ? 'pousser / tirer' : r.op === 'shell' ? 'coque' : 'congé';
      const faces = r.op === 'pushpull' ? [r.face] : r.op === 'shell' ? (r.open === undefined ? [] : Array.isArray(r.open) ? r.open : [r.open]) : (r.edges ?? []).flatMap(e => e.faces);
      if (faces.length) {
        const supports = featureSupports(r.of);
        for (const f of faces) {
          const s = supportOf(supports, f);
          if ('reason' in s) return `${label} : face ${f.feature}.${f.role} introuvable (${s.reason})`;
          // Pousser / tirer : une face plane seulement (le noyau la déplace le long de sa normale).
          if (r.op === 'pushpull' && s.support.kind !== 'plane') return `pousser / tirer : face ${f.feature}.${f.role} non plane`;
        }
      }
      return recipeProfileError(r.of, depth + 1);
    }
    default:
      if ('a' in r) return recipeProfileError(r.a, depth + 1) ?? recipeProfileError(r.b, depth + 1);
      if ('of' in r) return recipeProfileError(r.of, depth + 1);
      return null;
  }
}

/** Recette bien formée (relecture d'un projet) : opérations connues, nombres finis, profondeur bornée. */
export function isRecipe(r: unknown, depth = 0): r is SolidRecipe {
  if (depth > 200 || !r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  const num = (v: unknown, pos = false) => typeof v === 'number' && Number.isFinite(v) && (!pos || v > 0);
  const v3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => num(n));
  const p2 = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(n => num(n));
  const profile = (v: unknown) => Array.isArray(v) && v.length >= 3 && v.every(p2);
  // Direction : composantes finies et longueur non nulle (on la divise par sa norme).
  const dirOk = (v: unknown) => (v3(v) || p2(v)) && (v as number[]).some(n => n !== 0);
  const opt = (v: unknown, f: (v: unknown) => boolean) => v === undefined || f(v);
  switch (x.op) {
    case 'box': return num(x.x, true) && num(x.y, true) && num(x.z, true) && opt(x.at, v3);
    case 'cylinder': return num(x.r, true) && num(x.h, true) && opt(x.at, v3) && opt(x.dir, d => v3(d) && dirOk(d));
    case 'extrude': return profile(x.profile) && num(x.height, true) && opt(x.z, num);
    case 'revolve': return profile(x.profile) && num(x.angle, true) && (x.angle as number) <= 360
      && opt(x.axis, a => !!a && typeof a === 'object' && p2((a as Record<string, unknown>).origin) && dirOk((a as Record<string, unknown>).dir) && p2((a as Record<string, unknown>).dir));
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
    case 'step': {
      const b = x.bounds as { min?: unknown; max?: unknown } | undefined;
      return typeof x.data === 'string' && x.data.startsWith('ISO-10303-21;') && !!b && v3(b.min) && v3(b.max)
        && Array.isArray(x.trace) && x.trace.every(l => Array.isArray(l) && l.length % 2 === 0 && l.every(n => num(n)));
    }
    case 'compound': return Array.isArray(x.parts) && x.parts.length > 0 && x.parts.every(p => isRecipe(p, depth + 1));
    case 'polyhedron': return Array.isArray(x.faces) && x.faces.length > 0 && x.faces.every(f => Array.isArray(f) && f.length >= 3 && f.every(v3));
    case 'union': case 'cut': case 'intersect': return isRecipe(x.a, depth + 1) && isRecipe(x.b, depth + 1);
    case 'fillet': {
      // Arêtes désignées (facultatives) : chacune par ses deux faces adjacentes.
      const face = (f: unknown) => !!f && typeof f === 'object' && typeof (f as FaceRef).feature === 'string' && typeof (f as FaceRef).role === 'string';
      const edge = (e: unknown) => !!e && typeof e === 'object' && Array.isArray((e as { faces?: unknown }).faces) && (e as { faces: unknown[] }).faces.length === 2 && (e as { faces: unknown[] }).faces.every(face);
      return num(x.r, true) && (x.edges === undefined || (Array.isArray(x.edges) && x.edges.every(edge))) && isRecipe(x.of, depth + 1);
    }
    case 'pushpull': {
      const f = x.face as FaceRef | undefined;
      return !!f && typeof f.feature === 'string' && typeof f.role === 'string' && num(x.distance) && x.distance !== 0 && isRecipe(x.of, depth + 1);
    }
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
    if (x.op === 'compound') { x.parts.forEach(walk); return; }
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

// ——— Pousser / tirer (lot 15.6) ———

/** Coins de la face plane poussée, avant et après ; `vertical` : normale verticale (dessus, dessous). */
function pushedFace(r: Extract<SolidRecipe, { op: 'pushpull' }>): { before: Vec3[]; after: Vec3[]; vertical: boolean } | null {
  const s = supportOf(featureSupports(r.of), r.face);
  if ('reason' in s || s.support.kind === 'cylinder') return null;
  if (s.support.kind === 'disc') {
    // Base ou dessus d'un cylindre vertical.
    const d = s.support;
    if (Math.abs(Math.abs(d.n[2]) - 1) > 1e-9) return null;
    const before: Vec3[] = [[d.o[0] - d.r, d.o[1] - d.r, d.o[2]], [d.o[0] + d.r, d.o[1] + d.r, d.o[2]]];
    return { before, after: before.map(q => [q[0], q[1], q[2] + d.n[2] * r.distance] as Vec3), vertical: true };
  }
  const p = s.support;
  const at = (a: number, b: number): Vec3 => [0, 1, 2].map(i => p.o[i] + p.u[i] * a + p.v[i] * b) as Vec3;
  const before = [at(p.ur[0], p.vr[0]), at(p.ur[1], p.vr[0]), at(p.ur[1], p.vr[1]), at(p.ur[0], p.vr[1])];
  const after = before.map(q => [0, 1, 2].map(i => q[i] + p.n[i] * r.distance) as Vec3);
  return { before, after, vertical: Math.abs(Math.abs(p.n[2]) - 1) < 1e-9 };
}

/** Enveloppe convexe (chaîne monotone), sens trigonométrique. */
function hull2(pts: P2[]): P2[] {
  const ps = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P2[]) => {
    const h: P2[] = [];
    for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 1e-9) h.pop(); h.push(p); }
    return h.slice(0, -1);
  };
  return [...half(ps), ...half([...ps].reverse())];
}

/** Pousser / tirer une face plane désignée de `distance` mm (≠ 0) selon sa normale sortante. */
export function pushPullRecipe(of: SolidRecipe, face: FaceRef, distance: number): SolidResult {
  if (!Number.isFinite(distance) || distance === 0) return { error: 'Pousser / tirer : distance non nulle attendue (positive : tirer ; négative : pousser).' };
  const s = supportOf(featureSupports(of), face);
  if ('reason' in s) return { error: `Pousser / tirer : ${s.reason}.` };
  if (s.support.kind === 'cylinder') return { error: 'Pousser / tirer : face plane attendue.' };
  return { recipe: { op: 'pushpull', of, face, distance } };
}

// ——— Pièces et occurrences (lot 16.3) ———

/** Forme de la pièce dans son repère local (point de base à l'origine, orientation nulle). */
export function partLocalRecipe(def: SolidObj): SolidRecipe | null {
  if (!def.partDef) return null;
  const [ox, oy, oz] = def.partDef.origin;
  const moved: SolidRecipe = { op: 'translate', of: def.recipe, by: [-ox, -oy, -oz] };
  return def.partDef.angle ? { op: 'rotate', of: moved, angle: -def.partDef.angle, about: [0, 0] } : moved;
}

/** Recette posée d'une occurrence : la pièce, placée en (x, y, z) et tournée de son angle. */
export function occurrenceRecipe(o: { x: number; y: number; z: number; angle: number }, def: CadObject | undefined): SolidRecipe | null {
  if (def?.kind !== 'solid') return null;
  const local = partLocalRecipe(def);
  if (!local) return null;
  const placed: SolidRecipe = { op: 'translate', of: local, by: [o.x, o.y, o.z] };
  return o.angle ? { op: 'rotate', of: placed, angle: o.angle, about: [o.x, o.y] } : placed;
}

/** Solide effectif d'un objet : le solide lui-même, ou la forme posée d'une occurrence. */
export function effectiveSolid(o: CadObject, objects: CadObject[]): SolidObj | null {
  if (o.kind === 'solid') return o;
  if (o.kind !== 'occurrence') return null;
  const recipe = occurrenceRecipe(o, objects.find(x => x.id === o.sourceId));
  return recipe ? { ...(o as unknown as SolidObj), kind: 'solid', recipe, partDef: undefined } : null;
}

/** Prochain repère de pièce (1, 2, 3…). */
export const nextPartNo = (objects: CadObject[]) => Math.max(0, ...objects.map(o => (o.kind === 'solid' && o.partDef ? o.partDef.no : 0))) + 1;

/** Occurrences d'une pièce, numérotées dans l'ordre du projet ; la pièce type compte pour la première. */
export function partInstances(defId: string, objects: CadObject[]): string[] {
  return [defId, ...objects.filter(o => o.kind === 'occurrence' && o.sourceId === defId).map(o => o.id)];
}

/**
 * Prisme droit vertical (lot 19.1, échange IFC) : contour du plan (ou cercle) extrudé de z0 à z0 + h.
 */
export type Prism = { ring: P2[]; z0: number; h: number } | { circle: { cx: number; cy: number; r: number }; z0: number; h: number };

/**
 * Décomposition exacte d'une recette en prismes verticaux, ou null : pavé, cylindre vertical,
 * extrusion, leurs déplacements, rotations autour de la verticale, symétries et homothéties,
 * assemblages, et unions de parties disjointes (volumes additifs). Tout autre solide (booléen à
 * recouvrement, congé, coque, balayage…) n'est pas un assemblage de prismes : null.
 */
export function solidPrisms(r: SolidRecipe): Prism[] | null {
  const mapXY = (ps: Prism[] | null, f: (p: P2) => P2, reverse = false): Prism[] | null => ps && ps.map(p => {
    if ('circle' in p) { const [cx, cy] = f([p.circle.cx, p.circle.cy]); return { ...p, circle: { ...p.circle, cx, cy } }; }
    const ring = p.ring.map(f);
    return { ...p, ring: reverse ? ring.reverse() : ring };
  });
  switch (r.op) {
    case 'box': {
      const [x, y, z] = r.at ?? [0, 0, 0];
      return r.x > 0 && r.y > 0 && r.z > 0 ? [{ ring: [[x, y], [x + r.x, y], [x + r.x, y + r.y], [x, y + r.y]], z0: z, h: r.z }] : null;
    }
    case 'cylinder': {
      const [x, y, z] = r.at ?? [0, 0, 0];
      const d = r.dir ?? [0, 0, 1];
      if (d[0] !== 0 || d[1] !== 0 || d[2] === 0) return null;
      return [{ circle: { cx: x, cy: y, r: r.r }, z0: d[2] > 0 ? z : z - r.h, h: r.h }];
    }
    case 'extrude': return [{ ring: r.profile.map(p => [p[0], p[1]] as P2), z0: r.z ?? 0, h: r.height }];
    case 'translate': {
      const ps = solidPrisms(r.of);
      return ps && mapXY(ps, ([x, y]) => [x + r.by[0], y + r.by[1]])!.map(p => ({ ...p, z0: p.z0 + r.by[2] }));
    }
    case 'rotate': {
      const a = (r.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [ox, oy] = r.about;
      return mapXY(solidPrisms(r.of), ([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
    }
    case 'mirror': return mapXY(solidPrisms(r.of), ([x, y]) => (r.axis === 'x' ? [2 * r.value - x, y] : [x, 2 * r.value - y]), true);
    case 'scale': {
      const k = r.factor, [ax, ay, az] = r.about;
      const ps = mapXY(solidPrisms(r.of), ([x, y]) => [ax + k * (x - ax), ay + k * (y - ay)]);
      return ps && ps.map(p => ({ ...('circle' in p ? { circle: { ...p.circle, r: p.circle.r * k } } : { ring: p.ring }), z0: az + k * (p.z0 - az), h: p.h * k }) as Prism);
    }
    case 'compound': {
      const all = r.parts.map(solidPrisms);
      return all.every(Boolean) ? all.flat() as Prism[] : null;
    }
    case 'union': {
      const a = solidPrisms(r.a), b = solidPrisms(r.b);
      if (!a || !b) return null;
      // Parties disjointes seulement (contact admis) : le volume de l'union est la somme.
      const ba = recipeBounds(r.a), bb = recipeBounds(r.b);
      const apart = [0, 1, 2].some(i => ba.max[i] <= bb.min[i] || bb.max[i] <= ba.min[i]);
      return apart ? [...a, ...b] : null;
    }
    default: return null;
  }
}

/** Volume d'un prisme (mm³). */
export function prismVolume(p: Prism): number {
  if ('circle' in p) return Math.PI * p.circle.r * p.circle.r * p.h;
  const a = Math.abs(p.ring.reduce((s, q, i) => { const n = p.ring[(i + 1) % p.ring.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0)) / 2;
  return a * p.h;
}
