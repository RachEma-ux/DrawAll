// Symboles de plan (lot 4.5) : nord, repère de coupe, cote de niveau en plan. Taille fixe sur le
// papier (mm papier) : la géométrie est calculée dans le modèle pour un facteur `u` = mm du modèle
// par mm papier (échelle de la fenêtre, ou zoom de l'écran). Fonctions pures, repère Y vers le bas,
// angles positifs dans le sens antihoraire à l'écran (comme le DXF).
import type { LevelMarkObj, NorthObj, RoughnessObj, SectionMarkObj } from '@/types/cad';
import { formatElevation } from '@/lib/levels';

export interface Pt { x: number; y: number }
export interface SymbolGeometry {
  /** Traits : fin (0,25 mm) ou fort (0,7 mm), éventuellement en trait mixte (plan de coupe). */
  lines: { a: Pt; b: Pt; weight: 'fin' | 'fort'; dash?: boolean }[];
  /** Surfaces pleines (flèches, triangle de niveau). */
  fills: Pt[][];
  circles: { c: Pt; r: number }[];
  /** Textes : point d'ancrage (milieu de la ligne de base si centré), hauteur dans le modèle. */
  texts: { at: Pt; text: string; height: number; anchor: 'middle' | 'start' }[];
}

/** Dimensions papier des symboles (mm papier). */
export const SYMBOL_PAPER = {
  northRadius: 6, northText: 3.5,
  sectionEnd: 6, sectionArrow: 4, sectionText: 5,
  levelTriangle: 3, levelText: 2.5, levelLine: 14,
  // État de surface pour une écriture de 3,5 mm : H1 = 1,4 h = 5 mm, H2 = 3 h = 10,5 mm.
  roughText: 3.5, roughH1: 5, roughH2: 10.5, roughLine: 14,
} as const;

const empty = (): SymbolGeometry => ({ lines: [], fills: [], circles: [], texts: [] });

/** Rotation antihoraire à l'écran (Y vers le bas) d'un vecteur local, puis translation. */
function place(origin: Pt, deg: number, u: number) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (x: number, y: number): Pt => ({ x: origin.x + (x * c + y * s) * u, y: origin.y + (-x * s + y * c) * u });
}

/** Nord : cercle, flèche pleine vers le nord, lettre N au-delà de la pointe. */
export function northGeometry(o: Pick<NorthObj, 'x' | 'y' | 'rotation'>, u: number): SymbolGeometry {
  const g = empty();
  const R = SYMBOL_PAPER.northRadius;
  const p = place({ x: o.x, y: o.y }, o.rotation ?? 0, u);
  g.circles.push({ c: { x: o.x, y: o.y }, r: R * u });
  g.fills.push([p(0, -R), p(R * 0.45, R * 0.7), p(0, R * 0.35), p(-R * 0.45, R * 0.7)]);
  g.texts.push({ at: p(0, -R - 1.5), text: 'N', height: SYMBOL_PAPER.northText * u, anchor: 'middle' });
  return g;
}

/**
 * Repère de coupe : plan de coupe en trait mixte fin, traits forts aux extrémités, flèches pleines
 * vers le sens de la vue et repère (« A ») à chaque extrémité. Le sens de la vue est à gauche du
 * trait parcouru de (x1, y1) vers (x2, y2), à droite si `flip`.
 */
export function sectionGeometry(o: Pick<SectionMarkObj, 'x1' | 'y1' | 'x2' | 'y2' | 'label' | 'flip'>, u: number): SymbolGeometry | null {
  const g = empty();
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy);
  if (!(L > 0)) return null;
  const t = { x: dx / L, y: dy / L };
  const side = o.flip ? -1 : 1;
  const nrm = { x: t.y * side, y: -t.x * side }; // gauche à l'écran (Y vers le bas)
  const a = { x: o.x1, y: o.y1 }, b = { x: o.x2, y: o.y2 };
  const end = Math.min(SYMBOL_PAPER.sectionEnd * u, L / 2);
  const along = (p: Pt, d: number): Pt => ({ x: p.x + t.x * d, y: p.y + t.y * d });
  const off = (p: Pt, d: number): Pt => ({ x: p.x + nrm.x * d, y: p.y + nrm.y * d });
  if (L > 2 * end) g.lines.push({ a: along(a, end), b: along(b, -end), weight: 'fin', dash: true });
  g.lines.push({ a, b: along(a, end), weight: 'fort' }, { a: along(b, -end), b, weight: 'fort' });
  const A = SYMBOL_PAPER.sectionArrow * u;
  for (const p of [a, b]) {
    // Hampe perpendiculaire puis pointe pleine, dans le sens de la vue.
    const tip = off(p, A * 2);
    g.lines.push({ a: p, b: off(p, A), weight: 'fort' });
    const base = off(p, A);
    g.fills.push([tip, { x: base.x + t.x * A * 0.4, y: base.y + t.y * A * 0.4 }, { x: base.x - t.x * A * 0.4, y: base.y - t.y * A * 0.4 }]);
    const h = SYMBOL_PAPER.sectionText * u;
    const out = p === a ? -1 : 1; // repère à l'extérieur du trait
    const at = along(off(p, A), out * (A * 0.6 + h * 0.4));
    g.texts.push({ at: { x: at.x, y: at.y + h / 2 }, text: o.label || 'A', height: h, anchor: 'middle' });
  }
  return g;
}

/** Valeur affichée d'une cote de niveau en plan : « +2,80 », « ±0,00 » (mètres). */
export const levelMarkText = (elevation: number) => formatElevation(elevation).replace(/ m$/, '');

/** Cote de niveau en plan : triangle plein pointe sur le point, trait d'appui et valeur au-dessus. */
export function levelMarkGeometry(o: Pick<LevelMarkObj, 'x' | 'y' | 'elevation'>, u: number): SymbolGeometry {
  const g = empty();
  const T = SYMBOL_PAPER.levelTriangle * u;
  const p = { x: o.x, y: o.y };
  g.fills.push([p, { x: p.x - T * 0.6, y: p.y - T }, { x: p.x + T * 0.6, y: p.y - T }]);
  g.lines.push({ a: { x: p.x - T * 0.6, y: p.y - T }, b: { x: p.x + SYMBOL_PAPER.levelLine * u, y: p.y - T }, weight: 'fin' });
  g.texts.push({ at: { x: p.x + T * 0.9, y: p.y - T - 0.8 * u }, text: levelMarkText(o.elevation), height: SYMBOL_PAPER.levelText * u, anchor: 'start' });
  return g;
}

/** Rugosité affichée : « Ra 3,2 ». */
export const roughnessText = (ra: number) => `Ra ${ra.toLocaleString('fr-FR', { maximumFractionDigits: 3 })}`;

/**
 * État de surface : deux traits inégaux inclinés à 60° depuis la pointe (posée sur la surface),
 * barre fermant le trait court si l'enlèvement de matière est exigé, cercle inscrit s'il est
 * interdit ; trait d'appui et exigence (« Ra 3,2 ») sous ce trait quand une rugosité est donnée.
 */
export function roughnessGeometry(o: Pick<RoughnessObj, 'x' | 'y' | 'rotation' | 'process' | 'ra'>, u: number): SymbolGeometry {
  const g = empty();
  const S = SYMBOL_PAPER, k = 1 / Math.tan(Math.PI / 3);
  const p = place({ x: o.x, y: o.y }, o.rotation ?? 0, u);
  const tip = p(0, 0), shortEnd = p(-S.roughH1 * k, -S.roughH1), longEnd = p(S.roughH2 * k, -S.roughH2);
  g.lines.push({ a: tip, b: shortEnd, weight: 'fin' }, { a: tip, b: longEnd, weight: 'fin' });
  if (o.process === 'enlevement') g.lines.push({ a: shortEnd, b: p(S.roughH1 * k, -S.roughH1), weight: 'fin' });
  if (o.process === 'sans-enlevement') g.circles.push({ c: p(0, -S.roughH1 / 3), r: (S.roughH1 / 3) * u });
  if (o.ra !== undefined) {
    g.lines.push({ a: longEnd, b: p(S.roughH2 * k + S.roughLine, -S.roughH2), weight: 'fin' });
    g.texts.push({ at: p(S.roughH2 * k + 0.8, -S.roughH2 + S.roughText + 0.8), text: roughnessText(o.ra), height: S.roughText * u, anchor: 'start' });
  }
  return g;
}

export type SymbolObject = NorthObj | SectionMarkObj | LevelMarkObj | RoughnessObj;
export const isSymbol = (o: { kind: string }): o is SymbolObject => o.kind === 'north' || o.kind === 'section' || o.kind === 'levelMark' || o.kind === 'roughness';

/** Géométrie d'un symbole pour `u` mm du modèle par mm papier (null : symbole dégénéré). */
export function symbolGeometry(o: SymbolObject, u: number): SymbolGeometry | null {
  switch (o.kind) {
    case 'north': return northGeometry(o, u);
    case 'section': return sectionGeometry(o, u);
    case 'levelMark': return levelMarkGeometry(o, u);
    case 'roughness': return roughnessGeometry(o, u);
  }
}

/** Pixels écran par mm papier pour les symboles dans l'atelier (taille constante à l'écran). */
export const SCREEN_PX_PER_PAPER_MM = 3;

/** Distance d'un point au symbole (traits, cercles, surfaces pleines, textes approchés). */
export function distanceToSymbol(g: SymbolGeometry, p: Pt): number {
  const seg = (a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  let d = Infinity;
  for (const l of g.lines) d = Math.min(d, seg(l.a, l.b));
  for (const c of g.circles) d = Math.min(d, Math.max(0, Math.hypot(p.x - c.c.x, p.y - c.c.y) - c.r));
  for (const f of g.fills) for (let i = 0; i < f.length; i++) d = Math.min(d, seg(f[i], f[(i + 1) % f.length]));
  for (const t of g.texts) d = Math.min(d, Math.hypot(p.x - t.at.x, p.y - (t.at.y - t.height / 2)) - t.height);
  return Math.max(0, d);
}
