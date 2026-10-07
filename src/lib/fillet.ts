// Congé et chanfrein entre deux lignes : fonctions pures.
// Chaque ligne est désignée par un point qui indique la partie à conserver (du côté de ce point
// par rapport à l'intersection des deux droites). Repère écran (Y vers le bas) ; angles d'arc en
// degrés dans le repère DXF (cf. arc.ts).
import type { LineObj } from '@/types/cad';
import { angleOf, norm360 } from '@/lib/arc';

export interface P { x: number; y: number }

type LinePatch = Pick<LineObj, 'x1' | 'y1'> | Pick<LineObj, 'x2' | 'y2'>;

export interface CornerResult {
  patchA: LinePatch;
  patchB: LinePatch;
  /** Arc de congé (absent si rayon nul). */
  arc?: { cx: number; cy: number; r: number; start: number; end: number };
  /** Segment de chanfrein (absent si distances nulles). */
  line?: { x1: number; y1: number; x2: number; y2: number };
}

export type CornerOutcome = { ok: true; result: CornerResult } | { ok: false; error: string };

const EPS = 1e-9;
const LEN_EPS = 1e-6;

interface Side {
  /** Direction unitaire depuis l'intersection vers la partie conservée. */
  u: P;
  /** Longueur disponible de la partie conservée (de l'intersection à l'extrémité lointaine). */
  reach: number;
  /** Extrémité remplacée par le point de raccord. */
  moved: 1 | 2;
}

function intersection(a: LineObj, b: LineObj): P | null {
  const dax = a.x2 - a.x1, day = a.y2 - a.y1;
  const dbx = b.x2 - b.x1, dby = b.y2 - b.y1;
  const den = dax * dby - day * dbx;
  const la = Math.hypot(dax, day), lb = Math.hypot(dbx, dby);
  if (la < LEN_EPS || lb < LEN_EPS || Math.abs(den) < EPS * la * lb) return null;
  const t = ((b.x1 - a.x1) * dby - (b.y1 - a.y1) * dbx) / den;
  return { x: a.x1 + t * dax, y: a.y1 + t * day };
}

function sideOf(l: LineObj, i: P, pick: P): Side | null {
  const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
  let u = { x: (l.x2 - l.x1) / len, y: (l.y2 - l.y1) / len };
  // La partie conservée est du côté du point désigné.
  if ((pick.x - i.x) * u.x + (pick.y - i.y) * u.y < 0) u = { x: -u.x, y: -u.y };
  const p1 = (l.x1 - i.x) * u.x + (l.y1 - i.y) * u.y;
  const p2 = (l.x2 - i.x) * u.x + (l.y2 - i.y) * u.y;
  const reach = Math.max(p1, p2);
  if (reach <= LEN_EPS) return null;
  // L'extrémité la plus proche de l'intersection (côté conservé) devient le point de raccord.
  return { u, reach, moved: p1 >= p2 ? 2 : 1 };
}

function patchFor(s: Side, p: P): LinePatch {
  return s.moved === 1 ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y };
}

function prepare(a: LineObj, pa: P, b: LineObj, pb: P) {
  if (a.id === b.id) return { error: 'Désignez deux lignes différentes.' } as const;
  const i = intersection(a, b);
  if (!i) return { error: 'Les deux lignes sont parallèles : pas de coin à traiter.' } as const;
  const sa = sideOf(a, i, pa);
  const sb = sideOf(b, i, pb);
  if (!sa || !sb) return { error: 'La partie désignée ne s’étend pas au-delà de l’intersection.' } as const;
  return { i, sa, sb } as const;
}

const at = (i: P, u: P, d: number): P => ({ x: i.x + u.x * d, y: i.y + u.y * d });

/** Congé de rayon `r` (r = 0 : coin vif) entre deux lignes. */
export function filletLines(a: LineObj, pa: P, b: LineObj, pb: P, r: number): CornerOutcome {
  if (!Number.isFinite(r) || r < 0) return { ok: false, error: 'Le rayon doit être un nombre positif ou nul.' };
  const prep = prepare(a, pa, b, pb);
  if ('error' in prep) return { ok: false, error: prep.error as string };
  const { i, sa, sb } = prep;
  if (r <= LEN_EPS) return { ok: true, result: { patchA: patchFor(sa, i), patchB: patchFor(sb, i) } };
  const cos = Math.max(-1, Math.min(1, sa.u.x * sb.u.x + sa.u.y * sb.u.y));
  const theta = Math.acos(cos);
  if (theta < 1e-9 || Math.PI - theta < 1e-9) return { ok: false, error: 'Les deux lignes sont alignées : pas de congé possible.' };
  const d = r / Math.tan(theta / 2);
  const maxR = Math.min(sa.reach, sb.reach) * Math.tan(theta / 2);
  if (d > sa.reach + LEN_EPS || d > sb.reach + LEN_EPS) {
    return { ok: false, error: `Rayon trop grand : ${fmt(r)} mm (au plus ${fmt(maxR)} mm pour ces lignes).` };
  }
  const ta = at(i, sa.u, d), tb = at(i, sb.u, d);
  const bis = { x: sa.u.x + sb.u.x, y: sa.u.y + sb.u.y };
  const bl = Math.hypot(bis.x, bis.y);
  const c = at(i, { x: bis.x / bl, y: bis.y / bl }, r / Math.sin(theta / 2));
  const aa = angleOf(c.x, c.y, ta), ab = angleOf(c.x, c.y, tb);
  // L'arc de congé est le plus court des deux (ouverture π − θ < 180°).
  const [start, end] = norm360(ab - aa) <= 180 ? [aa, ab] : [ab, aa];
  return { ok: true, result: { patchA: patchFor(sa, ta), patchB: patchFor(sb, tb), arc: { cx: c.x, cy: c.y, r, start, end } } };
}

/** Chanfrein de distances `d1` (sur la première ligne) et `d2` (sur la seconde) depuis le coin. */
export function chamferLines(a: LineObj, pa: P, b: LineObj, pb: P, d1: number, d2: number): CornerOutcome {
  if (![d1, d2].every(d => Number.isFinite(d) && d >= 0)) return { ok: false, error: 'Les distances doivent être des nombres positifs ou nuls.' };
  const prep = prepare(a, pa, b, pb);
  if ('error' in prep) return { ok: false, error: prep.error as string };
  const { i, sa, sb } = prep;
  if (d1 <= LEN_EPS && d2 <= LEN_EPS) return { ok: true, result: { patchA: patchFor(sa, i), patchB: patchFor(sb, i) } };
  if (d1 <= LEN_EPS || d2 <= LEN_EPS) return { ok: false, error: 'Un chanfrein demande deux distances non nulles (ou deux nulles pour un coin vif).' };
  if (d1 > sa.reach + LEN_EPS) return { ok: false, error: `Distance trop grande sur la première ligne : ${fmt(d1)} mm (au plus ${fmt(sa.reach)} mm).` };
  if (d2 > sb.reach + LEN_EPS) return { ok: false, error: `Distance trop grande sur la seconde ligne : ${fmt(d2)} mm (au plus ${fmt(sb.reach)} mm).` };
  const ta = at(i, sa.u, d1), tb = at(i, sb.u, d2);
  return { ok: true, result: { patchA: patchFor(sa, ta), patchB: patchFor(sb, tb), line: { x1: ta.x, y1: ta.y, x2: tb.x, y2: tb.y } } };
}

function fmt(v: number): string {
  return (Math.round(v * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}
