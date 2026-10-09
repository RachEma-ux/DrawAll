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

test('lot 14.4 — publier pendant le calcul d’une vue projetée : le PDF figé attend la vue', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await openAtelier(page);
  // Noyau lent à charger : la vue projetée est encore en calcul quand on publie.
  await page.context().route('**/*.wasm', async route => { await new Promise(r => setTimeout(r, 5000)); await route.continue(); });
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'solid', recipe: { op: 'box', x: 1000, y: 600, z: 800 } },
    { id: 'OBJ-0002', kind: 'projection', sourceId: 'OBJ-0001', view: 'face', x: 2000, y: 0 },
  ]);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByRole('button', { name: 'Publier…' }).click();
  const publish = async (name: string) => {
    await page.getByLabel('Nom du dossier à publier').fill(name);
    await page.getByRole('button', { name: 'Publier la version courante' }).click();
  };
  const pdf = async (pub: string) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-publication="${pub}"]`).getByRole('button', { name: 'PDF publié de Feuille 1' }).click()]);
    return readFileSync((await dl.path())!).toString('latin1');
  };
  await publish('Pendant le calcul');
  await expect(page.locator('[data-publication="PUB-0001"]')).toBeVisible({ timeout: 60_000 });
  // Seconde publication, vue calculée depuis longtemps : mêmes arêtes que la première.
  await publish('Après le calcul');
  await expect(page.locator('[data-publication="PUB-0002"]')).toBeVisible({ timeout: 60_000 });
  const edges = (s: string) => s.split(' l S').length - 1;
  const [first, second] = [await pdf('PUB-0001'), await pdf('PUB-0002')];
  expect(edges(second)).toBeGreaterThan(0);
  expect(edges(first)).toBe(edges(second));
  expect(errors).toEqual([]);
});
