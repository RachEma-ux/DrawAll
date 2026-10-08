// Vue 3D du bâtiment (lot 15.1) : solides dérivés du plan, sans noyau (prismes et pans plans).
// Murs, dalles, poteaux, poutres et toitures deviennent des maillages triangulés ; les hauteurs
// viennent du modèle (hauteur saisie, altitude des niveaux), jamais d'une valeur inventée : un
// élément dont la hauteur ne peut pas être déterminée n'est pas montré et il est signalé.
// Repère : X du plan → X, Y du plan (vers le bas) → Z, altitude → Y (haut). Millimètres.
import type { CadObject, Level, RoofObj } from '@/types/cad';
import type { SolidRecipe } from './kernel/recipe';
import { levelIdOf, levelsOf } from './levels';
import { roofGeometry, roofInput } from './roof';
import { beamEdges, columnCorners } from './structure';
import { wallQuad } from './wall';

type P2 = { x: number; y: number };
export interface Mesh3D { id: string; kind: CadObject['kind']; positions: number[]; indices: number[] }
export interface Building3D { meshes: Mesh3D[]; skipped: { id: string; reason: string }[] }

const area2 = (poly: P2[]) => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;

/** Triangulation d'un polygone simple par oreilles (indices dans `poly`), sens trigonométrique du plan. */
export function triangulate(poly: P2[]): [number, number, number][] {
  const n = poly.length;
  if (n < 3) return [];
  const idx = Array.from({ length: n }, (_, i) => i);
  if (area2(poly) < 0) idx.reverse();
  const cross = (a: P2, b: P2, c: P2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inside = (p: P2, a: P2, b: P2, c: P2) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  const out: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross(a, b, c) <= 1e-9) continue; // sommet rentrant ou plat
      if (idx.some(j => j !== ia && j !== ib && j !== ic && inside(poly[j], a, b, c))) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break; // polygone dégénéré : arrêt sans boucler
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/**
 * Prisme droit de base `poly` (plan) entre les altitudes y0 < y1 : faces orientées vers l'extérieur
 * (volume positif au théorème de la divergence).
 */
export function prism(id: string, kind: CadObject['kind'], poly: P2[], y0: number, y1: number): Mesh3D {
  // Sens horaire dans le repère X-Z de three.js (Y du plan vers le bas) ⇔ trigonométrique dans le plan.
  const ring = area2(poly) < 0 ? [...poly].reverse() : poly;
  const n = ring.length, positions: number[] = [], indices: number[] = [];
  for (const p of ring) positions.push(p.x, y0, p.y);
  for (const p of ring) positions.push(p.x, y1, p.y);
  for (const [a, b, c] of triangulate(ring)) { indices.push(a, b, c); indices.push(n + a, n + c, n + b); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + i, j, j, n + i, n + j);
  }
  return { id, kind, positions, indices };
}

/** Volume d'un maillage fermé (théorème de la divergence), en mm³. */
export function meshVolume3(m: Mesh3D): number {
  let v = 0;
  const p = (i: number) => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]];
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    const [a, b, c] = [p(m.indices[t]), p(m.indices[t + 1]), p(m.indices[t + 2])];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}

/** Hauteur d'étage : jusqu'au niveau suivant, s'il existe ; sinon null. */
export function storeyHeight(levels: Level[], levelId: string): number | null {
  const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);
  const i = sorted.findIndex(l => l.id === levelId);
  return i >= 0 && i + 1 < sorted.length ? sorted[i + 1].elevation - sorted[i].elevation : null;
}

/** Pans de la toiture (polygones plans, repère du noyau : X, Y du plan, Z altitude), égout à `y0`. */
export function roofFaces(o: RoofObj, y0: number): [number, number, number][][] {
  const g = roofGeometry(roofInput(o));
  const t = Math.tan((o.pitch * Math.PI) / 180);
  const [X0, Y0] = [g.outline[0].x, g.outline[0].y], [X1, Y1] = [g.outline[2].x, g.outline[2].y];
  // Altitude d'un point du plan : égout + distance horizontale à la rive basse la plus proche × tan.
  const h = (p: P2) => {
    if (o.roofType === 'un-pan') {
      const d = o.axis === 'x' ? (o.highSide === 'max' ? p.y - Y0 : Y1 - p.y) : (o.highSide === 'max' ? p.x - X0 : X1 - p.x);
      return y0 + d * t;
    }
    if (o.roofType === 'deux-pans') return y0 + (o.axis === 'x' ? Math.min(p.y - Y0, Y1 - p.y) : Math.min(p.x - X0, X1 - p.x)) * t;
    return y0 + Math.min(p.x - X0, X1 - p.x, p.y - Y0, Y1 - p.y) * t;
  };
  const faces: [number, number, number][][] = [];
  const face = (pts: P2[]) => { faces.push(pts.map(p => [p.x, p.y, h(p)])); };
  const [a, b, c, d] = g.outline;
  if (o.roofType === 'un-pan') face([a, b, c, d]);
  else if (o.roofType === 'deux-pans') {
    const [r0, r1] = g.ridge!;
    if (o.axis === 'x') { face([a, b, r1, r0]); face([r0, r1, c, d]); } else { face([a, r0, r1, d]); face([r0, b, c, r1]); }
  } else {
    const [e0, e1] = g.ridge ?? [g.hips[0][1], g.hips[0][1]];
    if (Math.abs(e0.y - e1.y) < 1e-9) { face([a, b, e1, e0]); face([e0, e1, c, d]); face([d, a, e0]); face([b, c, e1]); }
    else { face([a, e0, e1, d]); face([e0, b, c, e1]); face([a, b, e0]); face([c, d, e1]); }
  }
  return faces;
}

/** Toiture : pans (triangles et trapèzes) au-dessus de l'égout à l'altitude `y0`. */
function roofMesh(o: RoofObj, y0: number): Mesh3D {
  const positions: number[] = [], indices: number[] = [];
  for (const f of roofFaces(o, y0)) {
    const base = positions.length / 3;
    for (const [x, y, z] of f) positions.push(x, z, y);
    for (let i = 1; i + 1 < f.length; i++) indices.push(base, base + i + 1, base + i);
  }
  return { id: o.id, kind: 'roof', positions, indices };
}

/** Solides du bâtiment pour la vue 3D, tous niveaux confondus, à leur altitude. */
export function building3d(objects: CadObject[], levelList: Level[] | undefined): Building3D {
  const levels = levelsOf(levelList);
  const elevation = (o: CadObject) => levels.find(l => l.id === levelIdOf(o))?.elevation ?? 0;
  const meshes: Mesh3D[] = [], skipped: Building3D['skipped'] = [];
  // Hauteur saisie si elle est valable (positive, finie), sinon hauteur d'étage.
  const height = (o: CadObject, own?: number) => (typeof own === 'number' && own > 0 && Number.isFinite(own) ? own : storeyHeight(levels, levelIdOf(o)));
  for (const o of objects) {
    const z = elevation(o);
    switch (o.kind) {
      case 'wall': {
        const q = wallQuad(o), H = height(o, o.height);
        if (!q) continue;
        if (H === null) { skipped.push({ id: o.id, reason: 'hauteur non saisie et pas de niveau au-dessus' }); continue; }
        meshes.push(prism(o.id, 'wall', q, z, z + H));
        break;
      }
      case 'slab': {
        const poly = Array.from({ length: o.points.length / 2 }, (_, i) => ({ x: o.points[2 * i], y: o.points[2 * i + 1] }));
        meshes.push(prism(o.id, 'slab', poly, z - o.thickness, z));
        break;
      }
      case 'column': {
        const H = height(o, o.height);
        if (H === null) { skipped.push({ id: o.id, reason: 'hauteur non saisie et pas de niveau au-dessus' }); continue; }
        const poly = o.section === 'circle'
          ? Array.from({ length: 32 }, (_, i) => ({ x: o.x + (o.d! / 2) * Math.cos((2 * Math.PI * i) / 32), y: o.y + (o.d! / 2) * Math.sin((2 * Math.PI * i) / 32) }))
          : columnCorners(o);
        meshes.push(prism(o.id, 'column', poly, z, z + H));
        break;
      }
      case 'beam': {
        // Dessus de la poutre sous le niveau supérieur.
        const H = storeyHeight(levels, levelIdOf(o));
        if (H === null) { skipped.push({ id: o.id, reason: 'pas de niveau au-dessus pour placer la poutre' }); continue; }
        const [e1, e2] = beamEdges(o);
        meshes.push(prism(o.id, 'beam', [e1[0], e1[1], e2[1], e2[0]], z + H - o.h, z + H));
        break;
      }
      case 'roof': {
        // Égout au-dessus des murs : hauteur d'étage, sinon le plus haut mur saisi du niveau.
        const walls = objects.filter(w => w.kind === 'wall' && levelIdOf(w) === levelIdOf(o) && w.height !== undefined) as { height?: number }[];
        const H = storeyHeight(levels, levelIdOf(o)) ?? (walls.length ? Math.max(...walls.map(w => w.height!)) : null);
        if (H === null) { skipped.push({ id: o.id, reason: 'hauteur des murs non saisie : égout indéterminé' }); continue; }
        meshes.push(roofMesh(o, z + H));
        break;
      }
    }
  }
  return { meshes, skipped };
}

/** 95e centile d'une série de mesures (temps de trame, ms) ; null si elle est vide. */
export function p95(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

/**
 * Bâtiment pour le noyau (lot 16.2 : façades et coupes) : mêmes éléments et mêmes hauteurs que la
 * vue 3D, en recettes (prismes extrudés, pans de toiture), plus les solides du projet. Assemblage
 * sans fusion ; null si rien n'a de volume.
 */
export function buildingRecipe(objects: CadObject[], levelList: Level[] | undefined): { recipe: SolidRecipe | null; skipped: Building3D['skipped'] } {
  const { meshes, skipped } = building3d(objects, levelList);
  const levels = levelsOf(levelList);
  const elevation = (o: CadObject) => levels.find(l => l.id === levelIdOf(o))?.elevation ?? 0;
  const parts: SolidRecipe[] = [];
  for (const m of meshes) {
    const o = objects.find(x => x.id === m.id)!;
    if (m.kind === 'roof') {
      // Égout = altitude basse des pans.
      const zs = m.positions.filter((_, i) => i % 3 === 1);
      parts.push({ op: 'polyhedron', faces: roofFaces(o as RoofObj, Math.min(...zs)) });
      continue;
    }
    // Prisme : base = premiers sommets (anneau du bas), altitude et hauteur depuis le maillage.
    const n = m.positions.length / 6;
    const ring: [number, number][] = [];
    for (let i = 0; i < n; i++) ring.push([m.positions[3 * i], m.positions[3 * i + 2]]);
    const z0 = m.positions[1], z1 = m.positions[3 * n + 1];
    if (o.kind === 'column' && o.section === 'circle') { parts.push({ op: 'cylinder', r: o.d! / 2, h: z1 - z0, at: [o.x, o.y, z0] }); continue; }
    parts.push({ op: 'extrude', profile: ring, height: z1 - z0, ...(z0 ? { z: z0 } : {}) });
  }
  for (const o of objects) {
    if (o.kind !== 'solid') continue;
    const z = elevation(o);
    parts.push(z ? { op: 'translate', of: o.recipe, by: [0, 0, z] } : o.recipe);
  }
  return { recipe: parts.length ? { op: 'compound', parts } : null, skipped };
}
