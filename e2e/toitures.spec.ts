import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel, toScreen } from './helpers';

test('lot 13.2 — toiture : deux pans puis quatre pans ; hauteur de faîtage et arêtiers de référence', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 10000, h: 8000 }]);
  await chooseTool(page, /^Toiture/);
  await page.getByLabel('Type de toiture').selectOption('deux-pans');
  await page.getByLabel('Pente de la toiture (°)').fill('35');
  await page.getByLabel('Débord de la toiture (mm)').fill('0');
  // Deux coins opposés du contour, saisis au clavier.
  const point = page.getByLabel('Point précis');
  for (const entry of ['0;0', '10000;8000']) { await point.fill(entry); await point.press('Enter'); }
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'roof').length).toBe(1);
  expect((await currentObjects(page)).find(o => o.kind === 'roof')).toMatchObject({ x: 0, y: 0, w: 10000, h: 8000, roofType: 'deux-pans', pitch: 35, overhang: 0, axis: 'x' });
  // 4 000 × tan 35° = 2 800,83 mm.
  await expect(page.getByText('Toiture créée : faîtage à 2 800,83 mm au-dessus de l’égout.')).toBeVisible();
  // Plan : rive, faîtage et deux flèches de pente (1 + 1 + 2 × 3 traits).
  await expect(page.locator('[data-toiture] > *')).toHaveCount(8);

  // Inspecteur : passer à quatre pans à 45° → arêtiers de √48 m = 6 928 mm, faîtage à 4 000 mm.
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 5000, 4000);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  await expect(page.getByTestId('toiture-faitage')).toHaveText('2 801 mm');
  await page.getByLabel('Type de la toiture').selectOption('quatre-pans');
  await page.getByLabel('Pente de la toiture').fill('45');
  await page.getByLabel('Pente de la toiture').press('Enter');
  await expect(page.getByTestId('toiture-faitage')).toHaveText('4 000 mm');
  await expect(page.getByTestId('toiture-aretier')).toHaveText('6 928 mm');
  expect((await currentObjects(page)).find(o => o.kind === 'roof')).toMatchObject({ roofType: 'quatre-pans', pitch: 45 });
  // Un pan : la rive haute change de côté depuis l'inspecteur.
  await page.getByLabel('Type de la toiture').selectOption('un-pan');
  await page.getByLabel('Côté de la rive haute').selectOption('max');
  await expect.poll(async () => (await currentObjects(page)).find(o => o.kind === 'roof')).toMatchObject({ roofType: 'un-pan', highSide: 'max' });
  expect(errors).toEqual([]);
});

test('lot 13.2 — toiture tracée par une longueur saisie (coin opposé dans la direction du curseur)', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'direction donnée par le pointeur de la souris');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 10000, h: 8000 }]);
  await chooseTool(page, /^Toiture/);
  await page.getByLabel('Type de toiture').selectOption('deux-pans');
  await page.getByLabel('Pente de la toiture (°)').fill('30');
  await page.getByLabel('Débord de la toiture (mm)').fill('0');
  const point = page.getByLabel('Point précis');
  await point.fill('0;0');
  await point.press('Enter');
  // Ortho coupé (la direction est oblique), pointeur vers (3 000 ; 4 000), longueur 5 000 :
  // coin opposé en (3 000 ; 4 000).
  await page.getByRole('button', { name: /^Ortho/ }).click();
  const at = await toScreen(page, 3000, 4000);
  await page.mouse.move(at.x, at.y);
  const length = page.getByLabel('Longueur ou point relatif');
  await length.fill('5000');
  await length.press('Enter');
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'roof')).toMatchObject([{ x: 0, y: 0, w: 3000, h: 4000 }]);
  expect(errors).toEqual([]);
});
