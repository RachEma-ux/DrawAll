// Solveur de contraintes écrit pour DrawAll (lot 11.1, candidat A de l'essai P0).
// Moindres carrés non linéaires par Levenberg–Marquardt (jacobien par différences centrées),
// degrés de liberté par le rang du jacobien, contraintes redondantes par dépendance linéaire de
// leurs lignes, contraintes en conflit par retrait (la contrainte dont le retrait rend l'esquisse
// soluble). Fonctions pures, sans dépendance.
import { cloneSketch, type Constraint, type Sketch, type SolveReport } from './sketch';

const TOL = 1e-9;
const MAX_ITERATIONS = 200;

interface Vars {
  /** Indices des inconnues : x, y des points libres, r des cercles. */
  px: Map<string, [number, number] | null>;
  cr: Map<string, number>;
  x0: number[];
}

function variables(s: Sketch): Vars {
  const px = new Map<string, [number, number] | null>();
  const cr = new Map<string, number>();
  const x0: number[] = [];
  for (const p of s.points) {
    if (p.fixed) { px.set(p.id, null); continue; }
    px.set(p.id, [x0.length, x0.length + 1]);
    x0.push(p.x, p.y);
  }
  for (const c of s.circles) { cr.set(c.id, x0.length); x0.push(c.r); }
  return { px, cr, x0 };
}

/** Inconnues dont dépend une contrainte (jacobien creux : seules elles sont perturbées). */
function constraintVars(s: Sketch, v: Vars, k: Constraint): number[] {
  const ofPoint = (id: string) => v.px.get(id) ?? [];
  const ofLine = (id: string) => { const l = s.lines.find(q => q.id === id)!; return [...ofPoint(l.p1), ...ofPoint(l.p2)]; };
  const ofCircle = (id: string) => { const c = s.circles.find(q => q.id === id)!; return [...ofPoint(c.c), v.cr.get(id)!]; };
  switch (k.type) {
    case 'coincident': case 'distance': return [...ofPoint(k.a), ...ofPoint(k.b)];
    case 'horizontal': case 'vertical': case 'length': return ofLine(k.line);
    case 'parallel': case 'perpendicular': case 'equal': case 'angle': return [...ofLine(k.l1), ...ofLine(k.l2)];
    case 'radius': return ofCircle(k.circle);
    case 'tangent': return [...ofLine(k.line), ...ofCircle(k.circle)];
    case 'pointOnLine': return [...ofPoint(k.point), ...ofLine(k.line)];
    case 'pointOnCircle': return [...ofPoint(k.point), ...ofCircle(k.circle)];
  }
}

/** Fonctions d'écart de chaque contrainte (nulles quand elle est satisfaite). */
function residualFunctions(s: Sketch, v: Vars) {
  const point = (id: string) => {
    const p = s.points.find(q => q.id === id);
    if (!p) throw new Error(`Point inconnu ${id}`);
    const idx = v.px.get(id);
    return (x: number[]) => (idx ? { x: x[idx[0]], y: x[idx[1]] } : { x: p.x, y: p.y });
  };
  const line = (id: string) => {
    const l = s.lines.find(q => q.id === id);
    if (!l) throw new Error(`Segment inconnu ${id}`);
    const a = point(l.p1), b = point(l.p2);
    return (x: number[]) => { const p = a(x), q = b(x); return { a: p, b: q, dx: q.x - p.x, dy: q.y - p.y }; };
  };
  const circle = (id: string) => {
    const c = s.circles.find(q => q.id === id);
    if (!c) throw new Error(`Cercle inconnu ${id}`);
    const center = point(c.c), ri = v.cr.get(id)!;
    return (x: number[]) => ({ c: center(x), r: x[ri] });
  };
  const len = (d: { dx: number; dy: number }) => Math.hypot(d.dx, d.dy) || 1e-12;
  const fns = s.constraints.map((k: Constraint): ((x: number[]) => number[]) => {
    switch (k.type) {
      case 'coincident': { const a = point(k.a), b = point(k.b); return x => { const p = a(x), q = b(x); return [p.x - q.x, p.y - q.y]; }; }
      case 'horizontal': { const l = line(k.line); return x => [l(x).dy]; }
      case 'vertical': { const l = line(k.line); return x => [l(x).dx]; }
      // Parallèle / perpendiculaire : produit vectoriel / scalaire ramené à une longueur (mm).
      case 'parallel': { const a = line(k.l1), b = line(k.l2); return x => { const p = a(x), q = b(x); return [(p.dx * q.dy - p.dy * q.dx) / len(q)]; }; }
      case 'perpendicular': { const a = line(k.l1), b = line(k.l2); return x => { const p = a(x), q = b(x); return [(p.dx * q.dx + p.dy * q.dy) / len(q)]; }; }
      case 'equal': { const a = line(k.l1), b = line(k.l2); return x => [len(a(x)) - len(b(x))]; }
      case 'distance': { const a = point(k.a), b = point(k.b); return x => { const p = a(x), q = b(x); return [Math.hypot(p.x - q.x, p.y - q.y) - k.value]; }; }
      case 'length': { const l = line(k.line); return x => [len(l(x)) - k.value]; }
      case 'radius': { const c = circle(k.circle); return x => [c(x).r - k.value]; }
      case 'angle': {
        // Angle orienté de l1 vers l2 (degrés), écart ramené dans ]−180 ; 180] puis en mm sur la longueur de l2.
        const a = line(k.l1), b = line(k.l2);
        return x => {
          const p = a(x), q = b(x);
          let d = (Math.atan2(p.dx * q.dy - p.dy * q.dx, p.dx * q.dx + p.dy * q.dy) * 180) / Math.PI - k.value;
          d = ((d + 180) % 360 + 360) % 360 - 180;
          return [(d * Math.PI / 180) * len(q)];
        };
      }
      case 'tangent': {
        const l = line(k.line), c = circle(k.circle);
        return x => { const p = l(x), o = c(x); return [Math.abs((p.dx * (o.c.y - p.a.y) - p.dy * (o.c.x - p.a.x)) / len(p)) - o.r]; };
      }
      case 'pointOnLine': { const a = point(k.point), l = line(k.line); return x => { const p = a(x), q = l(x); return [(q.dx * (p.y - q.a.y) - q.dy * (p.x - q.a.x)) / len(q)]; }; }
      case 'pointOnCircle': { const a = point(k.point), c = circle(k.circle); return x => { const p = a(x), o = c(x); return [Math.hypot(p.x - o.c.x, p.y - o.c.y) - o.r]; }; }
    }
  });
  return fns.map((f, i): Residual => ({ f, vars: constraintVars(s, v, s.constraints[i]) }));
}

/** Résolution de A·x = b (A carrée) par élimination de Gauss à pivot partiel ; null si singulière. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

type Residual = { f: (x: number[]) => number[]; vars: number[] };

function evaluate(fs: Residual[], x: number[]): { r: number[]; owner: number[] } {
  const r: number[] = [], owner: number[] = [];
  fs.forEach((f, i) => { for (const v of f.f(x)) { r.push(v); owner.push(i); } });
  return { r, owner };
}

/** Jacobien par différences centrées, contrainte par contrainte sur ses seules inconnues. */
function jacobian(fs: Residual[], x: number[]): number[][] {
  const J: number[][] = [];
  const xx = x.slice();
  for (const { f, vars } of fs) {
    const rows = f(xx).map(() => new Array(x.length).fill(0));
    for (const j of new Set(vars)) {
      const h = 1e-7 * Math.max(1, Math.abs(x[j]));
      xx[j] = x[j] + h; const rp = f(xx);
      xx[j] = x[j] - h; const rm = f(xx);
      xx[j] = x[j];
      for (let i = 0; i < rows.length; i++) rows[i][j] = (rp[i] - rm[i]) / (2 * h);
    }
    J.push(...rows);
  }
  return J;
}

const maxAbs = (v: number[]) => v.reduce((a, b) => Math.max(a, Math.abs(b)), 0);

/** Levenberg–Marquardt : renvoie la meilleure position trouvée. */
function levenbergMarquardt(fs: Residual[], x0: number[]): { x: number[]; residual: number; iterations: number } {
  let x = x0.slice(), { r } = evaluate(fs, x), cost = r.reduce((a, v) => a + v * v, 0), lambda = 1e-3, it = 0;
  if (x.length === 0) return { x, residual: maxAbs(r), iterations: 0 };
  for (; it < MAX_ITERATIONS && maxAbs(r) > TOL; it++) {
    const J = jacobian(fs, x), n = x.length;
    // Jᵀ·J et Jᵀ·r en parcourant les seuls termes non nuls de chaque ligne.
    const JtJ = Array.from({ length: n }, () => new Array(n).fill(0));
    const Jtr = new Array(n).fill(0);
    J.forEach((row, i) => {
      const nz: number[] = [];
      for (let k = 0; k < n; k++) if (row[k] !== 0) nz.push(k);
      for (const a of nz) { Jtr[a] += row[a] * r[i]; for (const b of nz) JtJ[a][b] += row[a] * row[b]; }
    });
    let improved = false;
    for (let tries = 0; tries < 30 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * Math.max(v, 1e-9) : v)));
      const d = solveLinear(A, Jtr.map(v => -v));
      if (!d) { lambda *= 10; continue; }
      const xn = x.map((v, i) => v + d[i]);
      const rn = evaluate(fs, xn).r, cn = rn.reduce((a, v) => a + v * v, 0);
      if (cn < cost) { x = xn; r = rn; cost = cn; lambda = Math.max(lambda / 10, 1e-12); improved = true; }
      else lambda *= 10;
    }
    if (!improved) break;
  }
  return { x, residual: maxAbs(r), iterations: it };
}

/**
 * Lignes du jacobien indépendantes (Gram–Schmidt modifié, dans l'ordre des contraintes). Une
 * contrainte n'est redondante que si **aucune** de ses lignes n'augmente le rang : une coïncidence
 * dont une seule équation est déjà imposée reste utile.
 */
function dependentConstraints(J: number[][], owner: number[]): { rank: number; dependent: Set<number> } {
  const basis: number[][] = [], dependentRow = new Set<number>(), useful = new Set<number>();
  const scale = Math.max(1e-12, ...J.map(row => maxAbs(row)));
  J.forEach((row, i) => {
    const v = row.slice();
    for (const b of basis) { const p = v.reduce((s, x, k) => s + x * b[k], 0); for (let k = 0; k < v.length; k++) v[k] -= p * b[k]; }
    const nv = Math.hypot(...v);
    if (nv > 1e-7 * scale) { basis.push(v.map(x => x / nv)); useful.add(owner[i]); }
    else dependentRow.add(owner[i]);
  });
  return { rank: basis.length, dependent: new Set([...dependentRow].filter(o => !useful.has(o))) };
}

function apply(s: Sketch, v: Vars, x: number[]): Sketch {
  const out = cloneSketch(s);
  for (const p of out.points) { const idx = v.px.get(p.id); if (idx) { p.x = x[idx[0]]; p.y = x[idx[1]]; } }
  for (const c of out.circles) c.r = x[v.cr.get(c.id)!];
  return out;
}

const solvable = (s: Sketch, constraints: Constraint[]) => {
  const sub = { ...s, constraints };
  const w = variables(sub);
  return levenbergMarquardt(residualFunctions(sub, w), w.x0).residual <= 1e-6;
};

/**
 * Contraintes en conflit, conflits multiples compris. Les contraintes sont reprises une à une : celle
 * qui rend l'ensemble déjà retenu insoluble est en conflit, avec chaque contrainte retenue dont le
 * retrait lève ce conflit ; elle est ensuite écartée, et la recherche continue (un second conflit,
 * indépendant du premier, est trouvé de même).
 */
function conflictingConstraints(s: Sketch): string[] {
  const kept: Constraint[] = [], culprits = new Set<string>();
  for (const k of s.constraints) {
    if (solvable(s, [...kept, k])) { kept.push(k); continue; }
    culprits.add(k.id);
    for (const c of kept) if (solvable(s, [...kept.filter(x => x !== c), k])) culprits.add(c.id);
  }
  return s.constraints.filter(c => culprits.has(c.id)).map(c => c.id);
}

export function solveSketch(input: Sketch): SolveReport {
  const v = variables(input);
  const fs = residualFunctions(input, v);
  const { x, residual, iterations } = levenbergMarquardt(fs, v.x0);
  const solved = residual <= 1e-6;
  const { owner } = evaluate(fs, x);
  const J = x.length ? jacobian(fs, x) : [];
  const { rank, dependent } = x.length ? dependentConstraints(J, owner) : { rank: 0, dependent: new Set<number>() };
  const ids = (set: Set<number>) => [...set].sort((a, b) => a - b).map(i => input.constraints[i].id);
  let conflicting: string[] = [];
  let redundant = ids(dependent);
  if (!solved) {
    conflicting = conflictingConstraints(input);
    redundant = redundant.filter(id => !conflicting.includes(id));
  }
  return { solved, residual, dof: x.length - rank, redundant, conflicting, iterations, sketch: apply(input, v, x) };
}

/** Plus grand écart des contraintes d'une esquisse (même mesure pour tous les solveurs comparés). */
export function measureResidual(s: Sketch): number {
  const v = variables(s);
  return maxAbs(evaluate(residualFunctions(s, v), v.x0).r);
}
