import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 8.1 — historique enregistré par différences ; annuler après rechargement', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Ligne/);
  const point = page.getByLabel('Point précis');
  for (const y of [0, 500, 1000]) for (const p of [`0;${y}`, `1000;${y}`]) { await point.fill(p); await point.press('Enter'); }
  await expect.poll(async () => (await currentObjects(page)).length).toBe(3);

  // Enregistrement : première et dernière versions entières, les autres par différences.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('drawall-projet-v1')!));
  expect(stored.versions).toHaveLength(4);
  expect(stored.versions[0].objects).toEqual([]);
  expect(stored.versions[1].delta.objects.set).toHaveLength(1);
  expect(stored.versions[1].objects).toBeUndefined();
  expect(stored.versions[3].objects).toHaveLength(3);

  // Rechargement : l'historique est reconstruit ; annuler revient aux versions précédentes.
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  expect(errors).toEqual([]);
});
