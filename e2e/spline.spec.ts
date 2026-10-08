import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 10.2 — spline par points de contrôle, éditée, exportée en SPLINE natif', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Spline/);
  const point = page.getByLabel('Point précis');
  for (const p of ['0;0', '1000;-2000', '2000;2000', '3000;0']) { await point.fill(p); await point.press('Enter'); }
  await expect(page.locator('[data-apercu-spline]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  expect((await currentObjects(page))[0]).toMatchObject({ kind: 'spline', degree: 3, points: [0, 0, 1000, -2000, 2000, 2000, 3000, 0] });
  await expect(page.getByTestId('canvas').locator('g[data-spline]')).toHaveCount(1);

  if (info.project.name === 'bureau') {
    // Édition d'un point de contrôle dans l'inspecteur : la courbe suit.
    const field = page.getByLabel('P4 Y (mm)');
    await field.fill('500');
    await field.blur();
    await expect.poll(async () => ((await currentObjects(page))[0].points as number[])[7]).toBe(500);
    page.on('dialog', d => void d.accept());
    const menu = page.getByRole('button', { name: 'Menu' });
    if (await menu.isVisible().catch(() => false)) await menu.click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DXF', exact: true }).click()]);
    const dxf = readFileSync((await download.path())!, 'utf8');
    expect(dxf).toContain('\nSPLINE\n');
    expect(dxf).toMatch(/\n71\n3\n/);
  }
  expect(errors).toEqual([]);
});
