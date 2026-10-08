import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 10.3 — étirer : le côté capturé s’allonge, la cote associée suit, annuler revient', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 },
    { id: 'OBJ-0002', kind: 'line', x1: 0, y1: 800, x2: 500, y2: 800 },
    { id: 'OBJ-0003', kind: 'dimension', targetId: 'OBJ-0001', style: 'horizontal', offset: -200 },
  ]);
  const dimText = () => page.getByTestId('canvas').getByText(/^1\s?[0-9]00 mm$/).first();
  await expect(dimText()).toHaveText(/1[\s ]?000/);
  await chooseTool(page, /^Étirer/);
  const point = page.getByLabel('Point précis');
  for (const p of ['900;-100', '1100;600']) { await point.fill(p); await point.press('Enter'); }
  // Fenêtre posée : les deux coins droits du rectangle sont signalés capturés.
  await expect(page.locator('[data-sommet-capture]')).toHaveCount(2);
  for (const p of ['1000;0', '@300;40']) { await point.fill(p); await point.press('Enter'); }
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === 'OBJ-0001')).toMatchObject({ x: 0, y: 0, w: 1300, h: 500 });
  // La ligne hors de la fenêtre n'a pas bougé ; la cote associée affiche la nouvelle largeur.
  expect((await currentObjects(page)).find(o => o.id === 'OBJ-0002')).toMatchObject({ x1: 0, x2: 500 });
  await expect(dimText()).toHaveText(/1[\s ]?300/);
  await point.blur(); // le raccourci n'agit pas pendant une saisie
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === 'OBJ-0001')?.w).toBe(1000);
  expect(errors).toEqual([]);
});
