// Pièces et surfaces (lot 4.3). Une pièce est désignée par un point intérieur : son contour est la
// face fermée formée par les faces des murs qui contient ce point. Le contour est recalculé à chaque
// modification des murs (pièce associative). Les ouvertures ne coupent pas le contour d'une pièce.
// Fonctions pures, repère du modèle (Y vers le bas), longueurs en mm.
import type { WallObj } from '@/types/cad';
import { wallsGeometry, wallQuad } from '@/lib/wall';
import { pointInLoop } from '@/lib/hatch';

export interface Pt { x: number; y: number }
type Seg = [Pt, Pt];

const KEY = 1e-4; // mm : fusion des sommets

/** Aire signée (formule du lacet), positive pour un parcours antihoraire en Y vers le haut. */
function signedArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

/** Découpe des segments à leurs intersections mutuelles. */
function splitAll(segs: Seg[]): Seg[] {
  const cuts: number[][] = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = segs[i], [c, d] = segs[j];
      const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
      const den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) < 1e-12) {
        // Segments parallèles : s'ils sont alignés et se recouvrent, chacun est coupé aux extrémités de l'autre.
        const lr = Math.hypot(r.x, r.y), ls = Math.hypot(s.x, s.y);
        if (lr < KEY || ls < KEY) continue;
        const off = Math.abs((c.x - a.x) * r.y - (c.y - a.y) * r.x) / lr;
        if (off > KEY) continue;
        const onI = (p: Pt) => ((p.x - a.x) * r.x + (p.y - a.y) * r.y) / (lr * lr);
        const onJ = (p: Pt) => ((p.x - c.x) * s.x + (p.y - c.y) * s.y) / (ls * ls);
        for (const t of [onI(c), onI(d)]) if (t > 1e-9 && t < 1 - 1e-9) cuts[i].push(t);
        for (const u of [onJ(a), onJ(b)]) if (u > 1e-9 && u < 1 - 1e-9) cuts[j].push(u);
        continue;
      }
      const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
      const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
      if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) { cuts[i].push(t); cuts[j].push(u); }
    }
  }
  const out: Seg[] = [];
  segs.forEach(([a, b], i) => {
    const ts = [...new Set(cuts[i].map(t => Math.min(1, Math.max(0, t))))].sort((m, n) => m - n);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = { x: a.x + (b.x - a.x) * ts[k], y: a.y + (b.y - a.y) * ts[k] };
      const q = { x: a.x + (b.x - a.x) * ts[k + 1], y: a.y + (b.y - a.y) * ts[k + 1] };
      if (Math.hypot(q.x - p.x, q.y - p.y) > KEY) out.push([p, q]);
    }
  });
  return out;
}

/**
 * Faces fermées d'un ensemble de segments (arrangement plan) : chaque face est un polygone ; les
 * faces extérieures (non bornées) sont écartées.
 */
export function boundedFaces(segs: Seg[]): Pt[][] {
  const pieces = splitAll(segs);
  const key = (p: Pt) => `${Math.round(p.x / KEY)}:${Math.round(p.y / KEY)}`;
  const verts = new Map<string, Pt>();
  const adj = new Map<string, Set<string>>();
  for (const [a, b] of pieces) {
    const ka = key(a), kb = key(b);
    if (ka === kb) continue;
    verts.set(ka, a); verts.set(kb, b);
    if (!adj.has(ka)) adj.set(ka, new Set());
    if (!adj.has(kb)) adj.set(kb, new Set());
    adj.get(ka)!.add(kb); adj.get(kb)!.add(ka);
  }
  // Voisins triés par angle (repère Y vers le haut pour un sens trigonométrique habituel).
  const ang = (from: string, to: string) => { const a = verts.get(from)!, b = verts.get(to)!; return Math.atan2(-(b.y - a.y), b.x - a.x); };
  const sorted = new Map<string, string[]>();
  for (const [k, n] of adj) sorted.set(k, [...n].sort((p, q) => ang(k, p) - ang(k, q)));
  const used = new Set<string>();
  const faces: Pt[][] = [];
  for (const [u, ns] of sorted) {
    for (const v of ns) {
      if (used.has(`${u}>${v}`)) continue;
      // Parcours : à chaque sommet, prendre l'arête la plus à droite (face à gauche, sens antihoraire).
      const face: Pt[] = [];
      let a = u, b = v, guard = 0;
      while (!used.has(`${a}>${b}`) && guard++ < 100000) {
        used.add(`${a}>${b}`);
        face.push(verts.get(a)!);
        const list = sorted.get(b)!;
        const i = list.indexOf(a);
        const next = list[(i - 1 + list.length) % list.length];
        a = b; b = next;
      }
      // Face à gauche du parcours : aire positive dans le repère Y vers le haut (−aire en Y vers le bas).
      // Le contour extérieur de chaque groupe de traits, parcouru en sens inverse, est négatif : écarté.
      if (face.length >= 3 && -signedArea(face) > KEY) faces.push(face);
    }
  }
  return faces;
}

/**
 * Point intérieur à une face privée de ses trous (pair-impair) : milieu du plus large intervalle
 * intérieur sur quelques horizontales. null si la face est entièrement occupée par ses trous.
 */
function interiorPoint(face: Pt[], holes: Pt[][]): Pt | null {
  let minY = Infinity, maxY = -Infinity;
  for (const p of face) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  let best: { p: Pt; w: number } | null = null;
  for (const k of [0.5, 0.3, 0.7, 0.15, 0.85, 0.05, 0.95]) {
    const y = minY + (maxY - minY) * k + 1e-7;
    const xs: number[] = [];
    for (const loop of [face, ...holes]) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w > KEY && (!best || w > best.w)) best = { p: { x: (xs[i] + xs[i + 1]) / 2, y }, w };
    }
  }
  return best?.p ?? null;
}

/** Contours de toutes les pièces fermées par des murs (faces qui ne sont pas l'intérieur d'un mur). */
export function roomFaces(walls: WallObj[]): Pt[][] {
  const geom = wallsGeometry(walls);
  const segs: Seg[] = [...geom.values()].flatMap(g => g.edges);
  const quads = walls.map(w => wallQuad(w)).filter((q): q is NonNullable<typeof q> => !!q);
  const faces = boundedFaces(segs);
  return faces.filter(face => {
    // Trous : autres faces contenues dans celle-ci (par exemple l'intérieur d'un anneau de murs).
    const a = Math.abs(signedArea(face));
    const holes = faces.filter(f => f !== face && Math.abs(signedArea(f)) < a && f.every(p => pointInLoop(p, face) || onLoop(p, face)));
    const p = interiorPoint(face, holes);
    return !!p && !quads.some(q => pointInLoop(p, q));
  });
}

/** Le point est-il sur le contour (à la tolérance de fusion près) ? */
function onLoop(p: Pt, loop: Pt[]): boolean {
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < KEY) continue;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (l * l);
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const d = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / l;
    if (d <= KEY) return true;
  }
  return false;
}

/** Contour de la pièce qui contient le point, ou null si le point n'est pas dans une pièce fermée. */
export function detectRoom(walls: WallObj[], seed: Pt, faces = roomFaces(walls)): Pt[] | null {
  // La plus petite face qui contient le point (une cour intérieure contient aussi les pièces voisines).
  const containing = faces.filter(f => pointInLoop(seed, f)).sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)));
  return containing[0] ?? null;
}

/** Surface d'un contour en m². */
export const areaM2 = (poly: Pt[]) => Math.abs(signedArea(poly)) / 1e6;

/** Centre de gravité d'un polygone (pour placer l'étiquette). */
export function centroid(poly: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const c = p.x * q.y - q.x * p.y;
    a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < 1e-12) return poly[0];
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Règle de surface affichée (décision du maître d'ouvrage, §7) : intitulé et réserves. */
export const SURFACE_RULES = {
  'sia-416': {
    label: 'SIA 416',
    detail: 'Surface de plancher nette au contour intérieur des murs ; les exclusions (gaines, piliers, hauteur) ne sont pas évaluées.',
  },
  carrez: {
    label: 'Loi Carrez',
    detail: 'Surface au contour intérieur des murs ; les parties de hauteur inférieure à 1,80 m, gaines, marches et embrasures ne sont pas évaluées.',
  },
} as const;
export type SurfaceRule = keyof typeof SURFACE_RULES;

/** Contours de toutes les pièces d'un ensemble d'objets (null pour une pièce non fermée). */
export function roomPolygons(objects: { kind: string; id: string }[]): Map<string, Pt[] | null> {
  const walls = objects.filter((o): o is WallObj => o.kind === 'wall');
  const rooms = objects.filter((o): o is { kind: 'room'; id: string; x: number; y: number } => o.kind === 'room');
  const out = new Map<string, Pt[] | null>();
  if (rooms.length === 0) return out;
  const faces = roomFaces(walls);
  for (const r of rooms) out.set(r.id, detectRoom(walls, r, faces));
  return out;
}

/** Surface affichée : « 24,50 m² » (deux décimales, au centième de m²). */
export const formatM2 = (m2: number) => `${m2.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
