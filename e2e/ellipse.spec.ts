import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

test('lot 10.1 — ellipse par trois points saisis, rendue, exportée en ELLIPSE natif', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await chooseTool(page, /^Ellipse/);
  const point = page.getByLabel('Point précis');
  // Centre, extrémité du premier axe (demi-axe 2 000 mm à 30°), puis un point à 800 mm de cet axe.
  const a = { x: 2000 * Math.cos(Math.PI / 6), y: -2000 * Math.sin(Math.PI / 6) };
  for (const p of ['0;0', `${a.x.toFixed(6).replace('.', ',')};${a.y.toFixed(6).replace('.', ',')}`, `${(-800 * Math.sin(Math.PI / 6)).toFixed(6).replace('.', ',')};${(-800 * Math.cos(Math.PI / 6)).toFixed(6).replace('.', ',')}`]) {
    await point.fill(p);
    await point.press('Enter');
  }
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
  const [e] = await currentObjects(page);
  expect(e.kind).toBe('ellipse');
  expect(Number(e.rx)).toBeCloseTo(2000, 3);
  expect(Number(e.ry)).toBeCloseTo(800, 3);
  expect(Number(e.rotation)).toBeCloseTo(30, 6);
  await expect(page.getByTestId('canvas').locator('g[data-ellipse]')).toHaveCount(1);

  if (info.project.name === 'bureau') {
    // Inspecteur : demi-axes et rotation ; exporter en DXF écrit une entité ELLIPSE.
    await expect(page.getByText('Demi-axe 1 (mm)')).toBeVisible();
    page.on('dialog', d => void d.accept());
    const menu = page.getByRole('button', { name: 'Menu' });
    if (await menu.isVisible().catch(() => false)) await menu.click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DXF', exact: true }).click()]);
    const dxf = readFileSync((await download.path())!, 'utf8');
    expect(dxf).toContain('\nELLIPSE\n');
    const ratio = Number(/\nAcDbEllipse\n[\s\S]*?\n40\n([-\d.e]+)\n/.exec(dxf)![1]);
    expect(ratio).toBeCloseTo(0.4, 6); // rapport 800 / 2 000
  }
  expect(errors).toEqual([]);
});
