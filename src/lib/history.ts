// Historique compact (lot 8.1) : enregistrement des microversions par différences. La première
// version et la version courante sont écrites en entier (la version courante reste lisible telle
// quelle) ; chaque autre version ne porte que ce qui change par rapport à la précédente : objets
// ajoutés ou modifiés, identifiants retirés, ordre s'il change, autres champs remplacés s'ils
// changent. En mémoire, les versions partagent les objets inchangés (aucune copie complète).
import type { Branch, CadObject, MicroVersion, ProjectState } from '@/types/cad';

const META = new Set(['seq', 'label', 'time', 'named', 'index']);

/** Différence d'une version par rapport à la précédente. */
export interface VersionDelta {
  objects?: { set?: CadObject[]; del?: string[]; order?: string[] };
  put?: Record<string, unknown>;
  drop?: string[];
}
export type StoredVersion = MicroVersion | (Pick<MicroVersion, 'seq' | 'label' | 'time' | 'named' | 'index'> & { delta: VersionDelta });

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const meta = (v: MicroVersion) => {
  const m: Pick<MicroVersion, 'seq' | 'label' | 'time' | 'named' | 'index'> = { seq: v.seq, label: v.label, time: v.time };
  if (v.named !== undefined) m.named = v.named;
  if (v.index !== undefined) m.index = v.index;
  return m;
};

/** Différence de `cur` par rapport à `prev`. */
export function diffVersion(prev: MicroVersion, cur: MicroVersion): VersionDelta {
  const d: VersionDelta = {};
  const before = new Map(prev.objects.map(o => [o.id, o]));
  const now = new Set(cur.objects.map(o => o.id));
  const set = cur.objects.filter(o => { const p = before.get(o.id); return !p || !same(p, o); });
  const del = prev.objects.filter(o => !now.has(o.id)).map(o => o.id);
  // Ordre obtenu en appliquant la différence : objets gardés dans leur ordre, nouveaux à la fin.
  const kept = prev.objects.filter(o => now.has(o.id)).map(o => o.id);
  const added = cur.objects.filter(o => !before.has(o.id)).map(o => o.id);
  const natural = [...kept, ...added];
  const order = cur.objects.map(o => o.id);
  if (set.length || del.length || !same(natural, order)) {
    d.objects = {};
    if (set.length) d.objects.set = set;
    if (del.length) d.objects.del = del;
    if (!same(natural, order)) d.objects.order = order;
  }
  const keys = new Set([...Object.keys(prev), ...Object.keys(cur)].filter(k => !META.has(k) && k !== 'objects'));
  for (const k of keys) {
    const a = (prev as unknown as Record<string, unknown>)[k], b = (cur as unknown as Record<string, unknown>)[k];
    if (b === undefined && a !== undefined) (d.drop ??= []).push(k);
    else if (b !== undefined && !same(a, b)) (d.put ??= {})[k] = b;
  }
  return d;
}

/** Version obtenue en appliquant `d` à `prev` (les objets inchangés sont partagés). */
export function applyDelta(prev: MicroVersion, m: Pick<MicroVersion, 'seq' | 'label' | 'time' | 'named' | 'index'>, d: VersionDelta): MicroVersion {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(prev)) if (!META.has(k)) out[k] = v;
  Object.assign(out, m);
  for (const k of d.drop ?? []) delete out[k];
  Object.assign(out, d.put ?? {});
  if (d.objects) {
    const del = new Set(d.objects.del ?? []);
    const set = new Map((d.objects.set ?? []).map(o => [o.id, o]));
    const kept = prev.objects.filter(o => !del.has(o.id)).map(o => set.get(o.id) ?? o);
    const keptIds = new Set(kept.map(o => o.id));
    let objects = [...kept, ...(d.objects.set ?? []).filter(o => !keptIds.has(o.id))];
    if (d.objects.order) { const byId = new Map(objects.map(o => [o.id, o])); objects = d.objects.order.map(id => byId.get(id)).filter((o): o is CadObject => !!o); }
    out.objects = objects;
  }
  return out as unknown as MicroVersion;
}

const encodeVersions = (versions: MicroVersion[], pointer: number): StoredVersion[] =>
  versions.map((v, i) => (i === 0 || i === pointer ? v : { ...meta(v), delta: diffVersion(versions[i - 1], v) }));

function decodeVersions(stored: StoredVersion[]): MicroVersion[] {
  const out: MicroVersion[] = [];
  for (const raw of stored) {
    if ('delta' in raw && raw.delta && out.length) {
      const { delta, ...m } = raw;
      out.push(applyDelta(out[out.length - 1], m, delta));
    } else out.push(raw as MicroVersion);
  }
  return out;
}

/**
 * État à enregistrer : historique par différences (première et courante versions en entier), pour la
 * branche active comme pour chaque branche rangée (lot 14.1).
 */
export function encodeHistory(state: ProjectState): Omit<ProjectState, 'versions' | 'branches'> & { versions: StoredVersion[]; branches?: (Omit<Branch, 'versions'> & { versions: StoredVersion[] })[] } {
  return {
    ...state,
    versions: encodeVersions(state.versions, state.pointer),
    ...(state.branches ? { branches: state.branches.map(b => ({ ...b, versions: encodeVersions(b.versions, b.pointer) })) } : {}),
  };
}

/** État reconstruit : chaque version entière, objets inchangés partagés avec la précédente. */
export function decodeHistory<T extends { versions: unknown[] }>(stored: T): T {
  const branches = (stored as { branches?: unknown }).branches;
  return {
    ...stored,
    versions: decodeVersions(stored.versions as StoredVersion[]),
    ...(Array.isArray(branches) ? { branches: branches.map(b => (b && typeof b === 'object' && Array.isArray(b.versions) ? { ...b, versions: decodeVersions(b.versions) } : b)) } : {}),
  };
}
