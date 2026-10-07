import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

const scene = [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 300, y2: 0 }];

test('lot 1.9 — type et épaisseur de trait d’un objet, rendu et conservés', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, scene);
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 150, 0);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  const type = page.getByLabel('Type de trait — objet');
  await expect(type).toHaveValue('__calque');
  await type.selectOption('mixte');
  await page.getByLabel('Épaisseur du trait — objet').selectOption('0.5');
  await expect.poll(async () => (await currentObjects(page))[0]).toMatchObject({ lineType: 'mixte', lineWeight: 0.5 });
  // Rendu : le trait porte un motif de tirets (trait-point).
  const dash = await page.getByTestId('canvas').locator('line[stroke-dasharray]').first().getAttribute('stroke-dasharray');
  expect(dash?.split(' ')).toHaveLength(4);
  // Retour « du calque ».
  await type.selectOption('__calque');
  await expect.poll(async () => (await currentObjects(page))[0].lineType).toBeUndefined();
  expect(errors).toEqual([]);
});

test('lot 1.9 — type de trait d’un calque, hérité par ses objets', async ({ page }, info) => {
  test.skip(isPhone(info), 'Navigateur du projet : recette sur bureau (même composant sur téléphone).');
  await openAtelier(page);
  await loadObjects(page, scene);
  await page.getByRole('button', { name: 'Trait du calque Dessin libre' }).click();
  await page.getByLabel('Type de trait — calque Dessin libre').selectOption('interrompu');
  const layers = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    return s.versions[s.pointer].layers as { name: string; lineType?: string }[];
  });
  expect(layers.find(l => l.name === 'Dessin libre')?.lineType).toBe('interrompu');
  const dash = await page.getByTestId('canvas').locator('line[stroke-dasharray]').first().getAttribute('stroke-dasharray');
  expect(dash?.split(' ')).toHaveLength(2);
});
