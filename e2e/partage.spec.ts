import { expect, test } from '@playwright/test';

// Lot 8.4 — invitation par lien : sans compte connecté (la recette n'a pas de serveur), le jeton est
// retiré de l'adresse, gardé pour l'onglet, et la connexion est demandée.
test('lot 8.4 — lien d’invitation reçu hors connexion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?partage=jeton-de-recette-0123456789');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.getByText('Invitation reçue : connectez-vous pour ouvrir le projet partagé.')).toBeVisible();
  await expect(page.getByText('Projets cloud', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('partage')).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('drawall-partage-en-attente'))).toBe('jeton-de-recette-0123456789');
  // Le panneau fermé ne se rouvre pas de lui-même.
  await page.getByRole('button', { name: 'Fermer' }).first().click();
  await page.waitForTimeout(500);
  await expect(page.getByText('Projets cloud', { exact: true })).toBeHidden();
  expect(errors).toEqual([]);
});
