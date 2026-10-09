// Assistant à boucle contrôlée (lot 18.3, Concept §9, annexe D4) : un générateur propose une
// séquence d'opérations (commandes de l'API, lot 18.1) ; les moteurs déterministes la valident à
// blanc ; en cas d'erreur, les erreurs lui sont renvoyées, trois corrections au plus. La séquence
// validée est aperçue puis exécutée seulement après accord explicite (hors de ce module). Les
// hypothèses du générateur sont rendues avec la proposition. Fonctions pures, sauf l'appel au générateur.
import type { CadObject, GeoConstraint, Layer } from '@/types/cad';
import type { Parameter } from '@/lib/params/expr';
import { KIND_LABEL, withDependents, withoutDanglingMates } from '@/types/cad';
import { resolveMates } from '@/lib/assembly';
import { enforceConstraints, pruneConstraints } from '@/lib/constraints/model';
import { bindConstraintValues } from '@/lib/params/bind';
import { onLevel } from '@/lib/levels';
import { applyTransform, scriptCommandError, transformTargetsError, validateCommand, type TransformOp } from '@/lib/commands';
import { beamError, columnError } from '@/lib/structure';

export interface ProposedStep {
  type: string;
  args: unknown[];
  /** Ce que fait l'opération, en clair. */
  why?: string;
}

export interface Proposal {
  steps: ProposedStep[];
  /** Hypothèses prises par le générateur (interprétations, valeurs non précisées par la demande). */
  hypotheses: string[];
  /** Questions : la demande ne suffit pas, rien n'est proposé (jamais de valeur inventée). */
  questions?: string[];
}

export interface AssistantContext {
  /** Objets de tous les niveaux. */
  objects: CadObject[];
  layers: Pick<Layer, 'id' | 'name' | 'locked'>[];
  activeLayerId: string;
  activeLevelId?: string;
  /** Niveaux et définitions de blocs du projet (références des objets proposés). */
  levels?: { id: string }[];
  blocks?: { id: string }[];
  zones?: { id: string }[];
  /** Contraintes géométriques et paramètres du projet (re-résolus après chaque opération simulée). */
  constraints?: GeoConstraint[];
  parameters?: Parameter[];
}

export interface GeneratorRequest {
  request: string;
  context: AssistantContext;
  /** Erreurs de validation de la proposition précédente (vide au premier essai). */
  feedback: string[];
  /** Rang de l'essai : 0, puis 1 à 3 pour les corrections. */
  attempt: number;
}

export interface Generator {
  /** Nom affiché et journalisé (ex. « générateur local de démonstration »). */
  name: string;
  propose(req: GeneratorRequest): Promise<Proposal>;
}

/** Commandes que l'assistant peut proposer : création, modification, transformation, suppression. */
export const ASSISTANT_COMMANDS = ['addObject', 'updateObject', 'transform', 'removeObjects'] as const;
export const MAX_CORRECTIONS = 3;

const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** Contrôles métier d'un objet à créer (en plus de la validation de l'API). */
function objectError(o: Record<string, unknown>, layers: AssistantContext['layers']): string | null {
  const layer = layers.find(l => l.id === o.layerId);
  if (layer?.locked) return `calque ${layer.name} verrouillé`;
  switch (o.kind) {
    case 'column': return columnError(o as never);
    case 'beam': return beamError(o as never);
    case 'wall': {
      if (![o.x1, o.y1, o.x2, o.y2, o.thickness].every(finite)) return 'Mur : coordonnées et épaisseur numériques attendues.';
      if (!(Math.hypot((o.x2 as number) - (o.x1 as number), (o.y2 as number) - (o.y1 as number)) > 0)) return 'Mur : deux points distincts attendus.';
      if (!((o.thickness as number) > 0)) return 'Mur : épaisseur positive attendue.';
      return ['axe', 'gauche', 'droite'].includes(o.justification as string) ? null : 'Mur : justification axe, gauche ou droite attendue.';
    }
    default: return null;
  }
}

export interface DryRun {
  /** Erreurs, une par opération fautive : « opération n : … ». */
  errors: string[];
  /** Objets du projet après la séquence (simulée), et objets créés (identifiants provisoires). */
  objects: CadObject[];
  added: CadObject[];
}

/** Validation à blanc d'une séquence : chaque opération sur l'état laissé par la précédente. */
export function dryRun(steps: ProposedStep[], ctx: AssistantContext): DryRun {
  const errors: string[] = [];
  let objects = [...ctx.objects];
  const added: CadObject[] = [];
  if (!steps.length) errors.push('aucune opération proposée');
  steps.forEach((s, i) => {
    const at = `opération ${i + 1} (${s.type})`;
    if (!(ASSISTANT_COMMANDS as readonly string[]).includes(s.type)) { errors.push(`${at} : commande non permise à l’assistant`); return; }
    if (!Array.isArray(s.args)) { errors.push(`${at} : arguments attendus`); return; }
    const closed = scriptCommandError(s.type, s.args);
    if (closed) { errors.push(`${at} : ${closed}`); return; }
    const err = validateCommand(s.type, s.args, objects, ctx.layers, { levels: ctx.levels, blocks: ctx.blocks, zones: ctx.zones, activeLevelId: ctx.activeLevelId });
    if (err) { errors.push(`${at} : ${err}`); return; }
    const prev = objects;
    if (s.type === 'addObject') {
      const o = s.args[0] as Record<string, unknown>;
      const e = objectError(o, ctx.layers);
      if (e) { errors.push(`${at} : ${e}`); return; }
      const obj = { ...o, id: provisionalId(added.length + 1), name: `proposé ${added.length + 1}`, createdSeq: 0, ...(ctx.activeLevelId && !o.levelId ? { levelId: ctx.activeLevelId } : {}) } as CadObject;
      added.push(obj);
      objects = [...objects, obj];
    } else if (s.type === 'removeObjects') {
      // Comme la commande : les objets associatifs (ouvertures, cotes, vues liées) partent avec leur parent.
      const ids = withDependents(objects, s.args[0] as string[]);
      objects = withoutDanglingMates(objects.filter(o => !ids.has(o.id)));
    } else if (s.type === 'transform') {
      const list = s.args[0] as string[];
      // Comme la commande : un objet non modifiable (calque verrouillé, cote associative, fond de plan
      // verrouillé) ou qui n'accepte pas l'opération ne bougerait pas ; la proposition est refusée
      // plutôt que de montrer un faux aperçu.
      const blocked = transformTargetsError(list, s.args[1] as TransformOp, objects, ctx.layers);
      if (blocked) { errors.push(`${at} : ${blocked}`); return; }
      const ids = new Set(list);
      const f = applyTransform(s.args[1] as TransformOp);
      // Une note jointe suit son objet : la commande ne la transforme pas deux fois.
      objects = objects.map(o => { if (!ids.has(o.id) || (o.kind === 'note' && o.targetId && ids.has(o.targetId))) return o; const p = f(o); return p ? ({ ...o, ...p } as CadObject) : o; });
    } else if (s.type === 'updateObject') {
      const [id, patch] = s.args as [string, Record<string, unknown>];
      const next = { ...objects.find(o => o.id === id)!, ...patch } as CadObject;
      if (!Object.prototype.hasOwnProperty.call(KIND_LABEL, next.kind)) { errors.push(`${at} : type d’objet inconnu`); return; }
      const e = objectError(next as unknown as Record<string, unknown>, ctx.layers);
      if (e) { errors.push(`${at} : ${e}`); return; }
      objects = objects.map(o => (o.id === id ? next : o));
    }
    // Comme l'enregistrement d'une version : contraintes géométriques re-résolues (cotes pilotées par
    // les paramètres comprises), puis les occurrences liées suivent leur cible.
    const constraints = bindConstraintValues(pruneConstraints(objects, ctx.constraints), ctx.parameters);
    if (constraints?.length && objects !== prev) objects = enforceConstraints(prev, objects, constraints).objects;
    objects = resolveMates(objects).objects;
  });
  return { errors, objects, added };
}

/** Identifiant provisoire du n-ième objet créé par une proposition (validation à blanc). */
export const provisionalId = (n: number) => `PROP-${String(n).padStart(4, '0')}`;

/**
 * Exécution d'une proposition : chaque objet créé reçoit son identifiant réel ; les opérations
 * suivantes qui désignaient son identifiant provisoire sont réécrites avec l'identifiant réel.
 */
export function remapIds(v: unknown, real: Map<string, string>): unknown {
  if (typeof v === 'string') return real.get(v) ?? v;
  if (Array.isArray(v)) return v.map(x => remapIds(x, real));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remapIds(x, real)]));
  return v;
}

/**
 * Différence entre le projet et le résultat simulé, sur un niveau (aperçu) : objets inchangés,
 * créés, modifiés (même identifiant, contenu différent) et supprimés.
 */
export function previewDiff(before: CadObject[], after: CadObject[], levelId: string) {
  const shown = (l: CadObject[]) => onLevel(l, levelId).filter(o => o.kind !== 'underlay' && o.kind !== 'note');
  const b = shown(before), a = shown(after);
  const old = new Map(b.map(o => [o.id, JSON.stringify(o)]));
  const kept = new Set(a.map(o => o.id));
  return {
    same: a.filter(o => old.get(o.id) === JSON.stringify(o)),
    added: a.filter(o => !old.has(o.id)),
    modified: a.filter(o => old.has(o.id) && old.get(o.id) !== JSON.stringify(o)),
    removed: b.filter(o => !kept.has(o.id)),
  };
}

export interface Attempt {
  proposal: Proposal;
  errors: string[];
}

export type LoopResult =
  | { status: 'ready'; proposal: Proposal; preview: DryRun; attempts: Attempt[]; corrections: number; fromCache: boolean }
  | { status: 'questions'; questions: string[]; hypotheses: string[]; attempts: Attempt[] }
  | { status: 'failed'; errors: string[]; attempts: Attempt[] };

/** Clé du cache sémantique : demande normalisée (casse, espaces, ponctuation finale). */
export const requestKey = (request: string) => request.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?\s]+$/, '');

/**
 * Boucle contrôlée : proposition, validation à blanc, au plus trois corrections. Le cache garde les
 * propositions validées ; une proposition en cache est revalidée sur le projet du moment avant
 * d'être resservie (sinon elle est oubliée et le générateur est rappelé).
 */
export async function controlledLoop(generator: Generator, request: string, ctx: AssistantContext, cache?: Map<string, Proposal>): Promise<LoopResult> {
  const key = requestKey(request);
  const cached = cache?.get(key);
  if (cached) {
    const preview = dryRun(cached.steps, ctx);
    if (!preview.errors.length) return { status: 'ready', proposal: cached, preview, attempts: [], corrections: 0, fromCache: true };
    cache!.delete(key);
  }
  const attempts: Attempt[] = [];
  let feedback: string[] = [];
  for (let attempt = 0; attempt <= MAX_CORRECTIONS; attempt++) {
    let proposal: Proposal;
    try {
      proposal = await generator.propose({ request, context: ctx, feedback, attempt });
    } catch (e) {
      return { status: 'failed', errors: [`générateur : ${e instanceof Error ? e.message : String(e)}`], attempts };
    }
    if (proposal.questions?.length) return { status: 'questions', questions: proposal.questions, hypotheses: proposal.hypotheses, attempts };
    const preview = dryRun(proposal.steps, ctx);
    attempts.push({ proposal, errors: preview.errors });
    if (!preview.errors.length) {
      cache?.set(key, proposal);
      return { status: 'ready', proposal, preview, attempts, corrections: attempt, fromCache: false };
    }
    feedback = preview.errors;
  }
  return { status: 'failed', errors: feedback, attempts };
}

/** Générateur simulé (tests) : rend les propositions données, dans l'ordre, et note les demandes reçues. */
export function scriptedGenerator(proposals: Proposal[]): Generator & { calls: GeneratorRequest[] } {
  const calls: GeneratorRequest[] = [];
  return {
    name: 'générateur simulé',
    calls,
    propose: async req => {
      calls.push(req);
      const p = proposals[Math.min(calls.length - 1, proposals.length - 1)];
      if (!p) throw new Error('aucune proposition');
      return p;
    },
  };
}
