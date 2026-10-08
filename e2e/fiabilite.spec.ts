import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 8.1 — historique enregistré par différences ; annuler après rechargement', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Ligne/);
  const point = page.getByLabel('Point précis');
  for (const y of [0, 500, 1000]) for (const p of [`0;${y}`, `1000;${y}`]) { await point.fill(p); await point.press('Enter'); }
  await expect.poll(async () => (await currentObjects(page)).length).toBe(3);

  // Enregistrement : première et dernière versions entières, les autres par différences.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('drawall-projet-v1')!));
  expect(stored.versions).toHaveLength(4);
  expect(stored.versions[0].objects).toEqual([]);
  expect(stored.versions[1].delta.objects.set).toHaveLength(1);
  expect(stored.versions[1].objects).toBeUndefined();
  expect(stored.versions[3].objects).toHaveLength(3);

  // Rechargement : l'historique est reconstruit ; annuler revient aux versions précédentes.
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  expect(errors).toEqual([]);
});

test('lot 8.2 — paquet natif : exporter, restaurer, réexporter à l’identique', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier : recette bureau');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' }]);
  // Une modification de plus (historique), une feuille.
  await chooseTool(page, /^Ligne/);
  const point = page.getByLabel('Point précis');
  for (const p of ['0;1000', '5000;1000']) { await point.fill(p); await point.press('Enter'); }
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Atelier', exact: true }).click();

  const exportPackage = async () => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/Rechercher un outil/).fill('exporter le paquet');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Exporter le paquet du projet').click()]);
    return { path: (await download.path())!, text: readFileSync((await download.path())!, 'utf8') };
  };
  const first = await exportPackage();
  const pkg = JSON.parse(first.text);
  expect(pkg.manifest).toMatchObject({ format: 'drawall-package', version: '1.0.0' });
  const before = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return { versions: s.versions.length, pointer: s.pointer }; });

  // Projet remplacé, puis restauré depuis le paquet.
  await loadObjects(page, []);
  page.once('dialog', d => d.accept());
  await page.locator('input[aria-label="Fichier du paquet DrawAll"]').setInputFiles(first.path);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  const after = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return { versions: s.versions.length, pointer: s.pointer, sheets: s.versions[s.pointer].sheets.length }; });
  expect(after).toEqual({ ...before, sheets: 1 });

  // Réexport : le même fichier, octet pour octet.
  const second = await exportPackage();
  expect(second.text).toBe(first.text);
  expect(errors).toEqual([]);
});
