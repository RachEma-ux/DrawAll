// Générateur local de démonstration (lot 18.3) : aucun modèle de langage, aucun envoi externe (le
// fournisseur d'un modèle est une décision §7 de la feuille de route). Il reconnaît quelques demandes
// en français et les traduit en commandes de l'API. Une valeur que la demande ne donne pas n'est
// jamais inventée : elle fait l'objet d'une question. Les interprétations sont rendues en hypothèses.
import type { Generator, GeneratorRequest, Proposal, ProposedStep } from './loop';

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const UNIT = String.raw`(mm|cm|m)\b`;
const toMm = (v: string, unit: string) => {
  const n = Number(v);
  return unit === 'm' ? n * 1000 : unit === 'cm' ? n * 10 : n;
};
const fmt = (mm: number) => `${mm.toLocaleString('fr-FR')} mm`;

/** Minuscules, virgule décimale en point, espaces réduits. */
export const normalizeRequest = (s: string) => s.toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();

const SUPPORTED = [
  '« grille de 3 x 4 poteaux 300 x 300 mm entraxe 5 m » (ou « diamètre 400 mm », « entraxes 5 m et 6 m », « à partir de 1000;2000 mm »)',
  '« rectangle de murs 6 x 4 m épaisseur 200 mm » (ou « à partir de 0;0 m »)',
];

function origin(text: string, hypotheses: string[]): { x: number; y: number } | string {
  const m = text.match(new RegExp(String.raw`(?:à partir de|depuis|origine(?: au point)?)\s*\(?(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)\)?\s*(?:` + UNIT + ')?'));
  if (!m) { hypotheses.push('Origine non précisée : premier élément au point 0;0 du plan.'); return { x: 0, y: 0 }; }
  if (!m[3]) return 'Unité de l’origine ? (ex. « à partir de 1000;2000 mm »)';
  return { x: toMm(m[1], m[3]), y: toMm(m[2], m[3]) };
}

function columnGrid(text: string, req: GeneratorRequest): Proposal {
  const hypotheses: string[] = [];
  const questions: string[] = [];
  const g = text.match(/grille de (\d+)\s*[x×]\s*(\d+) poteaux?/)!;
  const rows = Number(g[1]), cols = Number(g[2]);
  if (!(rows >= 1 && cols >= 1 && rows * cols <= 400)) questions.push('Nombre de poteaux : de 1 à 400.');
  hypotheses.push(`${rows} rangée${rows > 1 ? 's' : ''} selon Y, ${cols} file${cols > 1 ? 's' : ''} selon X.`);
  const rect = text.match(new RegExp(`poteaux?[^]*?${NUM}\\s*[x×]\\s*${NUM}\\s*${UNIT}`));
  const circ = text.match(new RegExp(`(?:diamètre|ø)\\s*${NUM}\\s*${UNIT}`));
  let section: Record<string, unknown> | null = null;
  if (circ) section = { section: 'circle', d: toMm(circ[1], circ[2]) };
  else if (rect) section = { section: 'rect', b: toMm(rect[1], rect[3]), h: toMm(rect[2], rect[3]) };
  else questions.push('Section des poteaux ? (ex. « 300 x 300 mm » ou « diamètre 400 mm »)');
  const e = text.match(new RegExp(`entraxes? (?:de )?${NUM}\\s*${UNIT}(?:\\s*(?:et|par|x|×)\\s*${NUM}\\s*${UNIT})?`));
  let ex = 0, ey = 0;
  if (!e) { if (rows * cols > 1) questions.push('Entraxe des poteaux ? (ex. « entraxe 5 m » ou « entraxes 5 m et 6 m »)'); }
  else {
    ex = toMm(e[1], e[2]);
    ey = e[3] ? toMm(e[3], e[4]) : ex;
    hypotheses.push(e[3] ? `Entraxes d’axe en axe : ${fmt(ex)} selon X, ${fmt(ey)} selon Y.` : `Entraxe d’axe en axe, le même dans les deux directions : ${fmt(ex)}.`);
  }
  const o = origin(text, hypotheses);
  if (typeof o === 'string') questions.push(o);
  if (questions.length || !section || typeof o === 'string') return { steps: [], hypotheses, questions };
  hypotheses.push(`Poteaux sur le calque actif ; hauteur non saisie (volume non évalué).`);
  const steps: ProposedStep[] = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const x = o.x + j * ex, y = o.y + i * ey;
    steps.push({ type: 'addObject', args: [{ kind: 'column', classification: 'structure', layerId: req.context.activeLayerId, hatch: 'none', x, y, ...section }], why: `Poteau en ${x};${y}` });
  }
  return { steps, hypotheses };
}

function wallRectangle(text: string, req: GeneratorRequest): Proposal {
  const hypotheses: string[] = [];
  const questions: string[] = [];
  const d = text.match(new RegExp(`murs? (?:de )?${NUM}\\s*(?:${UNIT})?\\s*[x×]\\s*${NUM}\\s*${UNIT}`))!;
  const w = toMm(d[1], d[2] ?? d[4]), h = toMm(d[3], d[4]);
  const t = text.match(new RegExp(`épaisseur (?:de )?${NUM}\\s*${UNIT}`));
  if (!t) questions.push('Épaisseur des murs ? (ex. « épaisseur 200 mm »)');
  hypotheses.push(`Dimensions d’axe en axe : ${fmt(w)} selon X, ${fmt(h)} selon Y ; murs justifiés sur leur axe.`);
  const o = origin(text, hypotheses);
  if (typeof o === 'string') questions.push(o);
  if (questions.length || !t || typeof o === 'string') return { steps: [], hypotheses, questions };
  const thickness = toMm(t[1], t[2]);
  hypotheses.push('Murs sur le calque actif ; hauteur non saisie (hauteur d’étage).');
  const c = [[o.x, o.y], [o.x + w, o.y], [o.x + w, o.y + h], [o.x, o.y + h]];
  const steps = c.map(([x1, y1], i) => {
    const [x2, y2] = c[(i + 1) % 4];
    return { type: 'addObject', args: [{ kind: 'wall', classification: 'architecture', layerId: req.context.activeLayerId, hatch: 'none', x1, y1, x2, y2, thickness, justification: 'axe' }], why: `Mur de ${x1};${y1} à ${x2};${y2}` };
  });
  return { steps, hypotheses };
}

export const localGenerator: Generator = {
  name: 'générateur local de démonstration',
  propose: async req => {
    const text = normalizeRequest(req.request);
    if (/grille de \d+\s*[x×]\s*\d+ poteaux?/.test(text)) return columnGrid(text, req);
    if (new RegExp(`murs? (?:de )?${NUM}\\s*(?:${UNIT})?\\s*[x×]\\s*${NUM}\\s*${UNIT}`).test(text) && /rectangle|enceinte|périmètre/.test(text)) return wallRectangle(text, req);
    return { steps: [], hypotheses: [], questions: [`Demande non reconnue par le générateur local de démonstration. Formes reconnues : ${SUPPORTED.join(' ; ')}.`] };
  },
};
