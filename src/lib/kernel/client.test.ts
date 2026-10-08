// Client du noyau (lot 11.2) : un Worker qui ne se charge pas ne laisse aucune demande en suspens.
import { afterEach, describe, expect, it, vi } from 'vitest';

class FailingWorker {
  static created = 0;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() { FailingWorker.created++; }
  postMessage() { setTimeout(() => this.onerror?.({ message: 'module introuvable', preventDefault() {} } as unknown as ErrorEvent), 0); }
  terminate() { this.terminated = true; }
}

describe('client du noyau 3D', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('échec de chargement du Worker : la demande est rejetée, le suivant recrée le Worker', async () => {
    vi.stubGlobal('Worker', FailingWorker);
    const { kernelVolume } = await import('./client');
    await expect(kernelVolume({ op: 'box', x: 1, y: 1, z: 1 })).rejects.toThrow('Noyau 3D indisponible : module introuvable');
    await expect(kernelVolume({ op: 'box', x: 1, y: 1, z: 1 })).rejects.toThrow('Noyau 3D indisponible');
    expect(FailingWorker.created).toBe(2);
  });
});
