import { describe, expect, it } from 'vitest';
import { evaluate, evaluateWith, isValidName, parse, references, resolveParameters, type Parameter } from './expr';

const P = (name: string, expr: string): Parameter => ({ id: name, name, expr, unit: 'mm' });
const val = (s: string) => evaluate(parse(s), () => { throw new Error('aucun paramètre'); });

describe('expressions des paramètres (lot 12.2)', () => {
  it('priorités, parenthèses, signes, puissance à droite, virgule décimale', () => {
    expect(val('1 + 2 * 3')).toBe(7);
    expect(val('(1 + 2) * 3')).toBe(9);
    expect(val('-2 ^ 2')).toBe(-4);
    expect(val('2 ^ 3 ^ 2')).toBe(512);
    expect(val('10 - 4 - 3')).toBe(3);
    expect(val('12 / 4 / 3')).toBe(1);
    expect(val('1,5 * 2')).toBe(3);
    expect(val('.5 + 1e3')).toBe(1000.5);
  });
  it('fonctions (angles en degrés) et constante pi', () => {
    expect(val('racine(16)')).toBe(4);
    expect(val('sin(30)')).toBeCloseTo(0.5, 12);
    expect(val('atan(1)')).toBeCloseTo(45, 12);
    expect(val('max(3; 9; 4)')).toBe(9);
    expect(val('2 * pi')).toBeCloseTo(2 * Math.PI, 15);
  });
  it('erreurs de syntaxe en clair, sans eval', () => {
    expect(() => parse('1 +')).toThrow('Expression incomplète');
    expect(() => parse('(1 + 2')).toThrow('Parenthèse fermante attendue');
    expect(() => parse('2 $ 3')).toThrow('Caractère inattendu « $ »');
    expect(() => parse('foo(1)')).toThrow('Fonction inconnue « foo »');
    expect(() => parse('sin(1; 2)')).toThrow('« sin » attend 1 argument');
    expect(() => parse('alert(1)')).toThrow('Fonction inconnue');
    expect(() => val('1 / 0')).toThrow('Division par zéro');
  });
  it('références citées', () => {
    expect([...references(parse('L * 2 + max(H; e) - pi'))]).toEqual(['L', 'H', 'e']);
  });
  it('résolution dans l’ordre des dépendances', () => {
    const r = resolveParameters([P('W', 'L / 2'), P('L', '1000'), P('S', 'L * W')]);
    expect(Object.fromEntries(r.values)).toEqual({ L: 1000, W: 500, S: 500000 });
    expect(r.errors.size).toBe(0);
  });
  it('référence circulaire refusée, avec le cycle ; nom inconnu signalé', () => {
    const r = resolveParameters([P('A', 'B + 1'), P('B', 'C * 2'), P('C', 'A'), P('D', '5'), P('E', 'Z')]);
    expect(r.errors.get('A')).toBe('Référence circulaire : A → B → C → A.');
    expect(r.errors.has('B') && r.errors.has('C')).toBe(true);
    expect(r.values.get('D')).toBe(5);
    expect(r.errors.get('E')).toBe('Paramètre inconnu « Z ».');
    expect(resolveParameters([P('X', 'X')]).errors.get('X')).toBe('Référence circulaire : X → X.');
  });
  it('cote pilotante : valeur d’une expression avec les paramètres résolus', () => {
    const r = resolveParameters([P('L', '1200')]);
    expect(evaluateWith('L / 2', r)).toEqual({ value: 600 });
    expect(evaluateWith('Q', r)).toEqual({ error: 'Paramètre inconnu « Q ».' });
  });
  it('noms de paramètres', () => {
    expect(isValidName('L')).toBe(true);
    expect(isValidName('largeur_2')).toBe(true);
    expect(isValidName('2L')).toBe(false);
    // Première lettre obligatoire : ni souligné, ni signe Latin-1 (× ÷) ; lettres accentuées admises.
    expect(isValidName('_L')).toBe(false);
    expect(isValidName('×')).toBe(false);
    expect(isValidName('a÷b')).toBe(false);
    expect(isValidName('Épaisseur_dalle')).toBe(true);
    expect(() => parse('_L + 1')).toThrow();
    expect(() => parse('L×2')).toThrow();
    expect(isValidName('pi')).toBe(false);
    expect(isValidName('sin')).toBe(false);
  });
});
