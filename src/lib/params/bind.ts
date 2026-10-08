// Cotes pilotantes (lot 12.2) : les contraintes cotées dont la valeur est une expression de
// paramètres reçoivent la valeur calculée. Une expression en erreur garde la dernière valeur (le
// panneau signale l'erreur) : rien n'est déformé par une saisie incomplète.
import type { GeoConstraint } from '@/types/cad';
import { evaluateWith, parse, references, resolveParameters, type Parameter, type Resolved } from './expr';

/** Valeurs des contraintes pilotées par une expression ; même tableau si rien ne change. */
export function bindConstraintValues(constraints: GeoConstraint[] | undefined, params: Parameter[] | undefined, resolved?: Resolved): GeoConstraint[] | undefined {
  if (!constraints?.some(k => 'expr' in k && k.expr)) return constraints;
  const r = resolved ?? resolveParameters(params ?? []);
  let changed = false;
  const out = constraints.map(k => {
    if (!('expr' in k) || !k.expr) return k;
    const v = evaluateWith(k.expr, r);
    if (!('value' in v) || !(v.value > 0) || v.value === k.value) return k;
    changed = true;
    return { ...k, value: v.value } as GeoConstraint;
  });
  return changed ? out : constraints;
}

/** Erreur de l'expression d'une contrainte cotée (null si elle donne une valeur positive). */
export function constraintExprError(expr: string, params: Parameter[] | undefined): string | null {
  const v = evaluateWith(expr, resolveParameters(params ?? []));
  if ('error' in v) return v.error;
  return v.value > 0 ? null : `Valeur ${v.value} : une cote doit être positive.`;
}

/** Ce qui cite un paramètre : autres paramètres et contraintes. */
export function usesOf(name: string, params: Parameter[] | undefined, constraints: GeoConstraint[] | undefined): string[] {
  const cites = (expr: string) => { try { return references(parse(expr)).has(name); } catch { return false; } };
  return [
    ...(params ?? []).filter(p => p.name !== name && cites(p.expr)).map(p => p.name),
    ...(constraints ?? []).filter(k => 'expr' in k && k.expr && cites(k.expr)).map(k => k.id),
  ];
}
