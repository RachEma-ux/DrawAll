import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

const scene = [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 40, h: 20 }];

async function selectRect(page: Parameters<typeof tapModel>[0], info: Parameters<typeof tapModel>[1]) {
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 20, 0);
  await expect(page.getByRole('button', { name: 'Réseau rect.' })).toBeEnabled();
}

test('lot 1.6 — réseau rectangulaire 2 × 3', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, scene);
  await selectRect(page, info);
  await page.getByRole('button', { name: 'Réseau rect.' }).click();
  const dialog = page.getByRole('dialog', { name: 'Réseau rectangulaire' });
  await dialog.getByLabel('Lignes').fill('2');
  await dialog.getByLabel('Colonnes').fill('3');
  await dialog.getByLabel('Pas X').fill('100');
  await dialog.getByLabel('Pas Y').fill('50');
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dialog).toBeHidden();
  const objs = await currentObjects(page);
  expect(objs).toHaveLength(6);
  expect(new Set(objs.map(o => o.id)).size).toBe(6);
  expect(objs.map(o => `${o.x},${o.y}`).sort()).toEqual(['0,0', '0,50', '100,0', '100,50', '200,0', '200,50']);
  expect(errors).toEqual([]);
});

test('lot 1.6 — réseau polaire : 4 exemplaires sur un tour', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }]);
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 50, 0);
  await page.getByRole('button', { name: 'Réseau polaire' }).click();
  const dialog = page.getByRole('dialog', { name: 'Réseau polaire' });
  await dialog.getByLabel('Exemplaires').fill('4');
  await dialog.getByLabel('Angle total').fill('360');
  await dialog.getByLabel('Centre X').fill('0');
  await dialog.getByLabel('Centre Y').fill('0');
  await dialog.getByRole('button', { name: 'Créer' }).click();
  const ends = (await currentObjects(page)).map(o => `${Math.round(Number(o.x2))},${Math.round(Number(o.y2))}`).sort();
  expect(ends).toEqual(['-100,0', '0,-100', '0,100', '100,0']);
});

test('lot 1.6 — paramètres invalides : message, rien de créé', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, scene);
  await selectRect(page, info);
  await page.getByRole('button', { name: 'Réseau rect.' }).click();
  const dialog = page.getByRole('dialog', { name: 'Réseau rectangulaire' });
  await dialog.getByLabel('Lignes').fill('1');
  await dialog.getByLabel('Colonnes').fill('1');
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dialog.getByRole('alert')).toContainText('au moins deux');
  expect(await currentObjects(page)).toHaveLength(1);
});

test('lot 1.6 — copier puis coller deux fois', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, scene);
  await selectRect(page, info);
  await page.getByRole('button', { name: 'Copier', exact: true }).click();
  await page.getByRole('button', { name: 'Coller', exact: true }).click();
  await page.getByRole('button', { name: 'Coller', exact: true }).click();
  const objs = await currentObjects(page);
  expect(objs).toHaveLength(3);
  expect(new Set(objs.map(o => o.id)).size).toBe(3);
  expect(objs.map(o => `${o.x},${o.y}`)).toEqual(['0,0', '20,20', '40,40']);
});
