import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

// Mur oblique de (0 ; 0) à (200 ; −200) ; depuis (0 ; −110), le pied de la perpendiculaire est
// (55 ; −55), point que ni la grille ni l'ortho ne donnent.
const wall = [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 200, y2: -200 }];

async function drawFromPointTo(page: Parameters<typeof tapModel>[0], info: Parameters<typeof tapModel>[1]) {
  await chooseTool(page, /^Polyligne/);
  const point = page.getByLabel('Point précis');
  await point.fill('0;-110');
  await point.press('Enter');
  await tapModel(page, info, 56, -54);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  return (await currentObjects(page)).find(o => o.kind === 'polyline')!;
}

test('lot 1.8 — accrochage perpendiculaire depuis le point précédent', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, wall);
  const poly = await drawFromPointTo(page, info);
  expect(poly.points).toEqual([0, -110, 55, -55]);
  expect(errors).toEqual([]);
});

test('lot 1.8 — un accrochage coupé ne s’applique plus (réglage conservé)', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, wall);
  await page.getByRole('button', { name: /^accrochages/ }).click();
  const panel = page.getByRole('dialog', { name: 'Accrochages objet' });
  await panel.getByRole('checkbox', { name: /^Perpendiculaire/ }).uncheck();
  await panel.getByRole('button', { name: 'Fermer' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  const poly = await drawFromPointTo(page, info);
  // Sans perpendiculaire, la grille (10 mm) et l'ortho l'emportent.
  expect(poly.points.slice(0, 2)).toEqual([0, -110]);
  expect(poly.points.slice(2)).not.toEqual([55, -55]);
});
