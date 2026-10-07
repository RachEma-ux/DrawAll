import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 1.10 — aire et périmètre par points (contour concave, en mètres)', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await page.getByLabel('Unité d’affichage').selectOption('m');
  await chooseTool(page, /^Aire/);
  const point = page.getByLabel('Point précis');
  for (const entry of ['0;0', '@3;0', '@0;1', '@-2;0', '@0;2', '@-1;0']) {
    await point.fill(entry);
    await point.press('Enter');
  }
  await page.getByRole('button', { name: 'Terminer' }).click();
  const result = page.getByRole('region', { name: 'Résultat de l’aire' });
  await expect(result).toContainText('Aire 5 m²');
  await expect(result).toContainText('Périmètre 12 m');
  // Mesurer ne crée aucun objet.
  expect(await currentObjects(page)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('lot 1.10 — l’inspecteur donne l’aire et le périmètre d’un contour fermé', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 4000, h: 2500 }]);
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 2000, 0);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  const measures = page.getByRole('definition').filter({ hasText: 'mm²' });
  await expect(measures).toHaveText('10 000 000 mm²');
  await expect(page.getByText('13 000 mm', { exact: true })).toBeVisible();
});
