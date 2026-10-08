import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 14.2 — comparer deux variantes en surimpression, trancher un conflit, fusionner', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 },
    { id: 'OBJ-0002', kind: 'rect', x: -500, y: -1500, w: 6000, h: 4000 },
  ]);
  const history = async () => { if (isPhone(info)) await page.getByRole('button', { name: /^Historique/ }).click(); };
  const inspector = async () => { if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click(); };
  const close = async () => { if (isPhone(info)) await page.keyboard.press('Escape'); };
  const point = page.getByLabel('Point précis');
  const lineType = async (value: string) => {
    await chooseTool(page, /^Sélection/);
    await tapModel(page, info, 2000, 0);
    await inspector();
    await page.getByLabel('Type de trait — objet').selectOption(value);
    await close();
  };

  // Variante B : un cercle ajouté, la ligne passée en interrompu.
  await history();
  await page.getByLabel('Nom de la nouvelle variante').fill('B');
  await page.getByRole('button', { name: 'Créer la variante' }).click();
  await close();
  await chooseTool(page, /^Cercle/);
  for (const entry of ['1000;1000', '1300;1000']) { await point.fill(entry); await point.press('Enter'); }
  await lineType('interrompu');

  // Principale : la même ligne passée en mixte (conflit).
  await history();
  await page.getByLabel('Variante active').selectOption('BR-0000');
  await close();
  await lineType('mixte');

  await history();
  await page.getByRole('button', { name: 'Comparer et fusionner…' }).click();
  await expect(page.getByTestId('fusion-differences')).toContainText('« B » : 1 ajouté(s), 1 modifié(s), 0 supprimé(s)');
  await page.getByRole('button', { name: /^Montrer les changements de « B »/ }).click();
  await expect(page.locator('[data-surimpression="ajouté"]')).toHaveCount(1);
  await expect(page.locator('[data-surimpression="modifié"]')).toHaveCount(1);
  const merge = page.getByRole('button', { name: 'Fusionner « B » dans « Principale »' });
  await expect(merge).toBeDisabled();
  await page.locator('[data-conflit="objects:OBJ-0001"]').getByLabel('garder « B »').check();
  await merge.click();

  // Résultat : le cercle de B est repris, le conflit tranché pour B.
  await expect.poll(async () => (await currentObjects(page)).map(o => [o.kind, o.lineType ?? null])).toEqual([['line', 'interrompu'], ['rect', null], ['circle', null]]);
  await expect(page.locator('[data-surimpression]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
