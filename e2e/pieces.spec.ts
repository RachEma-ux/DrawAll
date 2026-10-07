import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

const w = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe' });
const box = [w('OBJ-0001', 0, 0, 5200, 0), w('OBJ-0002', 5200, 0, 5200, 4200), w('OBJ-0003', 5200, 4200, 0, 4200), w('OBJ-0004', 0, 4200, 0, 0)];

test('lot 4.3 — pièce : nom et surface au centième de m², associative aux murs', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, box);
  await chooseTool(page, /^Pièce/);
  page.once('dialog', d => d.accept('Séjour'));
  await tapModel(page, info, 2600, 2100);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(5);
  const label = page.getByTestId('canvas').locator('g[data-piece] text[data-surface]');
  await expect(label).toHaveText('20,00 m²');
  await expect(page.getByTestId('canvas').locator('g[data-piece] text').first()).toHaveText('Séjour');

  if (info.project.name === 'bureau') {
    // Déplacer le mur est de 100 mm (Maj + flèche) : la pièce passe à 5,10 × 4,00 = 20,40 m².
    await chooseTool(page, /^Sélection/);
    await tapModel(page, info, 5200, 1000);
    await page.keyboard.press('Shift+ArrowRight');
    await expect(label).toHaveText('20,40 m²');
  }
  expect(errors).toEqual([]);
});

test('lot 4.3 — un point hors de toute pièce fermée : message, rien de créé', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, box.slice(0, 3));
  await chooseTool(page, /^Pièce/);
  await tapModel(page, info, 2600, 2100);
  await expect(page.getByRole('status')).toContainText('Aucune pièce fermée');
  expect(await currentObjects(page)).toHaveLength(3);
});
