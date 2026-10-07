import { expect, test, type Page } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

async function typePoints(page: Page, entries: string[]) {
  const point = page.getByLabel('Point précis');
  for (const e of entries) { await point.fill(e); await point.press('Enter'); }
}

test('lot 2.6 — cote en série par points', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Cote par points/);
  await page.getByLabel('Décalage de la cote (mm)').fill('400');
  await typePoints(page, ['0;0', '1200;0', '3000;0']);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  const [d] = await currentObjects(page);
  expect(d).toMatchObject({ kind: 'pdim', mode: 'chain', axis: 'horizontal', points: [0, 0, 1200, 0, 3000, 0], offset: 400 });
  await expect(page.getByTestId('canvas').locator('[data-pdim="chain"] text')).toHaveText(['1 200', '1 800'].map(v => v.replace(' ', ' ')));
  expect(errors).toEqual([]);
});

test('lot 2.6 — cote angulaire (3 points) et cote de niveau (1 point)', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Cote par points/);
  await page.getByLabel('Type de cote').selectOption('angular');
  await page.getByLabel('Décalage de la cote (mm)').fill('50');
  await typePoints(page, ['0;0', '100;0', '0;-100']);
  await expect(page.getByTestId('canvas').locator('[data-pdim="angular"] text')).toHaveText('90°');

  await page.getByLabel('Type de cote').selectOption('level');
  await page.getByLabel('Y du niveau ±0,00 (mm)').fill('0');
  await typePoints(page, ['200;-2500']);
  await expect(page.getByTestId('canvas').locator('[data-pdim="level"] text')).toHaveText('+2,50');
  expect((await currentObjects(page)).map(o => o.mode)).toEqual(['angular', 'level']);
});

test('lot 2.6 — une cote par points prend la couleur de son calque', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'pdim', mode: 'chain', axis: 'horizontal', points: [0, 0, 1000, 0], offset: 300, layerId: 'LAY-0002' }]);
  const color = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    return s.versions[s.pointer].layers.find((l: { id: string }) => l.id === 'LAY-0002').color;
  });
  const stroke = await page.getByTestId('canvas').locator('g[data-pdim] line').first().getAttribute('stroke');
  expect(stroke?.toLowerCase()).toBe(color.toLowerCase());
});
