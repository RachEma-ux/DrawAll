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

test('lot 5.4 — le repère suit la pièce convertie en bloc, et part avec la définition du bloc', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'inspecteur en colonne : recette bureau');
  await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, part: 'Platine', classification: 'mecanique' },
    { id: 'OBJ-0002', kind: 'balloon', targetId: 'OBJ-0001', x: 150, y: -40, classification: 'mecanique' },
  ]);
  await page.getByRole('button', { name: /OBJ-0001/ }).first().click();
  await page.getByRole('button', { name: 'Convertir en bloc réutilisable' }).click();
  await expect.poll(async () => (await currentObjects(page)).find(o => o.kind === 'blockRef')).toBeTruthy();
  const ref = (await currentObjects(page)).find(o => o.kind === 'blockRef')!;
  expect((await currentObjects(page)).find(o => o.kind === 'balloon')).toMatchObject({ targetId: ref.id });
  await expect(page.getByTestId('canvas').locator('g[data-symbole="balloon"] text')).toHaveText('1');

  // Supprimer la définition du bloc : l'occurrence et son repère partent ensemble.
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: `Supprimer le bloc ${ref.blockId}` }).click();
  await expect.poll(async () => (await currentObjects(page)).map(o => o.kind)).toEqual([]);
});

test('lot 5.4 — cadrer tout montre le tableau de nomenclature entier', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, part: 'Platine', classification: 'mecanique' },
    { id: 'OBJ-0002', kind: 'bom', x: 100, y: 80, classification: 'mecanique' },
  ]);
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const table = (await page.getByTestId('canvas').locator('g[data-symbole="bom"]').boundingBox())!;
  // Le tableau garde sa taille papier à l'écran : il tient entier dès que la zone est assez large
  // (sur téléphone, il est plus large que l'écran : son début reste visible).
  expect(table.x).toBeGreaterThanOrEqual(canvas.x);
  if (table.width <= canvas.width) expect(table.x + table.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  if (table.height <= canvas.height) expect(table.y + table.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
});
