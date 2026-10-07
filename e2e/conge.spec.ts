import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

// Coin en L : horizontale (0,0)–(200,0), verticale (200,0)–(200,200).
const corner = [
  { id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 200, y2: 0 },
  { id: 'OBJ-0002', kind: 'line', x1: 200, y1: 0, x2: 200, y2: 200 },
];

const near = (a: unknown, b: number) => Math.abs(Number(a) - b) < 1e-6;

test('lot 1.5 — congé de rayon saisi entre deux lignes', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, corner);
  await chooseTool(page, /^Congé/);
  await page.getByLabel('Rayon du congé (mm)').fill('40');
  await tapModel(page, info, 50, 0);
  await tapModel(page, info, 200, 150);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(3);
  const objs = await currentObjects(page);
  const h = objs.find(o => o.id === 'OBJ-0001')!;
  const v = objs.find(o => o.id === 'OBJ-0002')!;
  const arc = objs.find(o => o.kind === 'arc')!;
  expect(near(h.x2, 160) && near(h.y2, 0)).toBe(true);
  expect(near(v.x1, 200) && near(v.y1, 40)).toBe(true);
  expect(near(arc.cx, 160) && near(arc.cy, 40) && near(arc.r, 40)).toBe(true);
  expect(errors).toEqual([]);
});

test('lot 1.5 — rayon trop grand refusé avec un message', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, corner);
  await chooseTool(page, /^Congé/);
  await page.getByLabel('Rayon du congé (mm)').fill('500');
  await tapModel(page, info, 50, 0);
  await tapModel(page, info, 200, 150);
  await expect(page.getByRole('status')).toContainText('Rayon trop grand');
  expect(await currentObjects(page)).toHaveLength(2);
});

test('lot 1.5 — chanfrein à deux distances', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, corner);
  await chooseTool(page, /^Chanfrein/);
  await page.getByLabel('Distance du chanfrein sur la première ligne (mm)').fill('30');
  await page.getByLabel('Distance du chanfrein sur la seconde ligne (mm)').fill('50');
  await tapModel(page, info, 50, 0);
  await tapModel(page, info, 200, 150);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(3);
  const cut = (await currentObjects(page)).find(o => o.kind === 'line' && o.id !== 'OBJ-0001' && o.id !== 'OBJ-0002')!;
  expect(near(cut.x1, 170) && near(cut.y1, 0) && near(cut.x2, 200) && near(cut.y2, 50)).toBe(true);
});

test('lot 1.5 — une première ligne désignée est oubliée si le dessin change', async ({ page }, info) => {
  test.skip(info.project.name === 'telephone', 'Déplacement au clavier : recette sur bureau.');
  await openAtelier(page);
  await loadObjects(page, corner);
  await chooseTool(page, /^Congé/);
  await tapModel(page, info, 50, 0);
  // La première ligne est sélectionnée : la déplacer au clavier modifie le dessin.
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === 'OBJ-0001')?.y1).toBe(10);
  await tapModel(page, info, 200, 150);
  // Aucun congé avec l'ancienne désignation : la seconde touche devient une nouvelle première ligne.
  expect(await currentObjects(page)).toHaveLength(2);
});
