import { expect, test, type Page } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

const symbolPanel = (page: Page) => page.getByRole('group', { name: 'Paramètres du symbole' });

test('lot 4.5 — nord, repère de coupe et cote de niveau posés puis exportés en DXF', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 6000, h: 4000 }]);
  await chooseTool(page, /^Symbole/);

  // Nord orienté à 30°.
  await symbolPanel(page).getByLabel('Angle du nord (degrés)').fill('30');
  await tapModel(page, info, 5000, 3000);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  expect((await currentObjects(page))[1]).toMatchObject({ kind: 'north', rotation: 30 });

  // Repère de coupe : deux points, repère « A » proposé.
  await symbolPanel(page).getByLabel('Type de symbole').selectOption('section');
  await tapModel(page, info, 2000, 1000);
  await tapModel(page, info, 2000, 3000);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(3);
  expect((await currentObjects(page))[2]).toMatchObject({ kind: 'section', label: 'A', x1: 2000, x2: 2000 });

  // Cote de niveau : altitude du niveau actif proposée (±0,00), ici saisie +0,15.
  await symbolPanel(page).getByLabel('Type de symbole').selectOption('levelMark');
  await symbolPanel(page).getByLabel('Altitude de la cote de niveau (m)').fill('0,15');
  await tapModel(page, info, 4000, 1500);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(4);
  expect((await currentObjects(page))[3]).toMatchObject({ kind: 'levelMark', elevation: 150 });

  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g[data-symbole="north"] text')).toHaveText('N');
  await expect(canvas.locator('g[data-symbole="section"] text')).toHaveText(['A', 'A']);
  await expect(canvas.locator('g[data-symbole="levelMark"] text')).toHaveText('+0,15');

  if (info.project.name === 'bureau') {
    page.on('dialog', d => d.accept());
    // Sous 1 536 px, les actions du projet sont dans le menu.
    const menu = page.getByRole('button', { name: 'Menu' });
    if (await menu.isVisible().catch(() => false)) await menu.click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DXF', exact: true }).click()]);
    const { readFileSync } = await import('node:fs');
    const dxf = readFileSync((await download.path())!, 'utf8');
    expect(dxf).toContain('\nSOLID\n');
    expect(dxf).toMatch(/\n1\nN\n/);
    expect(dxf).toMatch(/\n1\nA\n/);
    expect(dxf).toMatch(/\n1\n\+0,15\n/);
  }
  expect(errors).toEqual([]);
});

test('lot 4.5 — bloc de la bibliothèque bâtiment inséré', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const expand = page.getByRole('button', { name: 'Déplier le navigateur du projet', exact: true });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  await page.getByLabel('Bibliothèque bâtiment').selectOption('lit-140');
  const collapse = page.getByRole('button', { name: 'Plier le navigateur du projet', exact: true });
  if (info.project.name === 'telephone' && await collapse.isVisible().catch(() => false)) await collapse.click();
  await tapModel(page, info, 1000, 500);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  const state = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return s.versions[s.pointer]; });
  const block = state.blocks.find((b: { libraryKey?: string }) => b.libraryKey === 'lit-140');
  expect(block.name).toBe('Lit double 140 × 190');
  expect(state.objects[1]).toMatchObject({ kind: 'blockRef', blockId: block.id });
});
