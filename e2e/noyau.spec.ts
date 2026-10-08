import { expect, test } from '@playwright/test';
import { openAtelier } from './helpers';

test('lot 11.2 — noyau 3D OCCT chargé à la demande dans un Worker, volume de référence exact', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  test.setTimeout(120_000);
  const errors = await openAtelier(page);
  // Rien n'est téléchargé tant que le noyau n'est pas demandé.
  const wasm: string[] = [];
  page.on('request', r => { if (r.url().endsWith('.wasm')) wasm.push(r.url()); });
  await page.waitForTimeout(500);
  expect(wasm).toEqual([]);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('noyau 3d');
  await page.getByText('Essai du noyau 3D (P0)').click();
  const status = page.getByTestId('noyau-3d');
  await expect(status).toBeVisible({ timeout: 90_000 });
  const volume = Number(await status.getAttribute('data-volume'));
  const loadMs = Number(await status.getAttribute('data-chargement'));
  expect(Math.abs(volume - (100000 - Math.PI * 100 * 20)) / volume).toBeLessThan(1e-9);
  expect(wasm).toHaveLength(1);
  console.log(`noyau 3D : module chargé en ${loadMs} ms`);
  expect(errors).toEqual([]);
});
