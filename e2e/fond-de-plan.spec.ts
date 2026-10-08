import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { chooseTool, currentObjects, openAtelier, tapModel, toScreen } from './helpers';

const fixture = (name: string) => join(process.cwd(), 'e2e', 'fixtures', name);
type Underlay = { id: string; kind: 'underlay'; x: number; y: number; w: number; h: number; locked?: boolean; assetId: string };
const underlay = async (page: Page) => (await currentObjects(page)).find(o => o.kind === 'underlay') as unknown as Underlay;

test('lot 6.2 — fond de plan calé par deux points : distance mesurée = distance réelle ± 0,5 %', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await page.locator('input[aria-label="Fichier du fond de plan"]').setInputFiles(fixture('fond-de-plan.png'));
  await expect.poll(async () => (await underlay(page))?.w).toBeCloseTo((1000 * 25.4) / 96, 3);
  await expect(page.getByTestId('canvas').locator('g[data-fond] image')).toHaveCount(1);
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();

  // Repères de l'image : pixels (100, 100) et (900, 100), soit 800 px d'écart = 8 000 mm réels.
  const u0 = await underlay(page);
  const at = (px: number, py: number) => ({ x: u0.x + (px / 1000) * u0.w, y: u0.y + (py / 200) * u0.h });
  await chooseTool(page, /^Caler le fond/);
  page.once('dialog', d => d.accept('8000'));
  await tapModel(page, info, at(100, 100).x, at(100, 100).y);
  await tapModel(page, info, at(900, 100).x, at(900, 100).y);
  await expect.poll(async () => (await underlay(page)).w).toBeGreaterThan(5000);
  const u1 = await underlay(page);
  const measured = (800 / 1000) * u1.w;
  expect(Math.abs(measured - 8000) / 8000).toBeLessThan(0.005);
  expect(errors).toEqual([]);
});

test('lot 6.2 — fond de plan verrouillé : ni désignable ni déplaçable', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'inspecteur en colonne : recette bureau');
  await openAtelier(page);
  await page.locator('input[aria-label="Fichier du fond de plan"]').setInputFiles(fixture('fond-de-plan.png'));
  await expect.poll(async () => (await underlay(page))?.kind).toBe('underlay');
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await page.getByRole('button', { name: 'Verrouiller le fond' }).click();
  expect((await underlay(page)).locked).toBe(true);
  await chooseTool(page, /^Sélection/);
  const u = await underlay(page);
  await page.keyboard.press('Escape');
  await tapModel(page, info, u.x + u.w / 2, u.y + u.h / 2);
  await page.keyboard.press('Shift+ArrowRight');
  const after = await underlay(page);
  expect([after.x, after.y]).toEqual([u.x, u.y]);
});

test('lot 6.2 — fond de plan PDF : première page à sa taille réelle', async ({ page }) => {
  await openAtelier(page);
  await page.locator('input[aria-label="Fichier du fond de plan"]').setInputFiles(fixture('fond-de-plan.pdf'));
  // Page de 1 000 × 200 points : 352,78 × 70,56 mm.
  await expect.poll(async () => (await underlay(page))?.w, { timeout: 15000 }).toBeCloseTo((1000 * 25.4) / 72, 2);
  const asset = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return Object.values(s.assets as Record<string, { source: string; dataUrl: string }>)[0]; });
  expect(asset.source).toBe('pdf');
  expect(asset.dataUrl.startsWith('data:image/')).toBe(true);
});

test('lot 6.2 — une fenêtre de sélection ne prend pas le fond de plan', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'sélection par fenêtre à la souris');
  await openAtelier(page);
  await page.locator('input[aria-label="Fichier du fond de plan"]').setInputFiles(fixture('fond-de-plan.png'));
  await expect.poll(async () => (await underlay(page))?.kind).toBe('underlay');
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await chooseTool(page, /^Sélection/);
  const u = await underlay(page);
  // Fenêtre tirée sur le fond de la zone, autour de toute l'image.
  const a = await toScreen(page, u.x - u.w * 0.04, u.y - u.h * 0.3);
  const b = await toScreen(page, u.x + u.w * 1.04, u.y + u.h * 1.3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  // Rien n'est sélectionné : Suppr ne retire pas le fond.
  await page.keyboard.press('Delete');
  expect((await currentObjects(page)).filter(o => o.kind === 'underlay')).toHaveLength(1);
});

test('lot 6.2 — stockage du navigateur plein : l’échec d’enregistrement est signalé', async ({ page }) => {
  await openAtelier(page);
  await expect(page.getByTestId('stockage-plein')).toHaveCount(0);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await chooseTool(page, /^Ligne/);
  const point = page.getByLabel('Point précis');
  for (const p of ['0;0', '1000;0']) { await point.fill(p); await point.press('Enter'); }
  await expect(page.getByTestId('stockage-plein')).toBeVisible();
});
