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

test('lot 18.1 — rejeu du journal : un dossier publié est repris figé, jamais refait', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 4000, h: 3000 }]);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByRole('button', { name: 'Publier…' }).click();
  // Une tentative refusée (nom vide) d'abord : elle ne doit pas prendre le dossier figé de la suivante.
  await page.getByRole('button', { name: 'Publier la version courante' }).click();
  await expect(page.getByTestId('publication-erreur')).toBeVisible();
  await page.getByLabel('Nom du dossier à publier').fill('Permis');
  await page.getByRole('button', { name: 'Publier la version courante' }).click();
  await expect(page.locator('[data-publication="PUB-0001"]')).toBeVisible();
  const pubs = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('drawall-projet-v1') ?? '{}').publications ?? []));
  await expect.poll(async () => (await pubs()).length).toBeGreaterThan(2);
  const published = await pubs();
  await page.getByRole('button', { name: 'Fermer les publications' }).click();
  // Le rejeu se fait plus tard : une date différente ne doit rien changer au dossier figé.
  await page.waitForTimeout(1100);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('journal');
  await page.getByText('Journal des commandes', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Journal des commandes' });
  await panel.getByRole('button', { name: 'Rejouer le journal (vérification)' }).click();
  await expect(panel.getByTestId('rejeu')).toHaveAttribute('data-identique', 'true', { timeout: 30_000 });
  await expect.poll(pubs).toBe(published);
  expect(errors).toEqual([]);
});

test('lot 18.1 — rejeu du journal : une note garde sa date, le projet est reproduit à l’identique', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 4000, h: 3000 }]);
  await chooseTool(page, /^Note/);
  page.once('dialog', d => d.accept('Regard'));
  await tapModel(page, info, 2000, 1500);
  await expect.poll(async () => (await currentObjects(page)).find(o => o.kind === 'note')).toMatchObject({ text: 'Regard' });
  const before = await currentObjects(page);
  // Le rejeu a lieu plus tard : une date refaite à l'exécution différerait.
  await page.waitForTimeout(50);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('journal');
  await page.getByText('Journal des commandes', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Journal des commandes' });
  await expect(panel).toContainText('addNote');
  await panel.getByRole('button', { name: 'Rejouer le journal (vérification)' }).click();
  await expect(panel.getByTestId('rejeu')).toHaveAttribute('data-identique', 'true', { timeout: 30_000 });
  expect(await currentObjects(page)).toEqual(before);
  expect(errors).toEqual([]);
});


test('relecture 49e passe — une commande refusée à l’exécution est marquée refusée au journal', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'room', x: 1500, y: 2000, name: 'Séjour' }]);
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 1500, 2000);
  await page.getByRole('button', { name: 'Gérer les zones…' }).click();
  // Nom vide : la zone est refusée par la commande elle-même.
  await page.getByRole('button', { name: 'Créer la zone' }).click();
  await page.getByRole('button', { name: 'Fermer les zones' }).click();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('journal');
  await page.getByText('Journal des commandes', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Journal des commandes' });
  await expect(panel).toContainText('addZone — refusée : Nom de zone attendu.');
  expect(errors).toEqual([]);
});
