// Worker du noyau 3D (lot 11.2) : OCCT est chargé ici, hors du fil principal, au premier message.
// Le fichier WebAssembly est servi à part (licence LGPL : module séparé et remplaçable).
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { loadKernel } from './occt';
import type { KernelRequest, KernelResponse } from './client';

self.onmessage = async (e: MessageEvent<KernelRequest>) => {
  const { id } = e.data;
  try {
    const kernel = await loadKernel(() => wasmUrl);
    const d = e.data;
    const result = d.type === 'volume' ? kernel.volume(d.recipe) : d.type === 'mesh' ? kernel.mesh(d.recipe, d.tolerance)
      : d.type === 'project' ? kernel.project(d.recipe, d.view) : kernel.boundaryDeviation(d.recipe, d.points);
    (self as unknown as Worker).postMessage({ id, ok: true, result, loadMs: kernel.loadMs } satisfies KernelResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies KernelResponse);
  }
};
