// Assemblage (lot 16.4) : liaisons d'une occurrence à une pièce ou à une autre occurrence (fixe,
// coaxiale, appui plan), résolues à chaque version ; nomenclature d'assemblage ; vue éclatée.
// Les liaisons ne tournent qu'autour de la verticale (les occurrences n'ont qu'un angle) : une
// liaison qui exigerait une autre rotation n'est pas satisfaite, et elle est signalée.
import type { CadObject, OccurrenceObj } from '@/types/cad';
import type { FaceRef, Vec3 } from './kernel/recipe';
import { featureSupports, supportOf, type Support } from './kernel/references';
import { effectiveSolid, partInstances } from './solids';

export type Mate =
  /** Position et angle relatifs à la référence, figés à la création de la liaison. */
  | { type: 'fixe'; to: string; rel: [number, number, number, number] }
  /** Axes de deux cylindres verticaux confondus (glissement le long de l'axe et rotation libres). */
  | { type: 'coaxiale'; to: string; face: FaceRef; toFace: FaceRef }
  /** Face plane de l'occurrence contre une face plane de la référence, à `offset` mm (normales opposées). */
  | { type: 'appui'; to: string; face: FaceRef; toFace: FaceRef; offset: number };

export const MATE_LABEL: Record<Mate['type'], string> = { fixe: 'Fixe', coaxiale: 'Coaxiale', appui: 'Appui plan' };

type Frame = { p: Vec3; a: number };
type Placement = Pick<OccurrenceObj, 'x' | 'y' | 'z' | 'angle'>;

/** Repère d'un objet assemblable : occurrence (point de base, angle) ou pièce type (repère local). */
export function frameOf(o: CadObject | undefined): Frame | null {
  if (o?.kind === 'occurrence') return { p: [o.x, o.y, o.z], a: o.angle };
  if (o?.kind === 'solid' && o.partDef) return { p: o.partDef.origin, a: o.partDef.angle };
  return null;
}

const rot = (x: number, y: number, deg: number): [number, number] => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  return [x * c - y * s, x * s + y * c];
};

/** Liaison fixe : position et angle de `dep` exprimés dans le repère de `ref`. */
export function fixeMate(dep: OccurrenceObj, ref: CadObject): Mate | null {
  const f = frameOf(ref);
  if (!f) return null;
  const [lx, ly] = rot(dep.x - f.p[0], dep.y - f.p[1], -f.a);
  return { type: 'fixe', to: ref.id, rel: [lx, ly, dep.z - f.p[2], dep.angle - f.a] };
}

function supportFor(o: CadObject, objects: CadObject[], face: FaceRef): Support | string {
  const s = effectiveSolid(o, objects);
  if (!s) return `${o.id} n'est ni une pièce ni une occurrence`;
  const r = supportOf(featureSupports(s.recipe), face);
  return 'reason' in r ? `${face.feature}.${face.role} : ${r.reason}` : r.support;
}

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const normal = (s: Support): Vec3 => (s.kind === 'cylinder' ? s.axis : s.n);

/** Placement de l'occurrence qui satisfait sa liaison, ou la raison de l'échec. */
export function placeMate(dep: OccurrenceObj, mate: Mate, objects: CadObject[]): Placement | { error: string } {
  const ref = objects.find(o => o.id === mate.to);
  if (!ref) return { error: `référence ${mate.to} absente` };
  if (mate.type === 'fixe') {
    const f = frameOf(ref);
    if (!f) return { error: `${ref.id} n'est ni une pièce ni une occurrence` };
    const [dx, dy] = rot(mate.rel[0], mate.rel[1], f.a);
    return { x: f.p[0] + dx, y: f.p[1] + dy, z: f.p[2] + mate.rel[2], angle: f.a + mate.rel[3] };
  }
  const sb = supportFor(ref, objects, mate.toFace);
  if (typeof sb === 'string') return { error: sb };
  let place: Placement = { x: dep.x, y: dep.y, z: dep.z, angle: dep.angle };
  const at = (p: Placement) => ({ ...dep, ...p });
  const sa0 = supportFor(dep, objects, mate.face);
  if (typeof sa0 === 'string') return { error: sa0 };
  if (mate.type === 'coaxiale') {
    if (sa0.kind !== 'cylinder' || sb.kind !== 'cylinder') return { error: 'liaison coaxiale : deux faces cylindriques attendues' };
    if (Math.abs(Math.abs(sa0.axis[2]) - 1) > 1e-9 || Math.abs(Math.abs(sb.axis[2]) - 1) > 1e-9) return { error: 'liaison coaxiale : axes verticaux attendus' };
    return { ...place, x: place.x + sb.o[0] - sa0.o[0], y: place.y + sb.o[1] - sa0.o[1] };
  }
  if (sa0.kind === 'cylinder' || sb.kind === 'cylinder') return { error: 'appui plan : deux faces planes attendues' };
  const nb = normal(sb);
  let na = normal(sa0);
  // Normales horizontales : rotation autour de la verticale pour les opposer.
  if (Math.abs(na[2]) < 1e-9 && Math.abs(nb[2]) < 1e-9) {
    const delta = (Math.atan2(-nb[1], -nb[0]) - Math.atan2(na[1], na[0])) * (180 / Math.PI);
    place = { ...place, angle: place.angle + delta };
    const sa1 = supportFor(at(place), objects, mate.face);
    if (typeof sa1 === 'string') return { error: sa1 };
    na = normal(sa1);
  }
  const dot = na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2];
  if (Math.abs(dot + norm(na) * norm(nb)) > 1e-9) return { error: 'appui plan : normales non opposables par une rotation autour de la verticale' };
  const sa = supportFor(at(place), objects, mate.face);
  if (typeof sa === 'string') return { error: sa };
  // Translation selon la normale de la référence : plan de la face à `offset` du plan de la référence.
  const gap = (sa.o[0] - sb.o[0]) * nb[0] + (sa.o[1] - sb.o[1]) * nb[1] + (sa.o[2] - sb.o[2]) * nb[2];
  const t = mate.offset - gap;
  return { ...place, x: place.x + nb[0] * t, y: place.y + nb[1] * t, z: place.z + nb[2] * t };
}

/**
 * Résout toutes les liaisons, références d'abord (ordre de dépendance). Une liaison en boucle ou
 * non satisfaite laisse son occurrence en place et est signalée.
 */
export function resolveMates(objects: CadObject[]): { objects: CadObject[]; errors: { id: string; text: string }[] } {
  const mated = objects.filter((o): o is OccurrenceObj & { mate: Mate } => o.kind === 'occurrence' && !!o.mate);
  if (!mated.length) return { objects, errors: [] };
  const errors: { id: string; text: string }[] = [];
  const byId = new Map(objects.map(o => [o.id, o]));
  const done = new Set<string>(), visiting = new Set<string>();
  const visit = (o: OccurrenceObj & { mate: Mate }) => {
    if (done.has(o.id)) return;
    if (visiting.has(o.id)) { errors.push({ id: o.id, text: 'liaisons en boucle' }); return; }
    visiting.add(o.id);
    const ref = byId.get(o.mate.to);
    if (ref?.kind === 'occurrence' && ref.mate) visit(ref as OccurrenceObj & { mate: Mate });
    visiting.delete(o.id);
    if (errors.some(e => e.id === o.id)) { done.add(o.id); return; }
    const current = byId.get(o.id) as OccurrenceObj;
    const p = placeMate(current, o.mate, [...byId.values()]);
    if ('error' in p) errors.push({ id: o.id, text: p.error });
    else if (p.x !== current.x || p.y !== current.y || p.z !== current.z || p.angle !== current.angle) byId.set(o.id, { ...current, ...p });
    done.add(o.id);
  };
  for (const o of mated) visit(o);
  return { objects: objects.map(o => byId.get(o.id) ?? o), errors };
}

/** Nomenclature d'assemblage : une ligne par pièce (repère), quantité = pièce type + occurrences. */
export function assemblyRows(objects: CadObject[]): { no: number; name: string; qty: number }[] {
  return objects
    .filter((o): o is Extract<CadObject, { kind: 'solid' }> => o.kind === 'solid' && !!o.partDef)
    .sort((a, b) => a.partDef!.no - b.partDef!.no)
    .map(o => ({ no: o.partDef!.no, name: o.part?.trim() || o.name, qty: partInstances(o.id, objects).length }));
}

/**
 * Vue éclatée : chaque élément s'écarte du centre de l'ensemble, proportionnellement à `factor`
 * (0 : assemblé). Centres donnés en coordonnées de la vue.
 */
export function explodeOffsets(centers: Vec3[], factor: number): Vec3[] {
  if (!centers.length) return [];
  const c = [0, 1, 2].map(i => centers.reduce((s, p) => s + p[i], 0) / centers.length);
  return centers.map(p => [0, 1, 2].map(i => (p[i] - c[i]) * factor) as Vec3);
}

/** Liaison bien formée (relecture d'un projet). */
export function isMate(m: unknown): m is Mate {
  if (!m || typeof m !== 'object') return false;
  const x = m as Record<string, unknown>;
  const face = (f: unknown) => !!f && typeof f === 'object' && typeof (f as FaceRef).feature === 'string' && typeof (f as FaceRef).role === 'string';
  if (typeof x.to !== 'string') return false;
  if (x.type === 'fixe') return Array.isArray(x.rel) && x.rel.length === 4 && x.rel.every(v => typeof v === 'number' && Number.isFinite(v));
  if (x.type === 'coaxiale') return face(x.face) && face(x.toFace);
  return x.type === 'appui' && face(x.face) && face(x.toFace) && typeof x.offset === 'number' && Number.isFinite(x.offset);
}
