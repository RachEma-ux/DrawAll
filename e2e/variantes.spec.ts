import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier } from './helpers';

test('lot 14.1 — variante créée depuis une version, bascule, historique par branche, conservée au rechargement', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const history = async () => { if (isPhone(info)) await page.getByRole('button', { name: /^Historique/ }).click(); };
  const close = async () => { if (isPhone(info)) await page.keyboard.press('Escape'); };

  await history();
  await expect(page.getByLabel('Variante active')).toHaveValue('BR-0000');
  await page.getByLabel('Nom de la nouvelle variante').fill('Variante B');
  await page.getByRole('button', { name: 'Créer la variante' }).click();
  await expect(page.getByLabel('Variante active')).toHaveValue('BR-0001');
  await close();

  // Dans la variante : un rectangle de plus.
  await chooseTool(page, /^Rect/);
  const point = page.getByLabel('Point précis');
  for (const entry of ['0;500', '2000;1500']) { await point.fill(entry); await point.press('Enter'); }
  await expect.poll(async () => (await currentObjects(page)).map(o => o.kind)).toEqual(['line', 'rect']);

  // Retour à la principale : le rectangle n'y est pas ; puis de nouveau la variante.
  await history();
  await page.getByLabel('Variante active').selectOption('BR-0000');
  await expect.poll(async () => (await currentObjects(page)).map(o => o.kind)).toEqual(['line']);
  await page.getByLabel('Variante active').selectOption('BR-0001');
  await expect.poll(async () => (await currentObjects(page)).map(o => o.kind)).toEqual(['line', 'rect']);
  await close();

  // Rechargement : variantes et position conservées.
  await page.reload();
  await expect.poll(async () => (await currentObjects(page)).map(o => o.kind)).toEqual(['line', 'rect']);
  await history();
  await expect(page.getByLabel('Variante active')).toHaveValue('BR-0001');
  await expect(page.getByLabel('Variante active').locator('option')).toHaveText([/^Variante B/, /^Principale/]);
  expect(errors).toEqual([]);
});
