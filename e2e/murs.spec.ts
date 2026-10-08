import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 4.1 — murs enchaînés, jonction en L nettoyée', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Mur/);
  await page.getByLabel('Épaisseur du mur (mm)').fill('200');
  const point = page.getByLabel('Point précis');
  for (const e of ['0;0', '5000;0', '5000;3000']) { await point.fill(e); await point.press('Enter'); }
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  const walls = await currentObjects(page);
  expect(walls.map(w => [w.kind, w.thickness, w.justification])).toEqual([['wall', 200, 'axe'], ['wall', 200, 'axe']]);
  // Rendu : aucun trait ne passe par le centre de la jonction (5000 ; 0).
  const crossing = await page.getByTestId('canvas').locator('g[data-mur] line').evaluateAll(lines => lines.some(l => {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(a => Number(l.getAttribute(a)));
    const len = Math.hypot(x2 - x1, y2 - y1);
    const c = Math.abs((x2 - x1) * (0 - y1) - (y2 - y1) * (5000 - x1)) / len;
    const t = ((5000 - x1) * (x2 - x1) + (0 - y1) * (y2 - y1)) / (len * len);
    return c < 1e-6 && t > 0 && t < 1;
  }));
  expect(crossing).toBe(false);
  expect(await page.getByTestId('canvas').locator('g[data-mur] line').count()).toBe(6);
  expect(errors).toEqual([]);
});

test('lot 4.1 — une longueur saisie crée le mur', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Mur/);
  const point = page.getByLabel('Point précis');
  await point.fill('0;0');
  await point.press('Enter');
  const length = page.getByLabel('Longueur ou point relatif');
  await length.fill('4000');
  await length.press('Enter');
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  await page.getByRole('button', { name: 'Terminer' }).click();
  const [wall] = await currentObjects(page);
  expect(wall).toMatchObject({ kind: 'wall', x1: 0, y1: 0, x2: 4000, y2: 0 });
  expect(errors).toEqual([]);
});

test('lot 4.1 — sur la feuille, un mur masqué dans la fenêtre ne coupe pas les autres', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' },
    { id: 'OBJ-0002', kind: 'wall', x1: 5000, y1: 0, x2: 5000, y2: 3000, thickness: 200, justification: 'axe', layerId: 'LAY-0003' },
  ]);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  const lines = page.getByTestId('fenetre-FEN-0001').locator('g[data-mur] line');
  await expect(lines).toHaveCount(6);
  await page.getByRole('checkbox', { name: 'Repères' }).uncheck();
  // Seul le premier mur reste : contour complet (deux faces, deux about), sans jonction.
  await expect(lines).toHaveCount(4);
});
