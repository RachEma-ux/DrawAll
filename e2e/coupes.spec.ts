import { expect, test } from '@playwright/test';
import { currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 5.3 — recette platine percée : coupe A–A hachurée, suit la face', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'inspecteur en colonne : recette bureau');
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, holes: ['OBJ-0002', 'OBJ-0003'], classification: 'mecanique' },
    { id: 'OBJ-0002', kind: 'circle', cx: 25, cy: 30, r: 6.25, classification: 'mecanique' },
    { id: 'OBJ-0003', kind: 'circle', cx: 75, cy: 30, r: 6.25, classification: 'mecanique' },
    { id: 'OBJ-0004', kind: 'views', sourceId: 'OBJ-0001', depth: 10, gap: 20, top: true, side: true, classification: 'mecanique' },
    // Repère A par l'axe des perçages, flèches vers le bas : coupe vue du dessus.
    { id: 'OBJ-0005', kind: 'section', x1: -10, y1: 30, x2: 150, y2: 30, label: 'A', flip: true, classification: 'mecanique' },
  ]);
  await page.getByRole('button', { name: /OBJ-0005/ }).first().click();
  await page.getByRole('button', { name: 'Créer la coupe de OBJ-0001' }).click();
  await expect.poll(async () => (await currentObjects(page)).find(o => o.kind === 'cut')).toMatchObject({ sourceId: 'OBJ-0001', markId: 'OBJ-0005', depth: 10 });
  // La coupe prend la place de la vue de dessus ; la vue de côté reste.
  expect((await currentObjects(page)).find(o => o.kind === 'views')).toMatchObject({ top: false, side: true });

  const coupe = page.getByTestId('canvas').locator('g[data-coupe]');
  await expect(coupe.locator('text')).toHaveText('A–A');
  // Trois surfaces coupées (perçages vides) : 12 arêtes ; hachures présentes.
  await expect(coupe.locator('g[data-arete] line')).toHaveCount(12);
  expect(await coupe.locator(':scope > line').count()).toBeGreaterThan(10);
  await expect(page.getByTestId('coupe-matiere')).toHaveText('3 surfaces coupées · A–A');

  // La face s'élargit (la trace la traverse toujours) : la coupe suit.
  await page.getByRole('button', { name: /OBJ-0001/ }).first().click();
  const width = page.getByText('Largeur (mm)', { exact: true }).locator('xpath=following-sibling::input');
  await width.fill('140');
  await width.blur();
  await expect.poll(async () => Math.max(...await coupe.locator('g[data-arete] line').evaluateAll(ls => ls.map(l => Number(l.getAttribute('x2')))))).toBe(140);
  expect(errors).toEqual([]);
});
