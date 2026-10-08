import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 5.1 — cote tolérancée : classe ISO 286 puis ajustement H7/g6', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'inspecteur en colonne : recette bureau');
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'circle', cx: 0, cy: 0, r: 12.5, classification: 'mecanique' },
    { id: 'OBJ-0002', kind: 'dimension', targetId: 'OBJ-0001', style: 'radial', offset: 10, classification: 'mecanique' },
  ]);
  await page.getByRole('button', { name: /OBJ-0002/ }).first().click();
  await page.getByLabel('Tolérance de la cote').selectOption('classe');
  await expect(page.getByTestId('canvas').getByText('Ø 25 H7 (+0,021/0) mm')).toBeVisible();
  await expect(page.getByTestId('tolerance-iso')).toHaveText('Écarts +0,021 / 0 mm (IT7)');

  await page.getByLabel('Tolérance — Classe (H7, g6…)').fill('g6');
  await page.getByLabel('Tolérance — Classe (H7, g6…)').press('Enter');
  await expect(page.getByTestId('canvas').getByText('Ø 25 g6 (−0,007/−0,02) mm')).toBeVisible();

  await page.getByLabel('Tolérance de la cote').selectOption('ajustement');
  await expect(page.getByTestId('tolerance-iso')).toContainText('ajustement avec jeu : jeu de +0,007 à +0,041 mm');
  await page.getByLabel('Tolérance — Arbre (g6…)').fill('p6');
  await page.getByLabel('Tolérance — Arbre (g6…)').press('Enter');
  await expect(page.getByTestId('tolerance-iso')).toContainText('ajustement avec serrage');
  const dim = (await currentObjects(page)).find(o => o.id === 'OBJ-0002');
  expect(dim?.tolerance).toEqual({ kind: 'ajustement', hole: 'H7', shaft: 'p6' });
  expect(errors).toEqual([]);
});

test('lot 5.1 — état de surface posé avec sa rugosité', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 200, h: 100 }]);
  await chooseTool(page, /^Symbole/);
  const panel = page.getByRole('group', { name: 'Paramètres du symbole' });
  await panel.getByLabel('Type de symbole').selectOption('roughness');
  await panel.getByLabel('Rugosité Ra (µm)').fill('3,2');
  await tapModel(page, info, 150, 70);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  expect((await currentObjects(page))[1]).toMatchObject({ kind: 'roughness', ra: 3.2, process: 'enlevement', classification: 'mecanique' });
  await expect(page.getByTestId('canvas').locator('g[data-symbole="roughness"] text')).toHaveText('Ra 3,2');
});
