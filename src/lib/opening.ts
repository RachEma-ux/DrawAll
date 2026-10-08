// Ouvertures (lot 4.2) : portes et fenêtres hébergées par un mur. Leur position est relative au mur
// (distance depuis son début) : déplacer, tourner ou étirer le mur emporte l'ouverture.
// Fonctions pures, repère du modèle (Y vers le bas).
import type { OpeningObj, WallObj } from '@/types/cad';
import { faceOffsets } from '@/lib/wall';

export interface Pt { x: number; y: number }
type Seg = [Pt, Pt];

export interface OpeningGeometry {
  /** Intervalle occupé le long du mur (depuis son début, mm). */
  from: number;
  to: number;
  /** Contour de la baie dans l'épaisseur du mur. */
  rect: [Pt, Pt, Pt, Pt];
  /** Tableaux : traits en travers du mur aux deux bords de la baie. */
  jambs: Seg[];
  /** Porte : vantail (trait) et débattement (arc de centre la charnière). */
  leaf?: Seg;
  swing?: { cx: number; cy: number; r: number; from: Pt; to: Pt };
  /** Fenêtre : appuis sur les faces et vitrage au milieu. */
  glazing?: Seg[];
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });

/** L'ouverture tient-elle dans son mur ? Renvoie un message sinon. */
export function openingFits(op: Pick<OpeningObj, 'position' | 'width'>, wall: WallObj): string | null {
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (!(op.width > 0)) return 'Largeur d’ouverture invalide.';
  if (op.position - op.width / 2 < -1e-6 || op.position + op.width / 2 > len + 1e-6) {
    return `L’ouverture (${Math.round(op.width)} mm) dépasse du mur (${Math.round(len)} mm).`;
  }
  return null;
}

/** Position le long du mur du point le plus proche (projection), bornée au mur. */
export function positionOnWall(wall: WallObj, p: Pt): number {
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return 0;
  const t = ((p.x - wall.x1) * dx + (p.y - wall.y1) * dy) / len;
  return Math.max(0, Math.min(len, t));
}

export function openingGeometry(op: OpeningObj, wall: WallObj): OpeningGeometry | null {
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (len < 1e-9 || !(op.width > 0)) return null;
  const u = { x: (wall.x2 - wall.x1) / len, y: (wall.y2 - wall.y1) / len };
  const l = { x: u.y, y: -u.x }; // gauche à l'écran
  const { left, right } = faceOffsets(wall);
  const a = { x: wall.x1, y: wall.y1 };
  const from = op.position - op.width / 2, to = op.position + op.width / 2;
  const at = (t: number, off: number) => add(add(a, mul(u, t)), mul(l, off));
  const rect: [Pt, Pt, Pt, Pt] = [at(from, left), at(to, left), at(to, -right), at(from, -right)];
  const g: OpeningGeometry = { from, to, rect, jambs: [[rect[0], rect[3]], [rect[1], rect[2]]] };
  if (op.type === 'fenetre') {
    const mid = (left - right) / 2;
    g.glazing = [[rect[0], rect[1]], [rect[3], rect[2]], [at(from, mid), at(to, mid)]];
    return g;
  }
  // Porte : charnière au bord choisi, vantail ouvert à 90° du côté choisi (face gauche ou droite du mur).
  const hingeT = op.hinge === 'debut' ? from : to;
  const otherT = op.hinge === 'debut' ? to : from;
  const sideOff = op.side === 'gauche' ? left : -right;
  const dir = op.side === 'gauche' ? l : mul(l, -1);
  const hinge = at(hingeT, sideOff);
  const leafEnd = add(hinge, mul(dir, op.width));
  const closed = at(otherT, sideOff);
  g.leaf = [hinge, leafEnd];
  g.swing = { cx: hinge.x, cy: hinge.y, r: op.width, from: leafEnd, to: closed };
  return g;
}

/** Arc de débattement en chemin SVG (quart de cercle du vantail ouvert à la position fermée). */
export function swingPath(s: NonNullable<OpeningGeometry['swing']>): string {
  // Sens : le plus court (90°) ; le drapeau de balayage dépend de l'orientation.
  const c = (s.from.x - s.cx) * (s.to.y - s.cy) - (s.from.y - s.cy) * (s.to.x - s.cx);
  return `M ${s.from.x} ${s.from.y} A ${s.r} ${s.r} 0 0 ${c > 0 ? 1 : 0} ${s.to.x} ${s.to.y}`;
}

/** Intervalles (le long du mur) occupés par ses ouvertures, pour couper les faces. */
export function openingIntervals(wall: WallObj, openings: OpeningObj[]): [number, number][] {
  return openings
    .filter(o => o.hostId === wall.id)
    .map(o => [o.position - o.width / 2, o.position + o.width / 2] as [number, number])
    .sort((p, q) => p[0] - q[0]);
}
