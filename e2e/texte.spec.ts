import { expect, test } from '@playwright/test';
import { canvasPoint, chooseTool, isPhone, objectCount, openAtelier, touch } from './helpers';

test('lot 1.2 — poser un texte et le retrouver après rechargement', async ({ page }, info) => {
  const errors = await openAtelier(page);
  const before = await objectCount(page);
  await chooseTool(page, /^Texte/);
  page.once('dialog', dialog => dialog.accept('Séjour 24,5 m²'));
  const at = await canvasPoint(page, 0.5, 0.9);
  if (isPhone(info)) await (await touch(page)).tap(at);
  else await page.mouse.click(at.x, at.y);
  await expect.poll(() => objectCount(page)).toBe(before + 1);
  await expect(page.getByTestId('canvas').getByText('Séjour 24,5 m²')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('canvas').getByText('Séjour 24,5 m²')).toBeVisible();
  expect(errors).toEqual([]);
});
