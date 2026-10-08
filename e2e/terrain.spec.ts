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

test('lot 7.1 — téléphone en paysage : la loupe reste entière dans la zone quand le doigt en sort', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'recette téléphone');
  await page.setViewportSize({ width: 820, height: 400 });
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 }]);
  await page.getByRole('button', { name: 'Réticule décalé' }).click();
  await chooseTool(page, /^Ligne/);
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  // Le doigt part dans la zone puis glisse loin sous elle : le point visé passe sous le bas
  // de la zone, la loupe reste visible en entier.
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, p: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: p.map(q => ({ ...q, id: 1 })) });
  const x = canvas.x + canvas.width / 2;
  await send('touchStart', [{ x, y: canvas.y + canvas.height - 20 }]);
  await send('touchMove', [{ x, y: canvas.y + canvas.height + OFFSET + 60 }]);
  const loupe = (await page.getByTestId('loupe').locator('circle').nth(1).boundingBox())!;
  expect(loupe.y).toBeGreaterThanOrEqual(canvas.y - 1);
  expect(loupe.y + loupe.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  expect(loupe.x).toBeGreaterThanOrEqual(canvas.x - 1);
  expect(loupe.x + loupe.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  await send('touchEnd', []);
});

test('lot 7.1 — un stylet pointe directement, sans décalage, même réticule activé', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'recette téléphone');
  await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 }]);
  await page.getByRole('button', { name: 'Réticule décalé' }).click();
  await chooseTool(page, /^Ligne/);
  const a = await toScreen(page, 0, 500), b = await toScreen(page, 1000, 500);
  const cdp = await page.context().newCDPSession(page);
  const pen = (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', p: { x: number; y: number }) =>
    cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' });
  await pen('mousePressed', a);
  for (let i = 1; i <= 8; i++) await pen('mouseMoved', { x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 });
  await pen('mouseReleased', b);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  await expect(page.getByTestId('loupe')).toHaveCount(0);
  const line = (await currentObjects(page))[1] as { x1: number; y1: number; x2: number; y2: number };
  const k = await scale(page);
  for (const [v, t] of [[line.x1, 0], [line.y1, 500], [line.x2, 1000], [line.y2, 500]]) expect(Math.abs(v - t) * k).toBeLessThanOrEqual(1);
});

/** Attend que le service worker soit actif (page et fichiers de l'application en cache dès la première visite). */
async function swReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
}

async function drawLine(page: Page, a: string, b: string) {
  await chooseTool(page, /^Ligne/);
  const point = page.getByLabel('Point précis');
  for (const p of [a, b]) { await point.fill(p); await point.press('Enter'); }
}

test('lot 7.2 — hors ligne : dessiner, recharger, retrouver', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'bureau', 'recette du service worker sur un navigateur');
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  // Première visite : aucun rechargement de plus n'est nécessaire avant de couper le réseau.
  await swReady(page);
  await drawLine(page, '0;0', '1000;0');
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);

  // Réseau coupé : l'atelier se recharge depuis le cache et retrouve le dessin.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.getByTestId('hors-ligne')).toBeVisible();
  expect(await currentObjects(page)).toHaveLength(1);

  // Dessiner hors ligne, recharger encore : tout est là.
  await drawLine(page, '0;500', '1000;500');
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);

  // Retour du réseau : l'indication disparaît.
  await context.setOffline(false);
  await expect(page.getByTestId('hors-ligne')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('lot 7.2 — reprise : un enregistrement que le stockage local a manqué est repris d’IndexedDB', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, []);
  // Stockage local plein : la copie IndexedDB reçoit seule le nouveau trait, sans alerte.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await drawLine(page, '0;0', '1000;0');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('stockage-plein')).toHaveCount(0);
  expect(await currentObjects(page)).toHaveLength(0); // le stockage local n'a pas été mis à jour
  // Rechargement (stockage local de nouveau disponible) : le trait est repris d'IndexedDB.
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(1);
});

