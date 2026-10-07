import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

const scene = [
  { id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 400, y2: 0 },
  { id: 'OBJ-0002', kind: 'line', x1: 100, y1: -100, x2: 100, y2: 100 },
  { id: 'OBJ-0003', kind: 'line', x1: 300, y1: -100, x2: 300, y2: 100 },
  { id: 'OBJ-0004', kind: 'line', x1: 0, y1: 60, x2: 200, y2: 60 },
  { id: 'OBJ-0005', kind: 'line', x1: 500, y1: -100, x2: 500, y2: 100 },
];

test('lot 1.4 — ajuster retire la portion désignée entre deux arêtes', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, scene);
  await chooseTool(page, /^Ajuster/);
  await tapModel(page, info, 200, 0);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(6);
  const lines = (await currentObjects(page)).filter(o => o.kind === 'line' && o.y1 === 0 && o.y2 === 0);
  expect(lines.map(l => [l.x1, l.x2]).sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([[0, 100], [300, 400]]);
  expect(errors).toEqual([]);
});

test('lot 1.4 — prolonger jusqu’à la prochaine arête', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, scene);
  await chooseTool(page, /^Prolonger/);
  await tapModel(page, info, 195, 60);
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === 'OBJ-0004')?.x2).toBe(300);
});

test('lot 1.4 — message clair quand il n’y a rien à couper', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 400, y2: 0 }]);
  await chooseTool(page, /^Ajuster/);
  await tapModel(page, info, 200, 0);
  await expect(page.getByRole('status')).toContainText('aucune arête');
  expect(await currentObjects(page)).toHaveLength(1);
});
