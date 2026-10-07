import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 3.1 — changer de profil change le motif, jamais le matériau', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 3000, h: 300 }]);
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 1500, 0);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  await page.getByLabel('Matériau').selectOption('beton');
  await expect.poll(async () => (await currentObjects(page))[0].materialId).toBe('beton');
  if (isPhone(info)) await page.keyboard.press('Escape'); // ferme le tiroir de l'inspecteur

  const motif = () => page.getByTestId('canvas').locator('path[data-hachure]').first().getAttribute('data-hachure');
  await expect.poll(motif).toBe('diagonal');   // profil neutre
  await page.getByLabel('Profil de dessin').selectOption('enseignement');
  await expect.poll(motif).toBe('cross');      // béton : croisillons dans ce profil
  const [wall] = await currentObjects(page);
  expect(wall).toMatchObject({ materialId: 'beton', hatch: 'none' });
  const profileId = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    return s.versions[s.pointer].profileId;
  });
  expect(profileId).toBe('enseignement');
  expect(errors).toEqual([]);
});

test('lot 3.1 — les hachures s’affichent aussi dans les fenêtres de feuille (motif au pas papier)', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 3000, h: 300, materialId: 'beton' }]);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  const vp = page.getByTestId('fenetre-FEN-0001');
  await expect(vp.locator('path[fill="url(#FEN-0001-h-OBJ-0001)"]')).toHaveCount(1);
  await expect(vp.locator('pattern#FEN-0001-h-OBJ-0001')).toHaveCount(1);
});
