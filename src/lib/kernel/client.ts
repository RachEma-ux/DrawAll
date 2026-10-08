// Accès au noyau 3D depuis l'interface (lot 11.2) : le Worker n'est créé qu'au premier appel.
import type { MeshResult, SolidRecipe } from './recipe';

export type KernelRequest =
  | { id: number; type: 'volume'; recipe: SolidRecipe }
  | { id: number; type: 'mesh'; recipe: SolidRecipe; tolerance?: number };
export type KernelResponse =
  | { id: number; ok: true; result: number | MeshResult; loadMs: number }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, { resolve: (r: KernelResponse) => void }>();

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function call(req: WithoutId<KernelRequest>): Promise<KernelResponse> {
  if (!worker) {
    worker = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<KernelResponse>) => { pending.get(e.data.id)?.resolve(e.data); pending.delete(e.data.id); };
  }
  const id = next++;
  return new Promise(resolve => { pending.set(id, { resolve }); worker!.postMessage({ ...req, id }); });
}

export async function kernelVolume(recipe: SolidRecipe): Promise<{ volume: number; loadMs: number }> {
  const r = await call({ type: 'volume', recipe });
  if (!r.ok) throw new Error(r.error);
  return { volume: r.result as number, loadMs: r.loadMs };
}

export async function kernelMesh(recipe: SolidRecipe, tolerance?: number): Promise<{ mesh: MeshResult; loadMs: number }> {
  const r = await call({ type: 'mesh', recipe, tolerance });
  if (!r.ok) throw new Error(r.error);
  return { mesh: r.result as MeshResult, loadMs: r.loadMs };
}
