import { expect, test } from '@playwright/test';
import { loadObjects, openAtelier } from './helpers';

// Assemblage : un arbre et une bague en acier, voisins ; une plaque isolée.
const assembly = [
  { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 200, h: 60, materialId: 'acier' },
  { id: 'OBJ-0002', kind: 'rect', x: 200, y: 0, w: 80, h: 60, materialId: 'acier' },
  { id: 'OBJ-0003', kind: 'rect', x: 400, y: 0, w: 80, h: 60, materialId: 'acier' },
];

test('lot 3.3 — assemblage : voisines alternées en coupe, rien en vue, matériau intact', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, assembly);
  const angle = async (id: string) => (await page.getByTestId('canvas').locator(`pattern#h-${id}`).getAttribute('patternTransform'))?.match(/rotate\((-?[\d.]+)\)/)?.[1];
  expect(await angle('OBJ-0001')).toBe('-45');
  expect(await angle('OBJ-0002')).toBe('-135');   // voisine : sens inverse
  expect(await angle('OBJ-0003')).toBe('-45');    // isolée

  await page.getByLabel('Contexte de l’atelier').selectOption('vue');
  await expect(page.getByTestId('canvas').locator('path[data-hachure]')).toHaveCount(0);
  const objects = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    return s.versions[s.pointer].objects as { materialId?: string; hatchParams?: unknown }[];
  });
  expect(objects.every(o => o.materialId === 'acier' && o.hatchParams === undefined)).toBe(true);
  expect(errors).toEqual([]);
});

test('lot 3.3 — feuille : une fenêtre en coupe, une en vue', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, assembly);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByLabel('Contexte de la fenêtre').selectOption('vue');
  await expect(page.getByTestId('fenetre-FEN-0001').locator('path[data-hachure]')).toHaveCount(3);
  await expect(page.getByTestId('fenetre-FEN-0002').locator('path[data-hachure]')).toHaveCount(0);
});
