// Hachures paramétrées (lot 3.2) : angle, pas, origine, pas papier ou modèle, contours avec îlots.
// Fonctions pures. Repère Y vers le bas (modèle ou feuille) ; angle en degrés depuis +X, positif dans
// le sens antihoraire à l'écran (comme le DXF).
import type { CadObject, HatchParams } from '@/types/cad';
import { isClosedPolyline } from '@/types/cad';

export interface Pt { x: number; y: number }
export type Loop = Pt[];

/** Préréglage : traits fins à 45°, pas papier de 3 mm (Conventions §4.2). */
export const DEFAULT_HATCH_PARAMS: HatchParams = { angle: 45, spacing: 3, unit: 'papier' };

export const hatchParamsOf = (o: Pick<CadObject, 'hatchParams'>): HatchParams => ({ ...DEFAULT_HATCH_PARAMS, ...o.hatchParams });

/** Écart maximal entre un cercle et le polygone qui le représente pour le calcul des traits (mm). */
const CIRCLE_TOLERANCE = 0.01;

/** Contour fermé d'un objet sous forme de polygone (cercle approché à 0,01 mm) ; null si ouvert. */
export function loopOf(o: CadObject): Loop | null {
  switch (o.kind) {
    case 'rect': return [{ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }];
    case 'circle': {
      const n = Math.max(24, Math.min(4096, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - CIRCLE_TOLERANCE / Math.max(o.r, 1e-9))))));
      const out: Loop = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        out.push({ x: o.cx + o.r * Math.cos(a), y: o.cy + o.r * Math.sin(a) });
      }
      return out;
    }
    case 'polyline': {
      if (!isClosedPolyline(o)) return null;
      const out: Loop = [];
      for (let i = 0; i + 1 < o.points.length - 2; i += 2) out.push({ x: o.points[i], y: o.points[i + 1] });
      return out;
    }
    default: return null;
  }
}

/** Îlots d'un objet : contours fermés désignés par `holes` (objets absents ou ouverts ignorés). */
export function islandsOf(o: CadObject, objects: CadObject[]): Loop[] {
  return (o.holes ?? [])
    .map(id => objects.find(x => x.id === id))
    .map(x => (x ? loopOf(x) : null))
    .filter((l): l is Loop => !!l);
}

/**
 * Contours fermés entièrement contenus dans l'objet (candidats îlots) : leur emprise est strictement
 * dans celle de l'objet et leurs sommets sont à l'intérieur de son contour.
 */
export function containedContours(o: CadObject, objects: CadObject[]): string[] {
  const outer = loopOf(o);
  if (!outer) return [];
  return objects
    .filter(x => x.id !== o.id)
    .filter(x => { const l = loopOf(x); return !!l && l.every(p => pointInLoop(p, outer)); })
    .map(x => x.id);
}

export function pointInLoop(p: Pt, loop: Loop): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Traits de hachure d'une famille (angle, pas, origine) limités aux contours par la règle pair-impair :
 * le contour extérieur et ses îlots alternent dedans / dehors.
 */
export function hatchSegments(loops: Loop[], angleDeg: number, spacing: number, origin: Pt = { x: 0, y: 0 }): [number, number, number, number][] {
  if (!(spacing > 0) || loops.length === 0) return [];
  const a = (angleDeg * Math.PI) / 180;
  const d = { x: Math.cos(a), y: -Math.sin(a) };   // direction des traits (antihoraire à l'écran)
  const nrm = { x: Math.sin(a), y: Math.cos(a) };  // normale : les traits sont c = constante
  const proj = (p: Pt) => (p.x - origin.x) * nrm.x + (p.y - origin.y) * nrm.y;
  const along = (p: Pt) => (p.x - origin.x) * d.x + (p.y - origin.y) * d.y;
  let lo = Infinity, hi = -Infinity;
  for (const l of loops) for (const p of l) { const c = proj(p); if (c < lo) lo = c; if (c > hi) hi = c; }
  const out: [number, number, number, number][] = [];
  const kMax = Math.floor(hi / spacing);
  if (kMax - Math.ceil(lo / spacing) > 200000) return []; // pas absurde : rien plutôt que bloquer
  for (let k = Math.ceil(lo / spacing); k <= kMax; k++) {
    const c = k * spacing;
    const ts: number[] = [];
    for (const l of loops) {
      for (let i = 0; i < l.length; i++) {
        const p = l[i], q = l[(i + 1) % l.length];
        const sp = proj(p), sq = proj(q);
        // Demi-ouvert : un sommet sur le trait n'est compté qu'une fois.
        if ((sp <= c && c < sq) || (sq <= c && c < sp)) {
          const t = (c - sp) / (sq - sp);
          ts.push(along(p) + t * (along(q) - along(p)));
        }
      }
    }
    ts.sort((u, v) => u - v);
    for (let i = 0; i + 1 < ts.length; i += 2) {
      if (ts[i + 1] - ts[i] < 1e-9) continue;
      const base = { x: origin.x + nrm.x * c, y: origin.y + nrm.y * c };
      out.push([base.x + d.x * ts[i], base.y + d.y * ts[i], base.x + d.x * ts[i + 1], base.y + d.y * ts[i + 1]]);
    }
  }
  return out;
}

/** Angles des familles de traits d'un motif : une pour les diagonales, deux (croisées) sinon. */
export const hatchAngles = (style: CadObject['hatch'], params: HatchParams) =>
  style === 'cross' ? [params.angle, params.angle + 90] : style === 'diagonal' ? [params.angle] : [];
