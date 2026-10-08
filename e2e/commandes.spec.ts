import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 18.1 — toute opération passe par une commande journalisée ; rejouer le journal reproduit le projet', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const point = page.getByLabel('Point précis');
  const place = async (entry: string) => { await point.fill(entry); await point.press('Enter'); };
  // Interface : un rectangle, un mur, puis un déplacement au clavier et un calque.
  await chooseTool(page, /^Rect/);
  await place('0;1000'); await place('2000;2500');
  await chooseTool(page, /^Mur/);
  await place('0;3000'); await place('3000;3000');
  await page.keyboard.press('Escape');
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 2000, 0);
  await page.keyboard.press('Shift+ArrowRight');
  // Palette : une nomenclature de murs.
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('tableau des murs');
  await page.getByText('Insérer le tableau des murs').click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(4);
  const before = await currentObjects(page);

  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('journal');
  await page.getByText('Journal des commandes', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Journal des commandes' });
  const n = Number(await panel.getAttribute('data-commandes'));
  expect(n).toBeGreaterThanOrEqual(4);
  await expect(panel).toContainText('addObject');
  await expect(panel).toContainText('transform');
  await panel.getByRole('button', { name: 'Rejouer le journal (vérification)' }).click();
  await expect(panel.getByTestId('rejeu')).toHaveAttribute('data-identique', 'true', { timeout: 30_000 });
  await expect(panel.getByTestId('rejeu')).toContainText('projet reproduit à l’identique');
  expect(await currentObjects(page)).toEqual(before);
  // Le journal rejoué est de nouveau complet.
  await expect(panel).toHaveAttribute('data-commandes', String(n));
  expect(errors).toEqual([]);
});
