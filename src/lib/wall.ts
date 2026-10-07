// Murs (lot 4.1) : épaisseur, justification (axe ou nu gauche / droit), jonctions en L, T et croix
// nettoyées. Fonctions pures, repère du modèle (Y vers le bas).
//
// Principe : chaque mur est un quadrilatère (deux faces et deux abouts). Aux jonctions :
// - L (extrémités communes) : chaque face est prolongée jusqu'à la face la plus éloignée de l'autre mur ;
// - T (extrémité sur un autre mur) : le mur est prolongé jusqu'à l'axe du mur porteur ;
// - croix : rien à prolonger.
// Puis toute portion de face ou d'about strictement à l'intérieur d'un autre mur est retirée.
import type { OpeningObj, WallObj } from '@/types/cad';
import { openingGeometry } from '@/lib/opening';

export interface Pt { x: number; y: number }
type Seg = [Pt, Pt];

const EPS = 1e-6;
const JOIN_TOLERANCE = 0.5; // mm : extrémités considérées comme communes

export interface WallGeometry {
  /** Contour du mur (après jonctions), dans l'ordre : face gauche, about de fin, face droite, about de début. */
  quad: [Pt, Pt, Pt, Pt];
  /** Traits visibles du mur, une fois les jonctions nettoyées. */
  edges: Seg[];
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Décalages des faces gauche et droite par rapport au trait tracé (gauche = côté gauche à l'écran). */
export function faceOffsets(w: Pick<WallObj, 'thickness' | 'justification'>): { left: number; right: number } {
  const t = w.thickness;
  if (w.justification === 'gauche') return { left: 0, right: t };
  if (w.justification === 'droite') return { left: t, right: 0 };
  return { left: t / 2, right: t / 2 };
}

interface Frame { a: Pt; b: Pt; u: Pt; l: Pt; len: number; left: number; right: number }

function frameOf(w: WallObj): Frame | null {
  const a = { x: w.x1, y: w.y1 }, b = { x: w.x2, y: w.y2 };
  const len = dist(a, b);
  if (len < EPS || !(w.thickness > 0)) return null;
  const u = mul(sub(b, a), 1 / len);
  // Normale gauche à l'écran (Y vers le bas) : pour u = (1, 0), (0, −1), vers le haut.
  const l = { x: u.y, y: -u.x };
  const { left, right } = faceOffsets(w);
  return { a, b, u, l, len, left, right };
}

/** Intersection de deux droites (point + direction) ; null si parallèles. */
function lineLine(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(q, p), e) / den;
  return add(p, mul(d, t));
}

/**
 * Géométrie de tous les murs, jonctions nettoyées. Les murs dégénérés (longueur ou épaisseur nulle)
 * sont ignorés.
 */
export function wallsGeometry(walls: WallObj[], openings: OpeningObj[] = []): Map<string, WallGeometry> {
  const frames = new Map<string, Frame>();
  for (const w of walls) { const f = frameOf(w); if (f) frames.set(w.id, f); }
  const ids = [...frames.keys()];
  // Extension des faces, en abscisse le long du mur depuis son début : [début gauche, début droite, fin gauche, fin droite].
  const ext = new Map<string, { s: [number, number]; e: [number, number]; capS: boolean; capE: boolean }>();
  for (const id of ids) ext.set(id, { s: [0, 0], e: [frames.get(id)!.len, frames.get(id)!.len], capS: true, capE: true });

  /** Nombre de murs dont une extrémité est au point (à la tolérance de jonction près). */
  const nodeDegree = (p: Pt) => ids.filter(i => dist(frames.get(i)!.a, p) <= JOIN_TOLERANCE || dist(frames.get(i)!.b, p) <= JOIN_TOLERANCE).length;
  const faceLine = (f: Frame, side: 'left' | 'right'): { p: Pt; d: Pt } => ({ p: add(f.a, mul(f.l, side === 'left' ? f.left : -f.right)), d: f.u });
  const along = (f: Frame, p: Pt) => dot(sub(p, f.a), f.u);

  for (const id of ids) {
    const f = frames.get(id)!;
    const x = ext.get(id)!;
    for (const end of ['s', 'e'] as const) {
      const pt = end === 's' ? f.a : f.b;
      for (const oid of ids) {
        if (oid === id) continue;
        const g = frames.get(oid)!;
        const shared = dist(pt, g.a) <= JOIN_TOLERANCE ? 'a' : dist(pt, g.b) <= JOIN_TOLERANCE ? 'b' : null;
        if (shared && nodeDegree(pt) > 2) {
          // Nœud de trois murs ou plus : pas d'onglet (il serait faux deux à deux) ; les abouts restent
          // et le nettoyage retire ce qui est à l'intérieur des autres murs.
          continue;
        }
        if (shared) {
          const collinear = Math.abs(cross(f.u, g.u)) < 1e-9;
          if (collinear) {
            // Continuation dans le même alignement : pas d'about à la jonction.
            if (end === 's') x.capS = false; else x.capE = false;
            continue;
          }
          // Jonction en L : chaque face va jusqu'à la face de l'autre mur la plus éloignée ; l'about,
          // qui doublerait la face extérieure de l'autre mur, est supprimé.
          if (end === 's') x.capS = false; else x.capE = false;
          for (const [i, side] of [[0, 'left'], [1, 'right']] as const) {
            const fl = faceLine(f, side);
            const cands = (['left', 'right'] as const)
              .map(s => { const gl = faceLine(g, s); return lineLine(fl.p, fl.d, gl.p, gl.d); })
              .filter((p): p is Pt => !!p)
              .map(p => along(f, p));
            if (!cands.length) continue;
            if (end === 's') x.s[i] = Math.min(x.s[i], ...cands);
            else x.e[i] = Math.max(x.e[i], ...cands);
          }
          continue;
        }
        // Jonction en T : l'extrémité touche le corps d'un autre mur → prolonger jusqu'à son axe.
        const axisMid = (g.left - g.right) / 2; // décalage de l'axe par rapport au trait tracé
        const axisP = add(g.a, mul(g.l, axisMid));
        const s = dot(sub(pt, axisP), g.u);
        const off = Math.abs(dot(sub(pt, axisP), g.l));
        const half = (g.left + g.right) / 2;
        if (s > JOIN_TOLERANCE && s < g.len - JOIN_TOLERANCE && off <= half + JOIN_TOLERANCE) {
          const hit = lineLine(f.a, f.u, axisP, g.u);
          if (!hit) continue;
          const t = along(f, hit);
          if (end === 's' && t < x.s[0]) { x.s = [Math.min(x.s[0], t), Math.min(x.s[1], t)]; }
          if (end === 'e' && t > x.e[0]) { x.e = [Math.max(x.e[0], t), Math.max(x.e[1], t)]; }
        }
      }
    }
  }

  // Quadrilatères après extension.
  const quads = new Map<string, [Pt, Pt, Pt, Pt]>();
  for (const id of ids) {
    const f = frames.get(id)!, x = ext.get(id)!;
    const L = (t: number) => add(add(f.a, mul(f.u, t)), mul(f.l, f.left));
    const R = (t: number) => add(add(f.a, mul(f.u, t)), mul(f.l, -f.right));
    quads.set(id, [L(x.s[0]), L(x.e[0]), R(x.e[1]), R(x.s[1])]);
  }

  // Traits visibles : faces et abouts, sans les portions strictement intérieures à un autre mur.
  const out = new Map<string, WallGeometry>();
  for (const id of ids) {
    const q = quads.get(id)!, x = ext.get(id)!;
    const raw: Seg[] = [[q[0], q[1]], [q[3], q[2]]];
    if (x.capE) raw.push([q[1], q[2]]);
    if (x.capS) raw.push([q[3], q[0]]);
    let edges = raw;
    for (const oid of ids) {
      if (oid === id) continue;
      const other = quads.get(oid)!;
      edges = edges.flatMap(s => clipOutside(s, other));
    }
    // Ouvertures : faces coupées sur la largeur de la baie, tableaux ajoutés.
    const w = walls.find(v => v.id === id)!;
    const f = frames.get(id)!;
    for (const op of openings.filter(o => o.hostId === id)) {
      const g = openingGeometry(op, w);
      if (!g) continue;
      edges = edges.flatMap(s => cutAlong(s, f, g.from, g.to));
      edges.push(...g.jambs);
    }
    out.set(id, { quad: q, edges: edges.filter(([a, b]) => dist(a, b) > EPS) });
  }
  return out;
}

/** Retire d'un trait parallèle au mur la portion comprise entre les abscisses t0 et t1 (le long du mur). */
function cutAlong([a, b]: Seg, f: Frame, t0: number, t1: number): Seg[] {
  const ta = dot(sub(a, f.a), f.u), tb = dot(sub(b, f.a), f.u);
  // Trait en travers du mur (about) : inchangé.
  if (Math.abs(ta - tb) < EPS) return [[a, b]];
  const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
  if (t1 <= lo + EPS || t0 >= hi - EPS) return [[a, b]];
  const at = (t: number) => add(a, mul(sub(b, a), (t - ta) / (tb - ta)));
  const out: Seg[] = [];
  if (t0 > lo + EPS) out.push(ta < tb ? [a, at(t0)] : [at(t0), b]);
  if (t1 < hi - EPS) out.push(ta < tb ? [at(t1), b] : [a, at(t1)]);
  return out;
}

/** Parties d'un segment qui ne sont pas strictement à l'intérieur d'un polygone convexe. */
function clipOutside([a, b]: Seg, poly: Pt[]): Seg[] {
  const ts = [0, 1];
  const d = sub(b, a);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const e = sub(q, p);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross(sub(p, a), e) / den;
    const u = cross(sub(p, a), d) / den;
    if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) ts.push(t);
  }
  ts.sort((m, n) => m - n);
  const out: Seg[] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i], t1 = ts[i + 1];
    if (t1 - t0 < EPS) continue;
    const mid = add(a, mul(d, (t0 + t1) / 2));
    if (!strictlyInside(mid, poly)) out.push([add(a, mul(d, t0)), add(a, mul(d, t1))]);
  }
  // Recoller les morceaux contigus.
  const merged: Seg[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && dist(last[1], s[0]) < EPS) last[1] = s[1]; else merged.push([s[0], s[1]]);
  }
  return merged;
}

/** Point strictement intérieur à un polygone convexe (à plus de 10⁻⁶ mm de chaque côté). */
function strictlyInside(p: Pt, poly: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const e = sub(b, a);
    const l = Math.hypot(e.x, e.y);
    if (l < EPS) continue;
    const c = cross(e, sub(p, a)) / l;
    if (Math.abs(c) <= 1e-6) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** Contour (polygone) d'un mur seul, sans jonction : pour l'emprise et la sélection. */
export function wallQuad(w: WallObj): [Pt, Pt, Pt, Pt] | null {
  const f = frameOf(w);
  if (!f) return null;
  const L = (t: number) => add(add(f.a, mul(f.u, t)), mul(f.l, f.left));
  const R = (t: number) => add(add(f.a, mul(f.u, t)), mul(f.l, -f.right));
  return [L(0), L(f.len), R(f.len), R(0)];
}
