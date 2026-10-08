// Paramètres nommés (lot 12.2) : évaluateur d'expressions sans `eval` (analyse descendante
// récursive), résolution des paramètres dans l'ordre de leurs dépendances, cycles refusés.
// Grammaire :
//   expr   := terme (('+' | '-') terme)*
//   terme  := facteur (('*' | '/') facteur)*
//   facteur := ('-' | '+') facteur | puissance
//   puissance := primaire ('^' facteur)?
//   primaire := nombre | nom | nom '(' expr (';' expr)* ')' | '(' expr ')'
// Nombres : virgule ou point décimal (« 1,5 » ou « 1.5 ») ; arguments séparés par « ; ».
// Angles des fonctions trigonométriques en degrés. Fonctions pures.

export interface Parameter { id: string; name: string; expr: string; unit: 'mm' | '°' | '' }

type Node =
  | { k: 'num'; v: number }
  | { k: 'ref'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

const RAD = Math.PI / 180;
const FUNCTIONS: Record<string, { arity: [number, number]; f: (...x: number[]) => number }> = {
  racine: { arity: [1, 1], f: Math.sqrt }, sqrt: { arity: [1, 1], f: Math.sqrt },
  abs: { arity: [1, 1], f: Math.abs },
  sin: { arity: [1, 1], f: x => Math.sin(x * RAD) }, cos: { arity: [1, 1], f: x => Math.cos(x * RAD) }, tan: { arity: [1, 1], f: x => Math.tan(x * RAD) },
  asin: { arity: [1, 1], f: x => Math.asin(x) / RAD }, acos: { arity: [1, 1], f: x => Math.acos(x) / RAD }, atan: { arity: [1, 1], f: x => Math.atan(x) / RAD },
  min: { arity: [1, 16], f: Math.min }, max: { arity: [1, 16], f: Math.max },
  arrondi: { arity: [1, 1], f: Math.round }, round: { arity: [1, 1], f: Math.round },
};
const CONSTANTS: Record<string, number> = { pi: Math.PI };

/** Noms réservés (fonctions, constantes) : refusés comme noms de paramètres. */
export const RESERVED = new Set([...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)]);
export const isValidName = (n: string) => /^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ]*$/.test(n) && !RESERVED.has(n.toLowerCase());

export class ExprError extends Error {}

/** Analyse d'une expression ; lève ExprError avec un message en clair. */
export function parse(src: string): Node {
  const s = src.trim();
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const peek = () => { ws(); return s[i]; };
  const fail = (msg: string): never => { throw new ExprError(`${msg} (position ${i + 1} de « ${s} »).`); };
  if (!s) fail('Expression vide');

  const primary = (): Node => {
    const c = peek();
    if (c === '(') { i++; const e = expr(); if (peek() !== ')') fail('Parenthèse fermante attendue'); i++; return e; }
    const num = /^(\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; return { k: 'num', v: Number(num[0].replace(',', '.')) }; }
    const id = /^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ]*/.exec(s.slice(i));
    if (id) {
      i += id[0].length;
      if (peek() === '(') {
        i++;
        const fn = id[0].toLowerCase();
        if (!FUNCTIONS[fn]) fail(`Fonction inconnue « ${id[0]} »`);
        const args = [expr()];
        while (peek() === ';') { i++; args.push(expr()); }
        if (peek() !== ')') fail('Parenthèse fermante attendue');
        i++;
        const [lo, hi] = FUNCTIONS[fn].arity;
        if (args.length < lo || args.length > hi) fail(`« ${fn} » attend ${lo === hi ? lo : `${lo} à ${hi}`} argument${hi > 1 ? 's' : ''}`);
        return { k: 'call', fn, args };
      }
      if (CONSTANTS[id[0].toLowerCase()] !== undefined) return { k: 'num', v: CONSTANTS[id[0].toLowerCase()] };
      return { k: 'ref', name: id[0] };
    }
    return fail(c === undefined ? 'Expression incomplète' : `Caractère inattendu « ${c} »`);
  };
  const factor = (): Node => {
    const c = peek();
    if (c === '-') { i++; return { k: 'neg', a: factor() }; }
    if (c === '+') { i++; return factor(); }
    const base = primary();
    if (peek() === '^') { i++; return { k: 'bin', op: '^', a: base, b: factor() }; }
    return base;
  };
  const term = (): Node => {
    let a = factor();
    for (let c = peek(); c === '*' || c === '/'; c = peek()) { i++; a = { k: 'bin', op: c, a, b: factor() }; }
    return a;
  };
  const expr = (): Node => {
    let a = term();
    for (let c = peek(); c === '+' || c === '-'; c = peek()) { i++; a = { k: 'bin', op: c, a, b: term() }; }
    return a;
  };
  const e = expr();
  ws();
  if (i < s.length) fail(`Caractère inattendu « ${s[i]} »`);
  return e;
}

/** Noms de paramètres cités par une expression. */
export function references(n: Node, out = new Set<string>()): Set<string> {
  switch (n.k) {
    case 'ref': out.add(n.name); break;
    case 'neg': references(n.a, out); break;
    case 'bin': references(n.a, out); references(n.b, out); break;
    case 'call': n.args.forEach(a => references(a, out)); break;
  }
  return out;
}

export function evaluate(n: Node, values: (name: string) => number): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'ref': return values(n.name);
    case 'neg': return -evaluate(n.a, values);
    case 'call': return FUNCTIONS[n.fn].f(...n.args.map(a => evaluate(a, values)));
    case 'bin': {
      const a = evaluate(n.a, values), b = evaluate(n.b, values);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': if (b === 0) throw new ExprError('Division par zéro.'); return a / b;
        case '^': return a ** b;
      }
    }
  }
}

export interface Resolved { values: Map<string, number>; errors: Map<string, string> }

/**
 * Valeurs de tous les paramètres, dans l'ordre de leurs dépendances. Erreurs par paramètre :
 * syntaxe, nom inconnu, référence circulaire (avec le cycle), résultat non fini.
 */
export function resolveParameters(params: Parameter[]): Resolved {
  const byName = new Map(params.map(p => [p.name, p]));
  const values = new Map<string, number>(), errors = new Map<string, string>();
  const parsed = new Map<string, Node>();
  for (const p of params) { try { parsed.set(p.name, parse(p.expr)); } catch (e) { errors.set(p.name, (e as Error).message); } }
  const state = new Map<string, 'en cours' | 'fait'>();
  const visit = (name: string, path: string[]): number => {
    if (values.has(name)) return values.get(name)!;
    if (errors.has(name)) throw new ExprError(`« ${name} » est en erreur.`);
    if (!byName.has(name)) throw new ExprError(`Paramètre inconnu « ${name} ».`);
    if (state.get(name) === 'en cours') throw new ExprError(`Référence circulaire : ${[...path.slice(path.indexOf(name)), name].join(' → ')}.`);
    state.set(name, 'en cours');
    try {
      const v = evaluate(parsed.get(name)!, ref => visit(ref, [...path, name]));
      if (!Number.isFinite(v)) throw new ExprError(`Résultat non fini pour « ${name} ».`);
      values.set(name, v);
      return v;
    } finally { state.set(name, 'fait'); }
  };
  for (const p of params) {
    if (values.has(p.name) || errors.has(p.name)) continue;
    try { visit(p.name, []); } catch (e) { errors.set(p.name, (e as Error).message); }
  }
  return { values, errors };
}

/** Valeur d'une expression (cote pilotante) avec les paramètres résolus ; erreur en clair. */
export function evaluateWith(expr: string, resolved: Resolved): { value: number } | { error: string } {
  try {
    const v = evaluate(parse(expr), name => {
      if (resolved.errors.has(name)) throw new ExprError(`Le paramètre « ${name} » est en erreur : ${resolved.errors.get(name)}`);
      const x = resolved.values.get(name);
      if (x === undefined) throw new ExprError(`Paramètre inconnu « ${name} ».`);
      return x;
    });
    return Number.isFinite(v) ? { value: v } : { error: 'Résultat non fini.' };
  } catch (e) { return { error: (e as Error).message }; }
}
