import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

async function corners(page: Page): Promise<number[]> {
  return ((await currentObjects(page)).find(x => x.id === 'OBJ-0001')!.points as number[]).map(v => Math.round(v * 1000) / 1000);
}
async function tapSide(page: Page, info: TestInfo, i: number) {
  const p = await corners(page);
  await tapModel(page, info, (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2);
}
async function constrain(page: Page, type: string, value?: string) {
  await page.getByLabel('Type de contrainte').selectOption({ label: type });
  if (value !== undefined) await page.getByLabel('Valeur de la contrainte (mm)').fill(value);
}
async function addParameter(page: Page, name: string, expr: string) {
  await page.getByLabel('Nom du nouveau paramètre').fill(name);
  await page.getByLabel('Expression du nouveau paramètre').fill(expr);
  await page.getByRole('button', { name: 'Ajouter le paramètre' }).click();
}

test('lot 12.2 — paramètres nommés : changer L redimensionne la pièce ; expression circulaire refusée', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'polyline', points: [0, 0, 1003, 4, 998, 497, 2, 506, 0, 0] },
    { id: 'OBJ-0002', kind: 'rect', x: -600, y: -600, w: 3000, h: 2200 },
  ]);
  await chooseTool(page, /^Contrainte/);

  // Paramètres : L = 1 000, H = L / 2.
  await page.getByRole('button', { name: 'Paramètres…' }).click();
  await addParameter(page, 'L', '1000');
  await addParameter(page, 'H', 'L / 2');
  await expect(page.locator('[data-parametre="H"] [data-valeur]')).toHaveText('500 mm');
  await page.getByRole('button', { name: 'Fermer les paramètres' }).click();

  // Rectangle contraint, longueurs pilotées par L et H.
  await constrain(page, 'Fixe');
  await tapModel(page, info, 0, 0);
  for (const [type, side] of [['Horizontale', 0], ['Verticale', 1], ['Horizontale', 2], ['Verticale', 3]] as const) {
    await constrain(page, type);
    await tapSide(page, info, side);
  }
  await constrain(page, 'Longueur', 'L');
  await tapSide(page, info, 0);
  await constrain(page, 'Longueur', 'H');
  await tapSide(page, info, 1);
  expect(await corners(page)).toEqual([0, 0, 1000, 0, 1000, 500, 0, 500, 0, 0]);
  await expect(page.locator('[data-contrainte="CTR-0006"]')).toHaveText('L L = 1000');

  // Changer L redimensionne la pièce (H = L / 2 suit).
  await page.getByRole('button', { name: 'Paramètres…' }).click();
  await page.getByLabel('Expression de L').fill('1200');
  await page.getByLabel('Expression de L').press('Enter');
  await expect.poll(() => corners(page)).toEqual([0, 0, 1200, 0, 1200, 600, 0, 600, 0, 0]);
  await expect(page.locator('[data-parametre="H"] [data-valeur]')).toHaveText('600 mm');

  // Expression circulaire refusée : L ne change pas, la pièce non plus.
  await page.getByLabel('Expression de L').fill('H * 2');
  await page.getByLabel('Expression de L').press('Enter');
  await expect(page.getByTestId('parametres-erreur')).toContainText('Référence circulaire');
  await expect(page.getByLabel('Expression de L')).toHaveValue('1200');
  // Un paramètre cité ne se retire pas.
  await page.getByRole('button', { name: 'Retirer L' }).click();
  await expect(page.getByTestId('parametres-erreur')).toHaveText('« L » est utilisé par H, CTR-0006.');
  expect(await corners(page)).toEqual([0, 0, 1200, 0, 1200, 600, 0, 600, 0, 0]);
  expect(errors).toEqual([]);
});
