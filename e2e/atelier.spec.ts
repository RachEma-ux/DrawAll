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
    await chooseTool(page, /^Bloc/);
    const before = await objectCount(page);
    const zoomBefore = await zoomPercent(page);
    await (await touch(page)).pinch(await canvasPoint(page, 0.5, 0.5));
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(zoomBefore);
    expect(await objectCount(page)).toBe(before);
  });

  test('le navigateur du projet est plié par défaut et se déplie', async ({ page }) => {
    await openAtelier(page);
    const expand = page.getByRole('button', { name: 'Déplier le navigateur du projet', exact: true });
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(page.getByText('Mur porteur A')).toBeVisible();
    await page.getByRole('button', { name: 'Plier le navigateur du projet', exact: true }).click();
    await expect(expand).toBeVisible();
  });

  test('le dessin est cadré à l’ouverture', async ({ page }) => {
    await openAtelier(page);
    expect(await zoomPercent(page)).toBeGreaterThanOrEqual(25);
  });

  test('le navigateur déplié passe par-dessus le canevas sans le réduire', async ({ page }) => {
    await openAtelier(page);
    const before = (await page.getByTestId('canvas').boundingBox())!.width;
    await page.getByRole('button', { name: 'Déplier le navigateur du projet', exact: true }).click();
    await expect(page.getByTestId('navigator-overlay')).toBeVisible();
    const after = (await page.getByTestId('canvas').boundingBox())!.width;
    expect(after).toBeGreaterThanOrEqual(before * 0.9);
    const viewport = page.viewportSize()!.width;
    expect(after).toBeGreaterThanOrEqual(viewport * 0.85);
  });

  test('« Plus » reste accessible sur un écran de 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openAtelier(page);
    const plus = page.getByRole('button', { name: 'Plus d’outils' });
    const box = (await plus.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await plus.click();
    await expect(page.getByTestId('more-tools')).toBeVisible();
  });

  test('les outils secondaires sont dans « Plus »', async ({ page }) => {
    await openAtelier(page);
    for (const name of [/^Sélection/, /^Ligne/, /^Rectangle/, /^Cercle/, /^Polyligne/]) {
      await expect(page.getByRole('button', { name }).first()).toBeVisible();
    }
    await chooseTool(page, /^Mesure/);
    await expect(page.getByRole('button', { name: 'Plus d’outils' })).toContainText('Mesure');
    await page.getByRole('button', { name: 'Plus d’outils' }).click();
    await page.getByTestId('more-tools').getByRole('button', { name: /^Ortho/ }).click();
    await expect(page.getByTestId('more-tools').getByRole('button', { name: /^Ortho/ })).toContainText('inactif');
  });
});

test.describe('Atelier — cadrage', () => {
  test('« Ajuster » cadre les objets visibles, calque masqué compris', async ({ page }) => {
    await openAtelier(page);
    if (await page.getByRole('button', { name: 'Déplier le navigateur du projet', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Déplier le navigateur du projet', exact: true }).click();
    }
    // Masquer le calque « Équipements » (bouton VIS de sa ligne).
    await page.getByText('Équipements', { exact: true }).locator('xpath=..').getByRole('button', { name: /^VIS$/ }).click();
    if (await page.getByRole('button', { name: 'Plier le navigateur du projet', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Plier le navigateur du projet', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Ajuster' }).click();
    expect(await zoomPercent(page)).toBeGreaterThanOrEqual(25);
  });
});

test.describe('Atelier — ordinateur', () => {
  test.skip(({ isMobile }) => isMobile, 'disposition propre à l’ordinateur');

  test('le navigateur du projet est déplié par défaut et se plie', async ({ page }) => {
    await openAtelier(page);
    await expect(page.getByText('Mur porteur A')).toBeVisible();
    await page.getByRole('button', { name: 'Plier le navigateur du projet', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Déplier le navigateur du projet', exact: true })).toBeVisible();
  });
});
