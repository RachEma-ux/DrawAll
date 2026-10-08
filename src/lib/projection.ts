// Vues projetées (lot 16.1) : dessus, face et côté d'un solide, calculées par le noyau (élimination
// des arêtes cachées, HLR d'OCCT) et associées à leur solide. Le résultat est mis en cache par
// recette et par vue : modifier le solide change la clé, la vue est recalculée. Le cadre de la vue
// se déduit de l'encombrement de la recette, sans attendre le noyau.
import type { CadObject, PrimitiveObject, ProjectionObj, SolidObj } from '@/types/cad';
import type { ProjLines, ProjView, SolidRecipe } from './kernel/recipe';
import { recipeBounds } from './solids';

export const VIEW_LABEL: Record<ProjView, string> = { dessus: 'Vue de dessus', face: 'Vue de face', cote: 'Vue de côté' };

type Entry = { lines: ProjLines } | { error: string };
const cache = new Map<string, Entry>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

export const projectionKey = (recipe: SolidRecipe, view: ProjView) => `${view}|${JSON.stringify(recipe)}`;
export const cachedProjection = (recipe: SolidRecipe, view: ProjView): Entry | undefined => cache.get(projectionKey(recipe, view));
export const subscribeProjections = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const projectionsVersion = () => version;

/** Demande le calcul d'une vue absente du cache (une seule fois à la fois) ; résolu quand elle y est. */
export function requestProjection(recipe: SolidRecipe, view: ProjView, compute: (r: SolidRecipe, v: ProjView) => Promise<ProjLines>): Promise<void> {
  const key = projectionKey(recipe, view);
  if (cache.has(key) || pending.has(key)) return Promise.resolve();
  pending.add(key);
  return compute(recipe, view).then(lines => { cache.set(key, { lines }); }, e => { cache.set(key, { error: e instanceof Error ? e.message : String(e) }); })
    .finally(() => { pending.delete(key); version++; for (const l of listeners) l(); });
}

/** Cadre de la vue dans son repère 2D (x, y du plan), d'après l'encombrement de la recette. */
export function viewFrame(recipe: SolidRecipe, view: ProjView): { minX: number; minY: number; w: number; h: number } {
  const b = recipeBounds(recipe);
  if (view === 'dessus') return { minX: b.min[0], minY: b.min[1], w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] };
  if (view === 'face') return { minX: b.min[0], minY: -b.max[2], w: b.max[0] - b.min[0], h: b.max[2] - b.min[2] };
  return { minX: -b.max[1], minY: -b.max[2], w: b.max[1] - b.min[1], h: b.max[2] - b.min[2] };
}

export type Seg = [number, number, number, number];
export interface PlacedView { frame: { x: number; y: number; w: number; h: number }; visible: Seg[]; hidden: Seg[]; state: 'prête' | 'calcul' | 'erreur'; error?: string }

/** Vue posée : son cadre en (o.x, o.y), ses arêtes si le noyau les a rendues. */
export function placedView(o: ProjectionObj, source: CadObject | undefined): PlacedView | null {
  if (source?.kind !== 'solid') return null;
  const f = viewFrame(source.recipe, o.view);
  const frame = { x: o.x, y: o.y, w: f.w, h: f.h };
  const entry = cachedProjection(source.recipe, o.view);
  if (!entry) return { frame, visible: [], hidden: [], state: 'calcul' };
  if ('error' in entry) return { frame, visible: [], hidden: [], state: 'erreur', error: entry.error };
  const dx = o.x - f.minX, dy = o.y - f.minY;
  const segs = (lines: number[][]) => lines.flatMap(l => {
    const out: Seg[] = [];
    for (let i = 0; i + 3 < l.length; i += 2) out.push([l[i] + dx, l[i + 1] + dy, l[i + 2] + dx, l[i + 3] + dy]);
    return out;
  });
  return { frame, visible: segs(entry.lines.visible), hidden: segs(entry.lines.hidden), state: 'prête' };
}

/** Représentation 2D (écran, PDF, DXF) : arêtes vues en continu, cachées en interrompu. */
export function projectionPrimitives(o: ProjectionObj, source: CadObject | undefined): PrimitiveObject[] {
  const v = placedView(o, source);
  if (!v) return [];
  const base = { ...o, kind: undefined, view: undefined, sourceId: undefined } as unknown as Omit<PrimitiveObject, 'kind'>;
  const line = (s: Seg, i: number, hidden: boolean) => ({ ...base, id: `${o.id}#${i}`, kind: 'line', x1: s[0], y1: s[1], x2: s[2], y2: s[3], hatch: 'none', ...(hidden ? { lineType: 'interrompu' } : {}) } as PrimitiveObject);
  return [...v.visible.map((s, i) => line(s, i, false)), ...v.hidden.map((s, i) => line(s, v.visible.length + i, true))];
}

/** Toutes les vues projetées du projet calculées (avant un export). */
export async function ensureProjections(objects: CadObject[], compute: (r: SolidRecipe, v: ProjView) => Promise<ProjLines>): Promise<void> {
  await Promise.all(objects.flatMap(o => {
    if (o.kind !== 'projection') return [];
    const s = objects.find(x => x.id === o.sourceId);
    return s?.kind === 'solid' ? [requestProjection(s.recipe, o.view, compute)] : [];
  }));
}

/** Placement par défaut de vues neuves à droite du solide, en ligne, séparées d'un cinquième de la plus grande. */
export function defaultPlacement(source: SolidObj, views: ProjView[]): { view: ProjView; x: number; y: number }[] {
  const b = recipeBounds(source.recipe);
  const frames = views.map(v => viewFrame(source.recipe, v));
  const gap = Math.max(...frames.map(f => Math.max(f.w, f.h)), 1) / 5;
  let x = b.max[0] + gap;
  return views.map((view, i) => { const at = { view, x, y: b.min[1] }; x += frames[i].w + gap; return at; });
}
