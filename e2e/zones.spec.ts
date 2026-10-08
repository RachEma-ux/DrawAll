import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe', classification: 'architecture' });

test('lot 13.3 — zone de deux pièces : couleur, surface cumulée exacte', async ({ page }, info) => {
  const errors = await openAtelier(page);
  // 5 × 4 m d'axe en axe, refend à 3 m : pièces de 2,80 × 3,80 et 1,80 × 3,80 m.
  await loadObjects(page, [
    wall('OBJ-0001', 0, 0, 5000, 0), wall('OBJ-0002', 5000, 0, 5000, 4000), wall('OBJ-0003', 5000, 4000, 0, 4000), wall('OBJ-0004', 0, 4000, 0, 0), wall('OBJ-0005', 3000, 0, 3000, 4000),
    { id: 'OBJ-0006', kind: 'room', x: 1500, y: 2000, name: 'Séjour' },
    { id: 'OBJ-0007', kind: 'room', x: 4000, y: 2000, name: 'Cuisine' },
  ]);
  await chooseTool(page, /^Sélection/);
  const inspector = async () => { if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click(); };
  const closeInspector = async () => { if (isPhone(info)) await page.keyboard.press('Escape'); };

  // Le séjour sélectionné, zone créée avec lui.
  await tapModel(page, info, 1500, 2000);
  await inspector();
  await page.getByRole('button', { name: 'Gérer les zones…' }).click();
  await page.getByLabel('Nom de la nouvelle zone').fill('Logement');
  await page.getByRole('button', { name: 'Créer la zone' }).click();
  await expect(page.locator('[data-zone="ZON-0001"] [data-zone-total]')).toHaveText('10,64 m²');
  await page.getByRole('button', { name: 'Fermer les zones' }).click();
  await closeInspector();

  // La cuisine rejoint la zone depuis l'inspecteur.
  await tapModel(page, info, 4000, 2000);
  await inspector();
  await page.getByLabel('Zone de la pièce').selectOption({ label: 'Logement' });
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.zoneId === 'ZON-0001').map(o => o.id)).toEqual(['OBJ-0006', 'OBJ-0007']);
  await page.getByRole('button', { name: 'Gérer les zones…' }).click();
  // 10,64 + 6,84 = 17,48 m².
  await expect(page.locator('[data-zone="ZON-0001"] [data-zone-total]')).toHaveText('17,48 m²');
  await page.getByRole('button', { name: 'Fermer les zones' }).click();
  await closeInspector();
  await expect(page.locator('[data-zone-couleur="#22d3ee"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});
