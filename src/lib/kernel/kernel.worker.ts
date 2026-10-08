// Worker du noyau 3D (lot 11.2) : OCCT est chargé ici, hors du fil principal, au premier message.
// Le fichier WebAssembly est servi à part (licence LGPL : module séparé et remplaçable).
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import { loadKernel } from './occt';
import type { KernelRequest, KernelResponse } from './client';

self.onmessage = async (e: MessageEvent<KernelRequest>) => {
  const { id } = e.data;
  try {
    const kernel = await loadKernel(() => wasmUrl);
    const result = e.data.type === 'volume' ? kernel.volume(e.data.recipe) : kernel.mesh(e.data.recipe, e.data.tolerance);
    (self as unknown as Worker).postMessage({ id, ok: true, result, loadMs: kernel.loadMs } satisfies KernelResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies KernelResponse);
  }
};
