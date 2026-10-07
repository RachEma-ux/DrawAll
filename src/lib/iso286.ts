// Tolérances ISO 286-1:2010 (lot 5.1) : degrés de tolérance normalisés IT et écarts fondamentaux pour
// les tailles nominales de 0 à 500 mm. Valeurs des tableaux de la norme (µm), non recalculées par
// formule. Positions couvertes : alésages D E F G H JS K M N P, arbres d e f g h js k m n p ; une classe
// hors de ce domaine n'est pas évaluée (message), jamais extrapolée.

/** Limites supérieures des paliers de dimensions (mm) : « au-delà de … jusqu'à … inclus ». */
const STEPS = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];

/** Degrés de tolérance normalisés IT3 à IT14 (µm), ISO 286-1 tableau 1. */
const IT: Record<number, number[]> = {
  3: [2, 2.5, 2.5, 3, 4, 4, 5, 6, 8, 10, 12, 13, 15],
  4: [3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20],
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
  12: [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630],
  13: [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970],
  14: [250, 300, 360, 430, 520, 620, 740, 870, 1000, 1150, 1300, 1400, 1550],
};

/** Écart supérieur es des arbres d à h (µm), ISO 286-1 tableau 2. */
const SHAFT_UPPER: Record<string, number[]> = {
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Écart inférieur ei des arbres k (IT4 à IT7), m, n, p (µm), ISO 286-1 tableau 3. */
const SHAFT_LOWER: Record<string, number[]> = {
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};

export interface ToleranceClass { letter: string; grade: number; hole: boolean }
export interface Deviations { upper: number; lower: number } // µm
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Lecture d'une classe de tolérance : « H7 », « g6 », « js6 », « JS7 ». */
export function parseClass(text: string): ToleranceClass | null {
  const m = /^\s*(js|JS|[a-zA-Z])(\d{1,2})\s*$/.exec(text);
  if (!m) return null;
  const letter = m[1];
  const hole = letter === letter.toUpperCase();
  if (letter.length === 2 && letter !== 'js' && letter !== 'JS') return null;
  return { letter: letter.toLowerCase(), grade: Number(m[2]), hole };
}

export const formatClass = (c: ToleranceClass) => `${c.hole ? c.letter.toUpperCase() : c.letter}${c.grade}`;

function step(nominal: number): number {
  return STEPS.findIndex(s => nominal <= s);
}

/** Degré de tolérance ITn (µm) pour une taille nominale, ou erreur hors du domaine couvert. */
export function itValue(nominal: number, grade: number): Result<number> {
  if (!(nominal > 0) || nominal > 500) return { ok: false, error: `Taille ${nominal} mm hors du domaine couvert (0 à 500 mm).` };
  const row = IT[grade];
  if (!row) return { ok: false, error: `Degré IT${grade} non couvert (IT3 à IT14).` };
  return { ok: true, value: row[step(nominal)] };
}

/** Écarts supérieur et inférieur (µm) d'une classe de tolérance pour une taille nominale. */
export function deviations(nominal: number, cls: ToleranceClass): Result<Deviations> {
  const it = itValue(nominal, cls.grade);
  if (!it.ok) return it;
  const i = step(nominal);
  const T = it.value;
  const name = formatClass(cls);
  if (cls.letter === 'js') {
    // ±IT/2 ; pour IT7 à IT11, une valeur impaire est arrondie à ±(IT−1)/2 (ISO 286-1, 5.3).
    const half = cls.grade >= 7 && cls.grade <= 11 && T % 2 === 1 ? (T - 1) / 2 : T / 2;
    return { ok: true, value: { upper: half, lower: -half } };
  }
  if (!cls.hole) {
    if (SHAFT_UPPER[cls.letter]) { const es = SHAFT_UPPER[cls.letter][i]; return { ok: true, value: { upper: es, lower: es - T } }; }
    if (SHAFT_LOWER[cls.letter]) {
      // k : écart fondamental pour IT4 à IT7 seulement, nul ailleurs.
      const ei = cls.letter === 'k' && (cls.grade < 4 || cls.grade > 7) ? 0 : SHAFT_LOWER[cls.letter][i];
      return { ok: true, value: { upper: ei + T, lower: ei } };
    }
    return { ok: false, error: `Position ${name} non couverte (arbres d, e, f, g, h, js, k, m, n, p).` };
  }
  // Alésages D à H : EI = −es de l'arbre de même lettre.
  if (SHAFT_UPPER[cls.letter]) { const ei = 0 - SHAFT_UPPER[cls.letter][i]; return { ok: true, value: { upper: ei + T, lower: ei } }; }
  if (SHAFT_LOWER[cls.letter]) {
    // K, M, N jusqu'à IT8 et P jusqu'à IT7 : ES = −ei + Δ, Δ = ITn − ITn−1 (nul jusqu'à 3 mm).
    const max = cls.letter === 'p' ? 7 : 8;
    if (cls.grade < 3 || cls.grade > max) return { ok: false, error: `${name} : seuls les degrés IT3 à IT${max} sont couverts pour cette position.` };
    const delta = i === 0 ? 0 : T - IT[cls.grade - 1][i];
    let es = -SHAFT_LOWER[cls.letter][i] + delta;
    // Cas particulier de la norme : M6 de 250 à 315 mm, ES = −9 µm.
    if (cls.letter === 'm' && cls.grade === 6 && i === 10) es = -9;
    return { ok: true, value: { upper: es, lower: es - T } };
  }
  return { ok: false, error: `Position ${name} non couverte (alésages D, E, F, G, H, JS, K, M, N, P).` };
}

export interface Fit {
  hole: Deviations; shaft: Deviations;
  /** Jeu maximal et minimal (µm) ; un jeu négatif est un serrage. */
  maxClearance: number; minClearance: number;
  type: 'jeu' | 'incertain' | 'serrage';
}

/** Ajustement alésage / arbre (« H7/g6 ») : écarts, jeux extrêmes et nature de l'ajustement. */
export function fit(nominal: number, holeText: string, shaftText: string): Result<Fit> {
  const h = parseClass(holeText), s = parseClass(shaftText);
  if (!h || !h.hole) return { ok: false, error: `Classe d'alésage illisible : « ${holeText} » (majuscule, ex. H7).` };
  if (!s || s.hole) return { ok: false, error: `Classe d'arbre illisible : « ${shaftText} » (minuscule, ex. g6).` };
  const dh = deviations(nominal, h);
  if (!dh.ok) return dh;
  const ds = deviations(nominal, s);
  if (!ds.ok) return ds;
  const maxClearance = dh.value.upper - ds.value.lower;
  const minClearance = dh.value.lower - ds.value.upper;
  const type = minClearance >= 0 ? 'jeu' : maxClearance <= 0 ? 'serrage' : 'incertain';
  return { ok: true, value: { hole: dh.value, shaft: ds.value, maxClearance, minClearance, type } };
}

/** Écart affiché en mm signé : « +0,021 », « −0,007 », « 0 ». */
export function formatDeviation(um: number): string {
  if (um === 0) return '0';
  const mm = Math.abs(um) / 1000;
  return `${um > 0 ? '+' : '−'}${mm.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}`;
}
