import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 15.1 — vue 3D : solides dérivés du plan, élément sans hauteur signalé, temps de trame mesuré', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'slab', layerId: 'LAY-0001', points: [0, 0, 6000, 0, 6000, 4000, 0, 4000], thickness: 200 },
    { id: 'OBJ-0002', kind: 'roof', layerId: 'LAY-0001', x: 0, y: 0, w: 6000, h: 4000, roofType: 'deux-pans', pitch: 30, overhang: 300, axis: 'x' },
    { id: 'OBJ-0003', kind: 'wall', layerId: 'LAY-0001', name: 'Mur sans hauteur', x1: 0, y1: 4000, x2: 6000, y2: 4000, thickness: 200, justification: 'axe' },
  ]);
  const point = page.getByLabel('Point précis');
  const place = async (entry: string) => { await point.fill(entry); await point.press('Enter'); };

  // Mur dessiné avec une hauteur saisie : l'égout de la toiture se pose dessus.
  await chooseTool(page, /^Mur/);
  await page.getByLabel('Hauteur du mur (mm)').fill('2500');
  await place('0;0');
  await place('6000;0');
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'wall' && o.height === 2500)).toHaveLength(1);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Vue 3D', exact: true }).click();
  const view = page.getByRole('dialog', { name: 'Vue 3D' });
  // Retour immédiat (chargement du moteur 3D), puis la maquette une fois le module chargé.
  await expect(view).toBeVisible();
  await expect(view.getByLabel('Maquette 3D')).toBeVisible({ timeout: 30_000 });
  // Dalle, toiture et mur haut de 2,5 m ; le mur sans hauteur (aucun niveau au-dessus) est signalé.
  await expect(view).toHaveAttribute('data-solides', '3');
  await expect(view.getByTestId('vue3d-contenu')).toHaveText('1 dalle, 1 toiture, 1 mur');
  await expect(view.getByTestId('vue3d-ecartes')).toContainText('Mur sans hauteur non montré : hauteur non saisie et pas de niveau au-dessus.');
  // Temps de trame mesuré (p95 sur 60 trames) et affiché.
  await expect(view).toHaveAttribute('data-trame-p95', /^\d+\.\d\d$/, { timeout: 30_000 });
  await expect(view.getByTestId('vue3d-trame')).toContainText('Temps de trame (p95, 60 trames)');
  const p95 = Number(await view.getAttribute('data-trame-p95'));
  console.log(`vue 3D : temps de trame p95 = ${p95} ms`);
  expect(p95).toBeGreaterThan(0);

  // Orbite (glisser) puis cadrage : la vue reste rendue sans erreur.
  const box = (await view.getByLabel('Maquette 3D').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await view.getByRole('button', { name: 'Cadrer la maquette' }).click();
  await view.getByRole('button', { name: 'Fermer la vue 3D' }).click();
  await expect(view).toBeHidden();
  expect(errors).toEqual([]);
});
