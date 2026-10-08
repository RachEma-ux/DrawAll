import { expect, test } from '@playwright/test';
import { chooseTool, loadObjects, openAtelier, tapModel } from './helpers';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe', classification: 'architecture' });

test('lot 13.5 — tableau des murs calculé depuis le modèle : modifier un mur met le tableau à jour', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [wall('OBJ-0001', 0, 0, 5000, 0), wall('OBJ-0002', 5000, 0, 5000, 4000), wall('OBJ-0003', 5000, 4000, 0, 4000), wall('OBJ-0004', 0, 4000, 0, 0)]);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('tableau des murs');
  await page.getByText('Insérer le tableau des murs').click();
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('text', { hasText: 'Longueur (m)' })).toHaveCount(1);
  // 5 + 4 + 5 + 4 = 18,00 m.
  await expect(canvas.locator('text', { hasText: /^18,00$/ })).toHaveCount(1);
  await expect(canvas.locator('text', { hasText: /^250$/ })).toHaveCount(0);

  // Le mur du bas passe à 250 mm d'épaisseur : le tableau suit.
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 2500, 0);
  await page.getByLabel('Épaisseur du mur').fill('250');
  await page.getByLabel('Épaisseur du mur').press('Enter');
  await expect(canvas.locator('text', { hasText: /^250$/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});
