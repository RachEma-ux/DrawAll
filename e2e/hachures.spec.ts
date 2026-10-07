import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 3.2 — hachure paramétrée : angle, pas modèle et îlot', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 4000, h: 3000, hatch: 'diagonal' },
    { id: 'OBJ-0002', kind: 'circle', cx: 2000, cy: 1500, r: 500 },
  ]);
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 4000, 1000);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  const field = async (label: string, value: string) => {
    const f = page.getByLabel(`Hachures — ${label}`, { exact: true });
    await f.fill(value);
    await f.press('Enter');
  };
  await field('Angle', '30');
  await page.getByRole('button', { name: 'Pas modèle' }).click();
  await field('Pas', '200');
  await page.getByRole('button', { name: /Évider les contours contenus \(1\)/ }).click();
  await expect.poll(async () => (await currentObjects(page))[0]).toMatchObject({
    hatchParams: { angle: 30, spacing: 200, unit: 'modele' }, holes: ['OBJ-0002'],
  });
  if (isPhone(info)) await page.keyboard.press('Escape');
  const pattern = page.getByTestId('canvas').locator('pattern#h-OBJ-0001');
  await expect(pattern).toHaveAttribute('width', '200');
  await expect(pattern).toHaveAttribute('patternTransform', /rotate\(-30\)/);
  // Îlot : le chemin hachuré contient le contour et le cercle, en pair-impair.
  const path = page.getByTestId('canvas').locator('path[data-hachure="diagonal"]');
  await expect(path).toHaveAttribute('fill-rule', 'evenodd');
  expect((await path.getAttribute('d'))!.match(/Z/g)).toHaveLength(2);
  expect(errors).toEqual([]);
});
