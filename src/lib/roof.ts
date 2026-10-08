// Toitures (lot 13.2) : toiture à un, deux ou quatre pans de même pente sur contour rectangulaire.
// Géométrie en plan (rive, faîtage, arêtiers, flèches de pente) et grandeurs de référence (hauteur de
// faîtage, longueurs vraies des arêtiers, surface des pans). Fonctions pures ; repère modèle
// (Y vers le bas), millimètres, degrés.
import type { PrimitiveObject, RoofObj } from '@/types/cad';

type Pt = { x: number; y: number };
export type RoofType = 'un-pan' | 'deux-pans' | 'quatre-pans';

export interface RoofInput {
  /** Contour (nu extérieur des murs) : coin minimal, largeur selon X, profondeur selon Y. */
  x: number; y: number; w: number; h: number;
  type: RoofType;
  /** Pente des pans (degrés, 0 < pente < 90). */
  pitch: number;
  /** Débord au-delà du contour, sur tout le pourtour (mm, ≥ 0). */
  overhang: number;
  /** Deux pans : faîtage parallèle à X ou à Y. Un pan : rive haute parallèle à X ou à Y. Quatre pans : ignoré (faîtage selon le grand côté). */
  axis: 'x' | 'y';
  /** Un pan : rive haute du côté des coordonnées minimales (`min`) ou maximales (`max`). */
  highSide?: 'min' | 'max';
}

export interface RoofGeometry {
  /** Rive (égout et rives) : contour élargi du débord. */
  outline: Pt[];
  /** Faîtage (deux et quatre pans), ou rive haute (un pan) ; null pour une pyramide (quatre pans sur carré). */
  ridge: [Pt, Pt] | null;
  hips: [Pt, Pt][];
  /** Flèches de pente : du haut vers le bas du pan. */
  arrows: [Pt, Pt][];
  /** Hauteur du faîtage (ou de la rive haute) au-dessus de l'égout (mm). */
  ridgeHeight: number;
  /** Même hauteur, au-dessus du plan d'égout pris au droit du contour (arase des murs) (mm). */
  ridgeAboveContour: number;
  ridgeLength: number;
  /** Longueurs vraies des arêtiers (mm). */
  hipLengths: number[];
  /** Surface des pans en vraie grandeur (m²). */
  slopeAreaM2: number;
}

export function roofError(r: RoofInput): string | null {
  if (!(r.w > 0 && r.h > 0)) return 'Toiture : contour de largeur et de profondeur positives attendu.';
  if (!(r.pitch > 0 && r.pitch < 90)) return 'Toiture : pente entre 0 et 90° (exclus) attendue.';
  if (!(r.overhang >= 0) || !Number.isFinite(r.overhang)) return 'Toiture : débord positif ou nul attendu.';
  return null;
}

export function roofGeometry(r: RoofInput): RoofGeometry {
  const o = r.overhang, t = Math.tan((r.pitch * Math.PI) / 180);
  const X0 = r.x - o, X1 = r.x + r.w + o, Y0 = r.y - o, Y1 = r.y + r.h + o;
  const W = X1 - X0, D = Y1 - Y0, cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
  const outline = [{ x: X0, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: Y1 }, { x: X0, y: Y1 }];
  const slopeAreaM2 = (W * D) / Math.cos((r.pitch * Math.PI) / 180) / 1e6;
  const base = { outline, slopeAreaM2 };

  if (r.type === 'un-pan') {
    // Rive haute parallèle à l'axe ; le pan descend vers le côté opposé sur toute la portée.
    const span = r.axis === 'x' ? D : W;
    const high = r.highSide ?? 'min';
    const ridge: [Pt, Pt] = r.axis === 'x'
      ? (high === 'min' ? [{ x: X0, y: Y0 }, { x: X1, y: Y0 }] : [{ x: X0, y: Y1 }, { x: X1, y: Y1 }])
      : (high === 'min' ? [{ x: X0, y: Y0 }, { x: X0, y: Y1 }] : [{ x: X1, y: Y0 }, { x: X1, y: Y1 }]);
    const s = high === 'min' ? 1 : -1, q = span / 4;
    const arrow: [Pt, Pt] = r.axis === 'x' ? [{ x: cx, y: cy - s * q }, { x: cx, y: cy + s * q }] : [{ x: cx - s * q, y: cy }, { x: cx + s * q, y: cy }];
    return { ...base, ridge, hips: [], arrows: [arrow], ridgeHeight: span * t, ridgeAboveContour: (span - 2 * o) * t, ridgeLength: r.axis === 'x' ? W : D, hipLengths: [] };
  }

  if (r.type === 'deux-pans') {
    const half = (r.axis === 'x' ? D : W) / 2, q = half / 2;
    const ridge: [Pt, Pt] = r.axis === 'x' ? [{ x: X0, y: cy }, { x: X1, y: cy }] : [{ x: cx, y: Y0 }, { x: cx, y: Y1 }];
    const arrows: [Pt, Pt][] = r.axis === 'x'
      ? [[{ x: cx, y: cy - q / 2 }, { x: cx, y: cy - q * 1.5 }], [{ x: cx, y: cy + q / 2 }, { x: cx, y: cy + q * 1.5 }]]
      : [[{ x: cx - q / 2, y: cy }, { x: cx - q * 1.5, y: cy }], [{ x: cx + q / 2, y: cy }, { x: cx + q * 1.5, y: cy }]];
    return { ...base, ridge, hips: [], arrows, ridgeHeight: half * t, ridgeAboveContour: (half - o) * t, ridgeLength: r.axis === 'x' ? W : D, hipLengths: [] };
  }

  // Quatre pans de même pente : faîtage selon le grand côté, arêtiers à 45° en plan.
  const alongX = W >= D, half = (alongX ? D : W) / 2, h = half * t;
  const ridge: [Pt, Pt] | null = W === D ? null : alongX
    ? [{ x: X0 + half, y: cy }, { x: X1 - half, y: cy }]
    : [{ x: cx, y: Y0 + half }, { x: cx, y: Y1 - half }];
  const ends = ridge ?? [{ x: cx, y: cy }, { x: cx, y: cy }];
  const near = (c: Pt) => (Math.hypot(c.x - ends[0].x, c.y - ends[0].y) <= Math.hypot(c.x - ends[1].x, c.y - ends[1].y) ? ends[0] : ends[1]);
  const hips = outline.map((c): [Pt, Pt] => [c, near(c)]);
  const hipLength = Math.sqrt(2 * half * half + h * h);
  // Flèches : sur chaque long pan, du faîtage vers l'égout ; sur chaque croupe, de l'extrémité du
  // faîtage vers la rive du petit côté. Marge d'un quart de demi-portée aux deux bouts.
  const m = half / 4;
  const arrows: [Pt, Pt][] = alongX
    ? [
        [{ x: cx, y: cy - m }, { x: cx, y: Y0 + m }], [{ x: cx, y: cy + m }, { x: cx, y: Y1 - m }],
        [{ x: ends[0].x - m, y: cy }, { x: X0 + m, y: cy }], [{ x: ends[1].x + m, y: cy }, { x: X1 - m, y: cy }],
      ]
    : [
        [{ x: cx - m, y: cy }, { x: X0 + m, y: cy }], [{ x: cx + m, y: cy }, { x: X1 - m, y: cy }],
        [{ x: cx, y: ends[0].y - m }, { x: cx, y: Y0 + m }], [{ x: cx, y: ends[1].y + m }, { x: cx, y: Y1 - m }],
      ];
  return { ...base, ridge, hips, arrows, ridgeHeight: h, ridgeAboveContour: (half - o) * t, ridgeLength: ridge ? Math.abs(alongX ? W - D : D - W) : 0, hipLengths: hips.map(() => hipLength) };
}

/**
 * Représentation 2D en primitives : rive (polyligne fermée), faîtage et arêtiers (lignes), flèches de
 * pente (tige et deux traits de pointe). Sert au dessin, à la désignation et aux exports DXF et PDF.
 */
export function roofPrimitives<T extends Omit<PrimitiveObject, 'kind'>>(base: T, r: RoofInput): PrimitiveObject[] {
  const g = roofGeometry(r);
  const line = (a: Pt, b: Pt, i: number): PrimitiveObject => ({ ...base, id: `${base.id}#${i}`, kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, hatch: 'none' } as PrimitiveObject);
  const out: PrimitiveObject[] = [{ ...base, id: `${base.id}#0`, kind: 'polyline', points: [...g.outline, g.outline[0]].flatMap(p => [p.x, p.y]), hatch: 'none' } as PrimitiveObject];
  let i = 1;
  if (g.ridge) out.push(line(g.ridge[0], g.ridge[1], i++));
  for (const [a, b] of g.hips) out.push(line(a, b, i++));
  const head = Math.min(300, Math.min(r.w, r.h) / 12);
  for (const [a, b] of g.arrows) {
    out.push(line(a, b, i++));
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
    for (const s of [1, -1]) out.push(line(b, { x: b.x - head * ux + s * head * 0.4 * -uy, y: b.y - head * uy + s * head * 0.4 * ux }, i++));
  }
  return out;
}

/** Données de calcul d'un objet toiture. */
export const roofInput = (o: RoofObj): RoofInput => ({ x: o.x, y: o.y, w: o.w, h: o.h, type: o.roofType, pitch: o.pitch, overhang: o.overhang, axis: o.axis, ...(o.highSide ? { highSide: o.highSide } : {}) });
