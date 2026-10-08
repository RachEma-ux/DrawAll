import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 13.4 — poteaux et poutres à sections saisies (aucun catalogue)', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: -1000, y: -1000, w: 8000, h: 4000 }]);
  const point = page.getByLabel('Point précis');
  const place = async (entry: string) => { await point.fill(entry); await point.press('Enter'); };

  // Poteau sans section saisie : refusé, la raison est donnée.
  await chooseTool(page, /^Poteau/);
  await place('1000;1000');
  await expect(page.getByText('Poteau : largeur et profondeur positives attendues.', { exact: false })).toBeVisible();
  expect((await currentObjects(page)).filter(o => o.kind === 'column')).toHaveLength(0);
  await page.getByLabel('Largeur du poteau (mm)').fill('300');
  await page.getByLabel('Profondeur du poteau (mm)').fill('400');
  await place('1000;1000');
  await page.getByLabel('Section du poteau').selectOption('circle');
  await page.getByLabel('Diamètre du poteau (mm)').fill('400');
  await page.getByLabel('Hauteur du poteau (mm)').fill('2700');
  await place('5000;1000');
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'column')).toMatchObject([
    { x: 1000, y: 1000, section: 'rect', b: 300, h: 400, classification: 'structure' },
    { x: 5000, y: 1000, section: 'circle', d: 400, height: 2700 },
  ]);

  // Poutre de 6 m, 200 × 500 : traits interrompus aux nus.
  await chooseTool(page, /^Poutre/);
  await page.getByLabel('Largeur de la poutre (mm)').fill('200');
  await page.getByLabel('Hauteur de la poutre (mm)').fill('500');
  await place('0;0');
  await place('6000;0');
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'beam')).toMatchObject([{ x1: 0, y1: 0, x2: 6000, y2: 0, b: 200, h: 500 }]);
  // Rendu : section pleine pour chaque poteau, quatre traits interrompus pour la poutre.
  await expect(page.locator('[data-structure]')).toHaveCount(3);
  expect(await page.locator('[data-structure] [stroke-dasharray]').count()).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});
