import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, toScreen } from './helpers';

test('lot 10.6 — main levée : un geste continu devient une polyligne simplifiée', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: -1000, y: -1000, w: 6000, h: 5000 }]);
  await chooseTool(page, /^Main levée/);
  // Quart de cercle de rayon 2 000 mm autour de (0 ; 0), tracé en 60 petits pas, puis un segment droit.
  const path = [
    ...Array.from({ length: 61 }, (_, i) => { const t = (i / 60) * (Math.PI / 2); return { x: 2000 * Math.cos(t), y: 2000 * Math.sin(t) }; }),
    { x: 1000, y: 2000 }, { x: 0, y: 2000 },
  ];
  const screen = await Promise.all(path.map(p => toScreen(page, p.x, p.y)));
  if (isPhone(info)) {
    // Un doigt : posé, déplacé point par point, levé.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...screen[0], id: 1 }] });
    for (const p of screen.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(screen[0].x, screen[0].y);
    await page.mouse.down();
    for (const p of screen.slice(1)) await page.mouse.move(p.x, p.y);
    await page.mouse.up();
  }
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'polyline').length).toBe(1);
  const poly = (await currentObjects(page)).find(o => o.kind === 'polyline')!;
  const pts = poly.points as number[];
  // Simplifiée : bien moins de sommets que de points de geste, extrémités conservées (au pixel près).
  expect(pts.length / 2).toBeLessThan(path.length / 2);
  expect(pts.length / 2).toBeGreaterThanOrEqual(4);
  const px = 2000 / ((await toScreen(page, 2000, 0)).x - (await toScreen(page, 0, 0)).x); // mm par pixel
  expect(Math.hypot(pts[0] - 2000, pts[1])).toBeLessThan(2 * px);
  expect(Math.hypot(pts[pts.length - 2], pts[pts.length - 1] - 2000)).toBeLessThan(2 * px);
  expect(errors).toEqual([]);
});

test('lot 10.6 — main levée au doigt : trait court gardé, geste annulé par un second doigt effacé', async ({ page }, info) => {
  test.skip(!isPhone(info), 'gestes tactiles : projet téléphone');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: -1000, y: -1000, w: 6000, h: 5000 }]);
  await chooseTool(page, /^Main levée/);
  const a = await toScreen(page, 1000, 1000);
  const cdp = await page.context().newCDPSession(page);
  // Trait de 5 px (sous le seuil de confirmation d'un geste au doigt, au-dessus du seuil de création).
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + 3, y: a.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + 5, y: a.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'polyline').length).toBe(1);
  // Tracé commencé puis second doigt (pincement) : ni objet ni aperçu ne subsistent.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + 4 * i, y: a.y + 2 * i, id: 1 }] });
  await expect(page.locator('[data-apercu-main-levee]')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + 40, y: a.y + 20, id: 1 }, { x: a.x + 120, y: a.y + 80, id: 2 }] });
  await expect(page.locator('[data-apercu-main-levee]')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-apercu-main-levee]')).toHaveCount(0);
  expect((await currentObjects(page)).filter(o => o.kind === 'polyline').length).toBe(1);
  expect(errors).toEqual([]);
});
