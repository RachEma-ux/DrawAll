// Cotes par points (lot 2.6) : série, cumulée, angulaire, niveau. Une seule fonction calcule la
// géométrie (lignes, flèches, arcs, textes) que l'atelier, les feuilles, le PDF et le DXF dessinent
// chacun avec leurs propres tailles d'annotation. Fonctions pures, repère du modèle (Y vers le bas).
import type { PointDimensionObj } from '@/types/cad';
import { fmt } from '@/types/cad';

export interface Pt { x: number; y: number }

export interface PdimText {
  /** Point d'ancrage sur la ligne de cote. */
  at: Pt;
  /** Direction (unitaire) dans laquelle le texte s'écarte de la ligne. */
  normal: Pt;
  value: string;
}

export interface PdimGeometry {
  /** Lignes de cote (trait fin). */
  lines: [number, number, number, number][];
  /** Lignes d'attache (trait fin). */
  ext: [number, number, number, number][];
  /** Flèches : pointe et point vers lequel la flèche est tournée (sens inverse de la pointe). */
  arrows: { tip: Pt; from: Pt }[];
  /** Arcs de cote angulaire : centre, rayon, angle de départ et ouverture (degrés, repère DXF). */
  arcs: { cx: number; cy: number; r: number; start: number; sweep: number }[];
  /** Origine d'une cotation cumulée (petit cercle) et repère de niveau (triangle). */
  origins: Pt[];
  levelMarks: Pt[];
  texts: PdimText[];
}

const pts = (d: PointDimensionObj): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < d.points.length; i += 2) out.push({ x: d.points[i], y: d.points[i + 1] });
  return out;
};

/** Direction de mesure (unitaire) et normale (côté de la ligne de cote) d'une cotation linéaire. */
function frame(d: PointDimensionObj, p: Pt[]): { u: Pt; n: Pt } | null {
  if (d.axis === 'horizontal') return { u: { x: 1, y: 0 }, n: { x: 0, y: 1 } };
  if (d.axis === 'vertical') return { u: { x: 0, y: 1 }, n: { x: 1, y: 0 } };
  const a = p[0], b = p[p.length - 1];
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l < 1e-9) return null;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  return { u, n: { x: -u.y, y: u.x } };
}

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Valeurs mesurées (mm, ou degrés pour une cote angulaire, ou mètres pour un niveau). */
export function pdimValues(d: PointDimensionObj): number[] {
  const p = pts(d);
  if (d.mode === 'angular') {
    if (p.length < 3) return [];
    return [angleBetween(p[0], p[1], p[2])];
  }
  if (d.mode === 'level') {
    if (p.length < 1) return [];
    return [((d.reference ?? 0) - p[0].y) / 1000];
  }
  const f = frame(d, p);
  if (!f || p.length < 2) return [];
  const s = p.map(q => dot(q, f.u));
  return d.mode === 'chain' ? s.slice(1).map((v, i) => Math.abs(v - s[i])) : s.slice(1).map(v => Math.abs(v - s[0]));
}

/** Angle (0 à 180°) entre les branches sommet → a et sommet → b. */
export function angleBetween(v: Pt, a: Pt, b: Pt): number {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x), a2 = Math.atan2(b.y - v.y, b.x - v.x);
  let d = Math.abs(a1 - a2) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

/** Niveau en mètres, signé, deux décimales : « +2,50 », « −0,30 », « ±0,00 ». */
export function formatLevel(m: number): string {
  const r = Math.round(m * 100) / 100;
  if (r === 0) return '±0,00';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pdimGeometry(d: PointDimensionObj): PdimGeometry | null {
  const p = pts(d);
  const g: PdimGeometry = { lines: [], ext: [], arrows: [], arcs: [], origins: [], levelMarks: [], texts: [] };

  if (d.mode === 'level') {
    if (p.length < 1) return null;
    const q = p[0];
    // Repère : triangle pointe en bas sur le point, trait de rappel horizontal, valeur au-dessus.
    g.levelMarks.push(q);
    const len = Math.abs(d.offset) || 1;
    g.lines.push([q.x, q.y, q.x + len, q.y]);
    g.texts.push({ at: { x: q.x + len / 2, y: q.y }, normal: { x: 0, y: -1 }, value: formatLevel(pdimValues(d)[0]) });
    return g;
  }

  if (d.mode === 'angular') {
    if (p.length < 3) return null;
    const [v, a, b] = p;
    const r = Math.abs(d.offset) || Math.min(Math.hypot(a.x - v.x, a.y - v.y), Math.hypot(b.x - v.x, b.y - v.y)) * 0.6;
    // Angles en repère DXF (Y vers le haut), arc parcouru dans le sens antihoraire du plus petit côté.
    const ang = (q: Pt) => ((Math.atan2(-(q.y - v.y), q.x - v.x) * 180) / Math.PI + 360) % 360;
    let s = ang(a), e = ang(b);
    let sweep = (e - s + 360) % 360;
    if (sweep > 180) { [s, e] = [e, s]; sweep = 360 - sweep; }
    g.arcs.push({ cx: v.x, cy: v.y, r, start: s, sweep });
    const at = (deg: number) => ({ x: v.x + r * Math.cos((deg * Math.PI) / 180), y: v.y - r * Math.sin((deg * Math.PI) / 180) });
    const p1 = at(s), p2 = at(s + sweep);
    // Flèches tangentes : orientées depuis un point de l'arc proche, vers l'extrémité.
    const near = Math.min(5, sweep / 4);
    g.arrows.push({ tip: p1, from: at(s + near) }, { tip: p2, from: at(s + sweep - near) });
    // Lignes d'attache si l'arc dépasse les branches.
    for (const [q, end] of [[a, p1], [b, p2]] as const) {
      if (Math.hypot(q.x - v.x, q.y - v.y) < r) g.ext.push([q.x, q.y, end.x, end.y]);
    }
    const mid = at(s + sweep / 2);
    const nl = Math.hypot(mid.x - v.x, mid.y - v.y) || 1;
    g.texts.push({ at: mid, normal: { x: (mid.x - v.x) / nl, y: (mid.y - v.y) / nl }, value: `${fmt(pdimValues(d)[0])}°` });
    return g;
  }

  const f = frame(d, p);
  if (!f || p.length < 2) return null;
  // Ligne de cote : au-delà du point le plus avancé dans la direction de la normale, décalée de offset.
  const proj = p.map(q => dot(q, f.n));
  const base = d.offset >= 0 ? Math.max(...proj) : Math.min(...proj);
  const lineN = base + d.offset;
  const onLine = (q: Pt) => {
    const t = dot(q, f.u);
    return { x: f.u.x * t + f.n.x * lineN, y: f.u.y * t + f.n.y * lineN };
  };
  const feet = p.map(onLine);
  p.forEach((q, i) => g.ext.push([q.x, q.y, feet[i].x, feet[i].y]));
  const up = d.offset >= 0 ? { x: f.n.x, y: f.n.y } : { x: -f.n.x, y: -f.n.y };
  // Le texte se place du côté opposé aux objets (au-delà de la ligne de cote).
  const away = up;
  const values = pdimValues(d);

  if (d.mode === 'chain') {
    for (let i = 0; i + 1 < feet.length; i++) {
      const a = feet[i], b = feet[i + 1];
      g.lines.push([a.x, a.y, b.x, b.y]);
      g.arrows.push({ tip: a, from: b }, { tip: b, from: a });
      g.texts.push({ at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, normal: away, value: fmt(values[i]) });
    }
    return g;
  }

  // Cotes cumulées : une ligne depuis l'origine, une flèche et une valeur à chaque point.
  const o = feet[0];
  const far = feet.reduce((best, q) => (Math.hypot(q.x - o.x, q.y - o.y) > Math.hypot(best.x - o.x, best.y - o.y) ? q : best), o);
  g.lines.push([o.x, o.y, far.x, far.y]);
  g.origins.push(o);
  for (let i = 1; i < feet.length; i++) {
    g.arrows.push({ tip: feet[i], from: o });
    g.texts.push({ at: feet[i], normal: away, value: fmt(values[i - 1]) });
  }
  return g;
}

/** Points de la cote dans le repère du modèle (pour l'emprise et les transformations). */
export function pdimPoints(d: PointDimensionObj): Pt[] {
  return pts(d);
}

/**
 * Transforme une cote par points (déplacement, rotation, miroir, échelle) : les points suivent
 * `map`, et la ligne de cote reste du même côté des points. Une cotation horizontale ou verticale
 * ne tourne que par quarts de tour ; une cote de niveau ne tourne pas. Renvoie null si impossible.
 */
export function transformPdim(
  d: PointDimensionObj,
  map: (p: Pt) => Pt,
  opts: { rotation?: number; factor?: number } = {},
): Partial<PointDimensionObj> | null {
  const old = pts(d);
  const moved = old.map(map);
  const points = moved.flatMap(q => [q.x, q.y]);
  const factor = opts.factor ?? 1;
  const turn = opts.rotation === undefined ? 0 : ((opts.rotation % 360) + 360) % 360;
  if (d.mode === 'level') {
    if (turn !== 0) return null;
    const ref = d.reference ?? 0;
    // Le repère horizontal (longueur `offset`) suit l'homothétie comme le point et le ±0,00.
    return { points, reference: map({ x: old[0]?.x ?? 0, y: ref }).y, offset: d.offset * factor };
  }
  if (d.mode === 'angular') return { points, offset: d.offset * factor };
  let axis = d.axis;
  if (axis !== 'aligned' && turn !== 0) {
    if (turn % 180 === 0) axis = d.axis;
    else if (turn % 90 === 0) axis = d.axis === 'horizontal' ? 'vertical' : 'horizontal';
    else return null;
  }
  const g = pdimGeometry(d);
  const next: PointDimensionObj = { ...d, axis, points };
  const f = frame(next, moved);
  if (!g || !f || g.ext.length === 0) return { points, axis, offset: d.offset * factor };
  // Côté de la ligne de cote après transformation : signe de l'écart pied ↔ premier point sur la normale.
  const foot = map({ x: g.ext[0][2], y: g.ext[0][3] });
  const side = (foot.x - moved[0].x) * f.n.x + (foot.y - moved[0].y) * f.n.y;
  const magnitude = Math.abs(d.offset) * factor;
  return { points, axis, offset: Math.abs(side) < 1e-9 ? d.offset * factor : Math.sign(side) * magnitude };
}
