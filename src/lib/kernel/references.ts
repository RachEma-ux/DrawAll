// Références topologiques (lot 11.3, essai P0) : nommage génératif et support géométrique.
// Une face nommée (fonction + rôle) a un support calculé à partir de la recette courante : une
// portion de plan ou de cylindre. Après une modification amont, les faces du nouveau solide
// entièrement contenues dans ce support sont les candidates. Une seule : la référence est conservée ;
// aucune ou plusieurs : elle est « à réparer », jamais réattribuée en silence.
// Fonctions pures, sans OCCT ; la résolution sur un solide est dans occt.ts.
import type { EdgeRef, FaceRef, SolidRecipe, Vec3 } from './recipe';

export type Support =
  /** Rectangle du plan (o, u, v) : o + a·u + b·v, a ∈ ur, b ∈ vr ; n normale unitaire. */
  | { kind: 'plane'; o: Vec3; n: Vec3; u: Vec3; v: Vec3; ur: [number, number]; vr: [number, number] }
  /** Portion de cylindre d'axe (o, axis) et de rayon r, de hauteur h ∈ hr le long de l'axe. */
  | { kind: 'cylinder'; o: Vec3; axis: Vec3; r: number; hr: [number, number] };

export interface Supports {
  /** fonction → rôle → support. */
  byFeature: Map<string, Map<string, Support>>;
  /** Noms de fonction ou rôles définis deux fois : toute référence qui les vise est à réparer. */
  duplicates: Set<string>;
}

/** Compte rendu d'une référence résolue sur un solide. */
export interface RefReport {
  op: 'congé' | 'coque';
  ref: string;
  status: 'conservée' | 'à réparer';
  reason?: string;
  /** Nombre d'éléments candidats trouvés (1 si conservée). */
  candidates: number;
  /** Milieu de l'arête ou centre de la face retenue (conservée seulement). */
  at?: Vec3;
  /** Rang de l'élément retenu dans la liste du noyau (consigné, jamais utilisé pour désigner). */
  index?: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** Deux vecteurs unitaires orthogonaux entre eux et à `n`. */
function basis(n: Vec3): [Vec3, Vec3] {
  const t: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, t));
  return [u, cross(n, u)];
}

const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0], Z: Vec3 = [0, 0, 1];

/** Supports des faces nommées de chaque primitive nommée de la recette (booléens et dérivés parcourus). */
export function featureSupports(r: SolidRecipe, out: Supports = { byFeature: new Map(), duplicates: new Set() }): Supports {
  const define = (name: string, roles: [string, Support][]) => {
    if (out.byFeature.has(name)) { out.duplicates.add(name); return; }
    const m = new Map<string, Support>();
    for (const [role, s] of roles) {
      if (m.has(role)) out.duplicates.add(`${name}.${role}`);
      m.set(role, s);
    }
    out.byFeature.set(name, m);
  };
  switch (r.op) {
    case 'box': {
      if (!r.name) break;
      const c = r.at ?? [0, 0, 0];
      const px = (o: Vec3, n: Vec3): Support => ({ kind: 'plane', o, n, u: Y, v: Z, ur: [0, r.y], vr: [0, r.z] });
      const py = (o: Vec3, n: Vec3): Support => ({ kind: 'plane', o, n, u: X, v: Z, ur: [0, r.x], vr: [0, r.z] });
      const pz = (o: Vec3, n: Vec3): Support => ({ kind: 'plane', o, n, u: X, v: Y, ur: [0, r.x], vr: [0, r.y] });
      define(r.name, [
        ['xmin', px(c, mul(X, -1))], ['xmax', px(add(c, mul(X, r.x)), X)],
        ['ymin', py(c, mul(Y, -1))], ['ymax', py(add(c, mul(Y, r.y)), Y)],
        ['zmin', pz(c, mul(Z, -1))], ['zmax', pz(add(c, mul(Z, r.z)), Z)],
      ]);
      break;
    }
    case 'cylinder': {
      if (!r.name) break;
      const o = r.at ?? [0, 0, 0], axis = unit(r.dir ?? Z), [u, v] = basis(axis);
      const disc = (c: Vec3, n: Vec3): Support => ({ kind: 'plane', o: c, n, u, v, ur: [-r.r, r.r], vr: [-r.r, r.r] });
      define(r.name, [
        ['wall', { kind: 'cylinder', o, axis, r: r.r, hr: [0, r.h] }],
        ['base', disc(o, mul(axis, -1))],
        ['cap', disc(add(o, mul(axis, r.h)), axis)],
      ]);
      break;
    }
    case 'extrude': {
      if (!r.name) break;
      const xs = r.profile.map(p => p[0]), ys = r.profile.map(p => p[1]);
      const ur: [number, number] = [Math.min(...xs), Math.max(...xs)], vr: [number, number] = [Math.min(...ys), Math.max(...ys)];
      const roles: [string, Support][] = [
        ['bottom', { kind: 'plane', o: [0, 0, 0], n: mul(Z, -1), u: X, v: Y, ur, vr }],
        ['top', { kind: 'plane', o: [0, 0, r.height], n: Z, u: X, v: Y, ur, vr }],
      ];
      r.profile.forEach((a, i) => {
        const b = r.profile[(i + 1) % r.profile.length];
        const d: Vec3 = [b[0] - a[0], b[1] - a[1], 0], len = Math.hypot(d[0], d[1]);
        if (len === 0) return;
        const u = mul(d, 1 / len);
        roles.push([`side:${r.segmentIds?.[i] ?? `s${i}`}`, { kind: 'plane', o: [a[0], a[1], 0], n: [u[1], -u[0], 0], u, v: Z, ur: [0, len], vr: [0, r.height] }]);
      });
      define(r.name, roles);
      break;
    }
    case 'union': case 'cut': case 'intersect': featureSupports(r.a, out); featureSupports(r.b, out); break;
    case 'fillet': case 'shell': featureSupports(r.of, out); break;
  }
  return out;
}

/** Le point est-il sur le support (à `eps` mm près, bords compris) ? */
export function pointOnSupport(s: Support, p: Vec3, eps = 1e-6): boolean {
  const d = sub(p, s.o);
  if (s.kind === 'plane') {
    const a = dot(d, s.u), b = dot(d, s.v);
    return Math.abs(dot(d, s.n)) <= eps && a >= s.ur[0] - eps && a <= s.ur[1] + eps && b >= s.vr[0] - eps && b <= s.vr[1] + eps;
  }
  const h = dot(d, s.axis), radial = sub(d, mul(s.axis, h));
  return Math.abs(Math.hypot(radial[0], radial[1], radial[2]) - s.r) <= eps && h >= s.hr[0] - eps && h <= s.hr[1] + eps;
}

export const faceLabel = (f: FaceRef) => `${f.feature}.${f.role}`;
export const edgeLabel = (e: EdgeRef) => `${faceLabel(e.faces[0])} ∩ ${faceLabel(e.faces[1])}`;

/** Support d'une face nommée, ou la raison pour laquelle elle n'en a pas. */
export function supportOf(s: Supports, f: FaceRef): { support: Support } | { reason: string } {
  if (s.duplicates.has(f.feature) || s.duplicates.has(faceLabel(f))) return { reason: `nom en double dans la recette (${faceLabel(f)})` };
  const m = s.byFeature.get(f.feature);
  if (!m) return { reason: `fonction « ${f.feature} » absente de la recette` };
  const support = m.get(f.role);
  if (!support) return { reason: `rôle « ${f.role} » absent de la fonction « ${f.feature} »` };
  return { support };
}

/** Exigence de surface du noyau pour un support (type de surface OCCT). */
export const surfaceTypeOf = (s: Support) => (s.kind === 'plane' ? 'PLANE' : 'CYLINDRE');
