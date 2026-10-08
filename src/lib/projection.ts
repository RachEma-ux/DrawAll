// Vues projetées (lot 16.1) : dessus, face et côté d'un solide, calculées par le noyau (élimination
// des arêtes cachées, HLR d'OCCT) et associées à leur solide. Le résultat est mis en cache par
// recette et par vue : modifier le solide change la clé, la vue est recalculée. Le cadre de la vue
// se déduit de l'encombrement de la recette, sans attendre le noyau.
import type { CadObject, ElevationObj, ElevationView, Level, PrimitiveObject, ProjectionObj, SectionMarkObj, SolidObj } from '@/types/cad';
import { cameraLooking, type Camera, type Clip, type ProjLines, type ProjView, type SolidRecipe } from './kernel/recipe';
import { buildingRecipe } from './building3d';
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
  return requestKey(projectionKey(recipe, view), () => compute(recipe, view));
}

function requestKey(key: string, compute: () => Promise<ProjLines>): Promise<void> {
  if (cache.has(key) || pending.has(key)) return Promise.resolve();
  pending.add(key);
  return compute().then(lines => { cache.set(key, { lines }); }, e => { cache.set(key, { error: e instanceof Error ? e.message : String(e) }); })
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

export type CameraCompute = (r: SolidRecipe, camera: Camera, clip?: Clip) => Promise<ProjLines>;

/** Toutes les vues projetées, façades et coupes du projet calculées (avant un export). */
export async function ensureProjections(objects: CadObject[], compute: (r: SolidRecipe, v: ProjView) => Promise<ProjLines>, computeCamera?: CameraCompute): Promise<void> {
  await Promise.all(objects.flatMap(o => {
    if (o.kind === 'elevation' && computeCamera) {
      const set = elevationSetup(o, objects);
      return 'error' in set ? [] : [requestKey(set.key, () => computeCamera(set.recipe, set.camera, set.clip))];
    }
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

// ——— Façades et coupes de bâtiment (lot 16.2) ———

/** Niveaux du projet pour les hauteurs d'étage (fixés par l'application à chaque rendu). */
let currentLevels: Level[] | undefined;
export function setProjectionLevels(levels: Level[] | undefined) { currentLevels = levels; }

export const ELEVATION_LABEL: Record<Exclude<ElevationView, 'coupe'>, string> = { nord: 'Façade nord', sud: 'Façade sud', est: 'Façade est', ouest: 'Façade ouest' };
/** Sens du regard (plan, Y vers le bas : le nord en haut) : la façade sud se regarde depuis le sud. */
const LOOK: Record<Exclude<ElevationView, 'coupe'>, [number, number]> = { sud: [0, -1], nord: [0, 1], est: [-1, 0], ouest: [1, 0] };

export const elevationLabel = (o: ElevationObj, objects: CadObject[]) => {
  if (o.view !== 'coupe') return ELEVATION_LABEL[o.view];
  const m = objects.find(x => x.id === o.markId);
  return `Coupe ${m?.kind === 'section' ? `${m.label || 'A'}–${m.label || 'A'}` : '(repère absent)'}`;
};

/** Caméra, coupe éventuelle et recette du bâtiment d'une façade, ou la raison de son absence. */
export function elevationSetup(o: ElevationObj, objects: CadObject[]): { recipe: SolidRecipe; camera: Camera; clip?: Clip; key: string } | { error: string } {
  const { recipe } = buildingRecipe(objects.filter(x => x.kind !== 'elevation'), currentLevels);
  if (!recipe) return { error: 'aucun élément en volume (murs, dalles, toitures… ou solides)' };
  let look: [number, number], clip: Clip | undefined;
  if (o.view === 'coupe') {
    const m = objects.find(x => x.id === o.markId) as SectionMarkObj | undefined;
    if (m?.kind !== 'section') return { error: `repère de coupe ${o.markId ?? ''} absent` };
    const dx = m.x2 - m.x1, dy = m.y2 - m.y1, L = Math.hypot(dx, dy);
    if (!(L > 0)) return { error: 'repère de coupe de longueur nulle' };
    // Sens de la vue : à gauche du trait parcouru (Y vers le bas), à droite si « inverser » (§4.5).
    const side = m.flip ? -1 : 1;
    look = [(dy / L) * side, (-dx / L) * side];
    clip = { point: [m.x1, m.y1], look };
  } else look = LOOK[o.view];
  const camera = cameraLooking(look);
  return { recipe, camera, ...(clip ? { clip } : {}), key: `elev|${JSON.stringify(camera)}|${JSON.stringify(clip ?? null)}|${JSON.stringify(recipe)}` };
}

/** Cadre de la vue : encombrement du bâtiment projeté sur les axes de la caméra (x à droite, −Z). */
function cameraFrame(recipe: SolidRecipe, camera: Camera) {
  const b = recipeBounds(recipe);
  const xs: number[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) xs.push(x * camera.xAxis[0] + y * camera.xAxis[1]);
  const minX = Math.min(...xs);
  return { minX, minY: -b.max[2], w: Math.max(...xs) - minX, h: b.max[2] - b.min[2] };
}

export function placedElevation(o: ElevationObj, objects: CadObject[]): PlacedView | null {
  const set = elevationSetup(o, objects);
  if ('error' in set) return { frame: { x: o.x, y: o.y, w: 0, h: 0 }, visible: [], hidden: [], state: 'erreur', error: set.error };
  const f = cameraFrame(set.recipe, set.camera);
  const frame = { x: o.x, y: o.y, w: f.w, h: f.h };
  const entry = cache.get(set.key);
  if (!entry) return { frame, visible: [], hidden: [], state: 'calcul' };
  if ('error' in entry) return { frame, visible: [], hidden: [], state: 'erreur', error: entry.error };
  const dx = o.x - f.minX, dy = o.y - f.minY;
  // Façades et coupes : arêtes vues seulement (usage du dessin de bâtiment).
  const visible = entry.lines.visible.flatMap(l => {
    const out: Seg[] = [];
    for (let i = 0; i + 3 < l.length; i += 2) out.push([l[i] + dx, l[i + 1] + dy, l[i + 2] + dx, l[i + 3] + dy]);
    return out;
  });
  return { frame, visible, hidden: [], state: 'prête' };
}

/** Vue posée d'une vue projetée, d'une façade ou d'une coupe. */
export function placedAny(o: ProjectionObj | ElevationObj, objects: CadObject[]): PlacedView | null {
  return o.kind === 'projection' ? placedView(o, objects.find(x => x.id === o.sourceId)) : placedElevation(o, objects);
}

export function viewPrimitives(o: ProjectionObj | ElevationObj, objects: CadObject[]): PrimitiveObject[] {
  if (o.kind === 'projection') return projectionPrimitives(o, objects.find(x => x.id === o.sourceId));
  const v = placedElevation(o, objects);
  if (!v) return [];
  const base = { ...o, kind: undefined, view: undefined, markId: undefined } as unknown as Omit<PrimitiveObject, 'kind'>;
  return v.visible.map((s, i) => ({ ...base, id: `${o.id}#${i}`, kind: 'line', x1: s[0], y1: s[1], x2: s[2], y2: s[3], hatch: 'none' } as PrimitiveObject));
}

/** Façades et coupes neuves posées sous le bâtiment, en ligne. */
export function elevationPlacement(objects: CadObject[], views: { view: ElevationView; markId?: string }[]): { view: ElevationView; markId?: string; x: number; y: number }[] {
  const { recipe } = buildingRecipe(objects.filter(x => x.kind !== 'elevation'), currentLevels);
  if (!recipe) return [];
  const b = recipeBounds(recipe);
  const frames = views.map(v => {
    const s = elevationSetup({ kind: 'elevation', id: '', name: '', classification: 'architecture', layerId: '', hatch: 'none', createdSeq: 0, x: 0, y: 0, ...v }, objects);
    return 'error' in s ? null : cameraFrame(s.recipe, s.camera);
  });
  const gap = Math.max(...frames.map(f => (f ? Math.max(f.w, f.h) : 0)), 1) / 5;
  let x = b.min[0];
  const y = b.max[1] + gap;
  return views.flatMap((v, i) => {
    const f = frames[i];
    if (!f) return [];
    const at = { ...v, x, y };
    x += f.w + gap;
    return [at];
  });
}

