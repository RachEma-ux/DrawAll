import { expect, test, type Page } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, toScreen } from './helpers';

/** Décalage du réticule au-dessus du doigt (px), comme dans l'atelier. */
const OFFSET = 80;

/** Un doigt posé, déplacé puis levé (CDP), avec une vérification pendant l'appui. */
async function press(page: Page, at: { x: number; y: number }, whileDown?: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, points: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points });
  await send('touchStart', [{ x: at.x, y: at.y + 6, id: 1 }]);
  await send('touchMove', [{ x: at.x, y: at.y, id: 1 }]);
  if (whileDown) await whileDown();
  await send('touchEnd', []);
  await page.waitForTimeout(100);
}

const scale = async (page: Page) => {
  const tr = await page.getByTestId('canvas').locator('> g').first().getAttribute('transform');
  return Number(tr!.match(/scale\(([-\d.e]+)\)/)![1]);
};

test('lot 7.1 — téléphone : barre d’outils en bas, réticule décalé et loupe, sommet pointé à ±1 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'recette téléphone');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 }]);

  // Outils fréquents en bas de l'écran, sous la zone de dessin.
  const bar = (await page.getByTestId('barre-outils').boundingBox())!;
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);

  await page.getByRole('button', { name: 'Réticule décalé' }).click();
  await expect(page.getByRole('button', { name: 'Réticule décalé' })).toHaveAttribute('aria-pressed', 'true');
  await chooseTool(page, /^Ligne/);

  // Premier point : le doigt est sous le sommet (1000 ; 0), le réticule à 3 px et 2 px de lui ;
  // la loupe s'affiche pendant l'appui, l'accrochage prend le sommet exact.
  const vertex = await toScreen(page, 1000, 0);
  await press(page, { x: vertex.x + 3, y: vertex.y + 2 + OFFSET }, async () => {
    await expect(page.getByTestId('loupe')).toBeVisible();
    const r = (await page.getByTestId('reticule').boundingBox())!;
    expect(Math.abs(r.x + r.width / 2 - (vertex.x + 3))).toBeLessThanOrEqual(1);
    expect(Math.abs(r.y + r.height / 2 - (vertex.y + 2))).toBeLessThanOrEqual(1);
  });
  await expect(page.getByTestId('loupe')).toHaveCount(0);

  // Second point : le réticule vise (1000 ; 500) ; le trait est créé au lever du doigt.
  const target = await toScreen(page, 1000, 500);
  await press(page, { x: target.x, y: target.y + OFFSET });
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  const line = (await currentObjects(page))[1] as { x1: number; y1: number; x2: number; y2: number };
  expect([line.x1, line.y1]).toEqual([1000, 0]);
  const k = await scale(page);
  expect(Math.abs(line.x2 - 1000) * k).toBeLessThanOrEqual(1);
  expect(Math.abs(line.y2 - 500) * k).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
