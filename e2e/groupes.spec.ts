import { expect, test } from '@playwright/test';
import { currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

const lines = [
  { id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 2000, y2: 0 },
  { id: 'OBJ-0002', kind: 'line', x1: 0, y1: 1000, x2: 2000, y2: 1000 },
  { id: 'OBJ-0003', kind: 'line', x1: 0, y1: 2000, x2: 2000, y2: 2000 },
];
const edition = (page: import('@playwright/test').Page) => page.getByText(/^Édition/).first();

test('lot 10.5 — grouper, désigner le groupe par un membre, dupliquer en groupe neuf, dégrouper', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'désignation multiple à la souris (Maj + clic)');
  const errors = await openAtelier(page);
  await loadObjects(page, lines);
  await tapModel(page, info, 1000, 0);
  await page.keyboard.down('Shift');
  await tapModel(page, info, 1000, 1000);
  await page.keyboard.up('Shift');
  await expect(edition(page)).toHaveText('Édition — 2 objets');
  await page.getByRole('button', { name: 'Grouper', exact: true }).click();
  await expect.poll(async () => (await currentObjects(page)).map(o => o.groupId ?? null)).toEqual(['GRP-0001', 'GRP-0001', null]);

  // Un clic dans le vide, puis sur un seul membre : tout le groupe est désigné.
  await tapModel(page, info, 3000, 3000);
  await tapModel(page, info, 1000, 1000);
  await expect(edition(page)).toHaveText('Édition — 2 objets');
  await expect(page.locator('[data-groupe="GRP-0001"]')).toHaveCount(2);

  // Dupliquer : les copies forment un groupe neuf.
  await page.keyboard.press('Control+d');
  await expect.poll(async () => (await currentObjects(page)).map(o => o.groupId ?? null)).toEqual(['GRP-0001', 'GRP-0001', null, 'GRP-0002', 'GRP-0002']);

  // Le groupe est enregistré avec le projet ; dégrouper le dissout.
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  // Près de l'extrémité gauche de la ligne d'origine : les copies (décalées de 20 mm) n'y passent pas.
  await tapModel(page, info, 2, 0);
  await page.getByRole('button', { name: 'Dégrouper', exact: true }).click();
  await expect.poll(async () => (await currentObjects(page)).map(o => o.groupId ?? null)).toEqual([null, null, null, 'GRP-0002', 'GRP-0002']);
  expect(errors).toEqual([]);
});

test('lot 10.5 — au doigt : toucher un membre désigne le groupe', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, lines.map((l, i) => (i < 2 ? { ...l, groupId: 'GRP-0001' } : l)));
  await tapModel(page, info, 1000, 0);
  await expect(edition(page)).toHaveText('Édition — 2 objets');
  await tapModel(page, info, 1000, 2000);
  await expect(edition(page)).toHaveText('Édition — 1 objet');
  expect(errors).toEqual([]);
});
