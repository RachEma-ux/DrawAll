import { expect, test } from '@playwright/test';
import { currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 5.4 — ajouter une pièce met à jour la nomenclature ; repère numéroté', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'inspecteur en colonne : recette bureau');
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, part: 'Platine', materialId: 'acier', classification: 'mecanique' },
    { id: 'OBJ-0002', kind: 'circle', cx: 140, cy: 30, r: 12, classification: 'mecanique' },
  ]);
  // La platine est une pièce : repère 1 ; insérer la nomenclature.
  await page.getByRole('button', { name: /OBJ-0001/ }).first().click();
  await expect(page.getByTestId('repere-piece')).toHaveText('Repère 1 · quantité 1');
  await page.getByRole('button', { name: 'Insérer la nomenclature' }).click();
  const table = page.getByTestId('canvas').locator('g[data-symbole="bom"] text');
  await expect(table).toHaveText(['Rep.', 'Désignation', 'Matériau', 'Qté', '1', 'Platine', 'Acier', '1']);

  // Ajouter une pièce : le cercle devient « Rondelle » ; la nomenclature gagne une ligne.
  await page.getByRole('button', { name: /OBJ-0002/ }).first().click();
  const designation = page.getByLabel('Désignation de pièce');
  await designation.fill('Rondelle');
  await designation.press('Enter');
  await expect(table).toHaveText(['Rep.', 'Désignation', 'Matériau', 'Qté', '1', 'Platine', 'Acier', '1', '2', 'Rondelle', '—', '1']);

  // Repère de la rondelle : bulle numérotée 2.
  await page.getByRole('button', { name: 'Ajouter un repère' }).click();
  await expect.poll(async () => (await currentObjects(page)).find(o => o.kind === 'balloon')).toMatchObject({ targetId: 'OBJ-0002' });
  await expect(page.getByTestId('canvas').locator('g[data-symbole="balloon"] text')).toHaveText('2');
  expect(errors).toEqual([]);
});
