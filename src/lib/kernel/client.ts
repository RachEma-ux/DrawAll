// Accès au noyau 3D depuis l'interface (lot 11.2) : le Worker n'est créé qu'au premier appel.
import type { Camera, Clip, MeshResult, ProjLines, ProjView, SolidRecipe, Vec3 } from './recipe';
import type { StepImportReport } from './occt';

export type KernelRequest =
  | { id: number; type: 'volume'; recipe: SolidRecipe }
  | { id: number; type: 'mesh'; recipe: SolidRecipe; tolerance?: number }
  | { id: number; type: 'deviation'; recipe: SolidRecipe; points: Vec3[] }
  | { id: number; type: 'project'; recipe: SolidRecipe; view: ProjView }
  | { id: number; type: 'projectCamera'; recipe: SolidRecipe; camera: Camera; clip?: Clip }
  | { id: number; type: 'exportStep'; parts: { name: string; recipe: SolidRecipe }[]; fileName: string; date: string }
  | { id: number; type: 'importStep'; text: string };
export type KernelResponse =
  | { id: number; ok: true; result: number | MeshResult | ProjLines | { content: string } | { error: string } | StepImportReport; loadMs: number }
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

/** Vue projetée d'un solide (lot 16.1). */
export async function kernelProject(recipe: SolidRecipe, view: ProjView): Promise<ProjLines> {
  const r = await call({ type: 'project', recipe, view });
  if (!r.ok) throw new Error(r.error);
  return r.result as ProjLines;
}

/** Façade ou coupe : projection par une caméra, après coupe éventuelle (lot 16.2). */
export async function kernelProjectCamera(recipe: SolidRecipe, camera: Camera, clip?: Clip): Promise<ProjLines> {
  const r = await call({ type: 'projectCamera', recipe, camera, ...(clip ? { clip } : {}) });
  if (!r.ok) throw new Error(r.error);
  return r.result as ProjLines;
}

/** Export STEP AP242 édition 3 de solides nommés (lot 17.2). */
export async function kernelExportStep(parts: { name: string; recipe: SolidRecipe }[], fileName: string, date: Date): Promise<string> {
  const r = await call({ type: 'exportStep', parts, fileName, date: date.toISOString() });
  if (!r.ok) throw new Error(r.error);
  const out = r.result as { content: string } | { error: string };
  if ('error' in out) throw new Error(`Export STEP refusé : ${out.error}.`);
  return out.content;
}

/** Import STEP : compte rendu et, pour chaque solide transféré, sa recette (lot 17.2). */
export async function kernelImportStep(text: string): Promise<StepImportReport> {
  const r = await call({ type: 'importStep', text });
  if (!r.ok) throw new Error(r.error);
  return r.result as StepImportReport;
}
