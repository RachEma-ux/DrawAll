import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 10.4 — décaler à distance saisie : polyligne avec onglet, côté désigné, propriétés conservées', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'polyline', points: [0, 0, 2000, 0, 2000, 1500], lineType: 'interrompu' },
    { id: 'OBJ-0002', kind: 'rect', x: -1000, y: -1000, w: 4500, h: 3500 },
  ]);
  await chooseTool(page, /^Décaler/);
  await page.getByLabel('Distance du décalage (mm)').fill('250');
  // L'objet, puis un point à l'intérieur du coude.
  await tapModel(page, info, 1000, 0);
  await tapModel(page, info, 1000, 600);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(3);
  const copy = (await currentObjects(page))[2];
  expect(copy).toMatchObject({ kind: 'polyline', points: [0, 250, 1750, 250, 1750, 1500], lineType: 'interrompu' });
  // Distance invalide : message, rien de créé.
  await page.getByLabel('Distance du décalage (mm)').fill('0');
  await tapModel(page, info, 1000, 0);
  await tapModel(page, info, 1000, 600);
  await expect(page.getByText('Distance de décalage invalide (nombre positif attendu).')).toBeVisible();
  expect(await currentObjects(page)).toHaveLength(3);
  expect(errors).toEqual([]);
});
