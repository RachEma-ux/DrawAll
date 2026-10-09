// Nettoyage d'une vue projetée (lot 16.1), sans OCCT : polylignes simplifiées (points alignés retirés,
// une courbe vue par la tranche devient un segment) ; une arête cachée confondue avec une arête vue
// n'est pas dessinée (règle de dessin : le trait continu l'emporte), ni deux fois la même cachée.
import type { ProjLines } from './recipe';

const EPS = 1e-6;

/** Retire les points intérieurs alignés (écart à la corde ≤ EPS) et les points confondus. */
export function simplify(line: number[]): number[] {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < line.length; i += 2) {
    const p: [number, number] = [line[i], line[i + 1]], l = pts[pts.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > EPS) pts.push(p);
  }
  const out: [number, number][] = [];
  for (const p of pts) {
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      const len = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const dev = len > 0 ? Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len : Math.hypot(b[0] - a[0], b[1] - a[1]);
      // b entre a et p, sur la corde : retiré.
      const t = len > 0 ? ((b[0] - a[0]) * (p[0] - a[0]) + (b[1] - a[1]) * (p[1] - a[1])) / (len * len) : 0;
      if (dev <= EPS && t > 0 && t < 1) out.pop(); else break;
    }
    out.push(p);
  }
  return out.flat();
}

type Seg = [number, number, number, number];

const segsOf = (lines: number[][]): Seg[] => lines.flatMap(l => {
  const s: Seg[] = [];
  for (let i = 0; i + 3 < l.length; i += 2) s.push([l[i], l[i + 1], l[i + 2], l[i + 3]]);
  return s;
});

/** Parties de `s` non recouvertes par les segments `cover` qui lui sont colinéaires. */
export function uncovered(s: Seg, cover: Seg[]): Seg[] {
  const dx = s[2] - s[0], dy = s[3] - s[1], len = Math.hypot(dx, dy);
  if (len <= EPS) return [];
  const ux = dx / len, uy = dy / len;
  const along = (x: number, y: number) => (x - s[0]) * ux + (y - s[1]) * uy;
  const off = (x: number, y: number) => Math.abs((x - s[0]) * uy - (y - s[1]) * ux);
  const taken: [number, number][] = [];
  for (const c of cover) {
    if (off(c[0], c[1]) > EPS || off(c[2], c[3]) > EPS) continue;
    const a = along(c[0], c[1]), b = along(c[2], c[3]);
    taken.push([Math.min(a, b), Math.max(a, b)]);
  }
  taken.sort((p, q) => p[0] - q[0]);
  const out: Seg[] = [];
  let t = 0;
  for (const [a, b] of taken) {
    if (a > t + EPS) out.push([s[0] + ux * t, s[1] + uy * t, s[0] + ux * Math.min(a, len), s[1] + uy * Math.min(a, len)]);
    t = Math.max(t, b);
    if (t >= len - EPS) return out;
  }
  if (t < len - EPS) out.push([s[0] + ux * t, s[1] + uy * t, s[2], s[3]]);
  return out;
}

export function cleanProjection(p: ProjLines): ProjLines {
  const visible = p.visible.map(simplify).filter(l => l.length >= 4);
  const vis = segsOf(visible);
  const kept: Seg[] = [];
  const hidden: number[][] = [];
  for (const l of p.hidden.map(simplify).filter(x => x.length >= 4)) {
    // Polyligne cachée : chaque segment, privé de ce que couvrent les vues et les cachées déjà retenues.
    for (const s of segsOf([l])) {
      for (const part of uncovered(s, [...vis, ...kept])) { kept.push(part); hidden.push([...part]); }
    }
  }
  return { visible, hidden };
}
