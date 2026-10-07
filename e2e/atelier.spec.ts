import { expect, test } from '@playwright/test';
import { canvasPoint, chooseTool, isPhone, objectCount, openAtelier, touch, zoomPercent } from './helpers';

test.describe('Atelier — socle', () => {
  test('se charge sans erreur ni débordement horizontal', async ({ page }) => {
    const errors = await openAtelier(page);
    await expect(page.getByText('DRAWALL')).toBeVisible();
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll).toBeLessThanOrEqual(inner);
    expect(await objectCount(page)).toBe(6);
    expect(errors).toEqual([]);
  });

  test('trace une ligne au geste (souris ou doigt)', async ({ page }, info) => {
    const errors = await openAtelier(page);
    const before = await objectCount(page);
    await chooseTool(page, /^Ligne/);
    const from = await canvasPoint(page, 0.25, 0.8);
    const to = await canvasPoint(page, 0.75, 0.8);
    if (isPhone(info)) {
      await (await touch(page)).drag(from, to);
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.mouse.up();
    }
    await expect.poll(() => objectCount(page)).toBe(before + 1);
    expect(errors).toEqual([]);
  });

  test('une tape avec l’outil Ligne ne crée rien', async ({ page }, info) => {
    await openAtelier(page);
    const before = await objectCount(page);
    await chooseTool(page, /^Ligne/);
    const at = await canvasPoint(page, 0.5, 0.85);
    if (isPhone(info)) await (await touch(page)).tap(at);
    else await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(200);
    expect(await objectCount(page)).toBe(before);
  });
});

test.describe('Atelier — téléphone', () => {
  test.skip(({ isMobile }) => !isMobile, 'gestes et disposition propres au téléphone');

  test('le pincement zoome sans modifier le dessin', async ({ page }) => {
    await openAtelier(page);
    await chooseTool(page, /^Bloc/).catch(() => undefined);
    const before = await objectCount(page);
    const zoomBefore = await zoomPercent(page);
    await (await touch(page)).pinch(await canvasPoint(page, 0.5, 0.5));
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(zoomBefore);
    expect(await objectCount(page)).toBe(before);
  });

  test('le navigateur du projet est plié par défaut et se déplie', async ({ page }) => {
    await openAtelier(page);
    const expand = page.getByRole('button', { name: 'Déplier le navigateur du projet' });
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(page.getByText('Mur porteur A')).toBeVisible();
    await page.getByRole('button', { name: 'Plier le navigateur du projet' }).click();
    await expect(expand).toBeVisible();
  });

  test('le dessin est cadré à l’ouverture', async ({ page }) => {
    await openAtelier(page);
    expect(await zoomPercent(page)).toBeGreaterThanOrEqual(25);
  });
});

test.describe('Atelier — ordinateur', () => {
  test.skip(({ isMobile }) => isMobile, 'disposition propre à l’ordinateur');

  test('le navigateur du projet est déplié par défaut et se plie', async ({ page }) => {
    await openAtelier(page);
    await expect(page.getByText('Mur porteur A')).toBeVisible();
    await page.getByRole('button', { name: 'Plier le navigateur du projet' }).click();
    await expect(page.getByRole('button', { name: 'Déplier le navigateur du projet' })).toBeVisible();
  });
});
