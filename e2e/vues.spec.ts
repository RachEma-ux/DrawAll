import { expect, test, type Page } from '@playwright/test';
import { currentObjects, loadObjects, openAtelier } from './helpers';

/** Premier trait vu d'une vue (arête supérieure du contour) : [x1, y1, x2, y2]. */
async function firstEdge(page: Page, kind: string) {
  const line = page.getByTestId('canvas').locator(`g[data-vue="${kind}"] > line`).first();
  return Promise.all(['x1', 'y1', 'x2', 'y2'].map(async a => Number(await line.getAttribute(a))));
}

test('lot 5.2 — vues liées : modifier la face met à jour le dessus et le côté', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'inspecteur en colonne : recette bureau');
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, holes: ['OBJ-0002'], classification: 'mecanique' },
    { id: 'OBJ-0002', kind: 'circle', cx: 50, cy: 30, r: 6.25, classification: 'mecanique' },
  ]);
  await page.getByRole('button', { name: /OBJ-0001/ }).first().click();
  page.once('dialog', d => d.accept('10'));
  await page.getByRole('button', { name: 'Créer les vues de dessus et de côté' }).click();
  await expect.poll(async () => (await currentObjects(page)).find(o => o.kind === 'views')).toMatchObject({ sourceId: 'OBJ-0001', depth: 10 });

  // Premier dièdre : dessus sous la face (y > 60), côté à droite (x > 100) ; perçage en traits cachés.
  const [, ty, tx2] = await firstEdge(page, 'dessus');
  expect(tx2).toBe(100);
  expect(ty).toBeGreaterThan(60);
  const [sx] = await firstEdge(page, 'gauche');
  expect(sx).toBeGreaterThan(100);
  await expect(page.getByTestId('canvas').locator('g[data-vue="dessus"] g[data-cache] line')).toHaveCount(2);

  // La face passe à 140 mm de large : les deux vues suivent.
  await page.getByRole('button', { name: /OBJ-0001/ }).first().click();
  const width = page.getByText('Largeur (mm)', { exact: true }).locator('xpath=following-sibling::input');
  await width.fill('140');
  await width.blur();
  await expect.poll(async () => (await firstEdge(page, 'dessus'))[2]).toBe(140);
  await expect.poll(async () => (await firstEdge(page, 'gauche'))[0]).toBeGreaterThan(140);

  // Troisième dièdre : la vue de dessus passe au-dessus de la face, la vue de côté devient la vue de droite.
  const viewsId = String((await currentObjects(page)).find(o => o.kind === 'views')!.id);
  await page.getByRole('button', { name: new RegExp(viewsId) }).first().click();
  await page.getByLabel('Méthode de projection des vues').selectOption('troisieme-diedre');
  await expect.poll(async () => (await firstEdge(page, 'dessus'))[1]).toBeLessThan(0);
  await expect(page.getByTestId('canvas').locator('g[data-vue="droite"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
