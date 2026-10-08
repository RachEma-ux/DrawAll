import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { chooseTool, loadObjects, openAtelier } from './helpers';

async function publishedPdf(page: Page): Promise<Buffer> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF publié de Feuille 1' }).click()]);
  return readFileSync((await dl.path())!);
}

test('lot 14.4 — dossier publié figé : état « modifié depuis », PDF publié inchangé', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 4000, h: 3000 }]);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByRole('button', { name: 'Publier…' }).click();
  await page.getByLabel('Nom du dossier à publier').fill('Permis de construire');
  await page.getByRole('button', { name: 'Publier la version courante' }).click();
  const pub = page.locator('[data-publication="PUB-0001"]');
  await expect(pub.locator('[data-etat-publication]')).toHaveText('publié');
  const before = await publishedPdf(page);
  expect(before.subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('button', { name: 'Fermer les publications' }).click();

  // Le projet évolue : un rectangle de plus.
  await page.getByRole('button', { name: 'Atelier', exact: true }).click();
  await chooseTool(page, /^Rect/);
  const point = page.getByLabel('Point précis');
  for (const entry of ['500;500', '1500;1500']) { await point.fill(entry); await point.press('Enter'); }

  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Publier…' }).click();
  await expect(pub.locator('[data-etat-publication]')).toHaveText('modifié depuis');
  const after = await publishedPdf(page);
  expect(after.equals(before)).toBe(true);
  expect(errors).toEqual([]);
});
