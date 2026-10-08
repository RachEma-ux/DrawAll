// Accès au noyau 3D depuis l'interface (lot 11.2) : le Worker n'est créé qu'au premier appel.
import type { MeshResult, SolidRecipe, Vec3 } from './recipe';

export type KernelRequest =
  | { id: number; type: 'volume'; recipe: SolidRecipe }
  | { id: number; type: 'mesh'; recipe: SolidRecipe; tolerance?: number }
  | { id: number; type: 'deviation'; recipe: SolidRecipe; points: Vec3[] };
export type KernelResponse =
  | { id: number; ok: true; result: number | MeshResult; loadMs: number }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, { resolve: (r: KernelResponse) => void }>();

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function call(req: WithoutId<KernelRequest>): Promise<KernelResponse> {
  if (!worker) {
    const w = new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<KernelResponse>) => { pending.get(e.data.id)?.resolve(e.data); pending.delete(e.data.id); };
    // Worker qui ne se charge pas (module introuvable hors ligne, politique de sécurité) ou qui
    // s'arrête : chaque demande en attente reçoit une erreur, et le prochain appel recrée le Worker.
    const fail = (why: string) => {
      w.terminate();
      if (worker === w) worker = null;
      for (const [id, p] of pending) p.resolve({ id, ok: false, error: `Noyau 3D indisponible : ${why}` });
      pending.clear();
    };
    w.onerror = e => { e.preventDefault?.(); fail(e.message || 'le module du noyau n’a pas pu être chargé'); };
    w.onmessageerror = () => fail('message illisible');
    worker = w;
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

/** Plus grand écart (mm) entre des points et le bord du solide (lot 15.4). */
export async function kernelDeviation(recipe: SolidRecipe, points: Vec3[]): Promise<number> {
  const r = await call({ type: 'deviation', recipe, points });
  if (!r.ok) throw new Error(r.error);
  return r.result as number;
}
