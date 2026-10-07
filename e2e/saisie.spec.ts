import { expect, test } from '@playwright/test';
import { canvasPoint, chooseTool, currentObjects, isPhone, loadObjects, openAtelier, touch } from './helpers';

test('lot 1.7 — mur de 5 m puis 3 m à 90°, saisis en mètres', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await page.getByLabel('Unité d’affichage').selectOption('m');
  await chooseTool(page, /^Polyligne/);
  const point = page.getByLabel('Point précis');
  for (const entry of ['0;0', '@5<0', '@3<90']) {
    await point.fill(entry);
    await point.press('Enter');
  }
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  const [wall] = await currentObjects(page);
  expect(wall.kind).toBe('polyline');
  expect(wall.points).toEqual([0, 0, 5000, 0, 5000, -3000]);
  expect(errors).toEqual([]);
});

test('lot 1.7 — saisie relative sans point de départ : message clair', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Ligne/);
  const point = page.getByLabel('Point précis');
  await point.fill('@10;0');
  await point.press('Enter');
  await expect(page.getByRole('alert')).toContainText('point précédent');
});

test('lot 1.7 — la grille réglable commande l’accrochage', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, []);
  await page.getByLabel('Pas de grille').selectOption('50');
  await chooseTool(page, /^Ligne/);
  const from = await canvasPoint(page, 0.27, 0.62);
  const to = await canvasPoint(page, 0.71, 0.63);
  if (isPhone(info)) {
    await (await touch(page)).drag(from, to);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  const [line] = await currentObjects(page);
  for (const v of [line.x1, line.y1, line.x2, line.y2]) expect(Math.abs(Number(v) % 50)).toBe(0);
});

test('lot 1.7 — l’unité d’affichage ne change pas le modèle', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 1234, y2: 0 }]);
  await page.getByLabel('Unité d’affichage').selectOption('cm');
  await page.reload();
  await expect(page.getByLabel('Unité d’affichage')).toHaveValue('cm');
  const [line] = await currentObjects(page);
  expect(line.x2).toBe(1234);
});
