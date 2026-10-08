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

// Serveur simulé (tRPC par lots) : un compte connecté, et une réponse choisie pour `projects.join`.
async function fakeServer(page: import('@playwright/test').Page, join: () => { status: number; code: string }) {
  await page.route('**/api/trpc/**', async route => {
    const names = new URL(route.request().url()).pathname.split('/api/trpc/')[1].split(',');
    let status = 200;
    const body = names.map(name => {
      if (name === 'auth.me') return { result: { data: { json: { id: 2, name: 'Bruno', role: 'user' } } } };
      if (name === 'projects.join') {
        const r = join();
        status = r.status;
        return { error: { json: { message: r.code, code: r.status === 404 ? -32004 : -32603, data: { code: r.code, httpStatus: r.status } } } };
      }
      return { result: { data: { json: [] } } };
    });
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('lot 8.4 — une panne garde l’invitation pour réessayer ; un refus du serveur l’oublie', async ({ page }) => {
  let answer = { status: 500, code: 'INTERNAL_SERVER_ERROR' };
  await fakeServer(page, () => answer);
  await page.goto('/?partage=jeton-de-recette-0123456789');
  await expect(page.getByText('Invitation non acceptée pour l’instant (réseau ou serveur) : rechargez la page pour réessayer.')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('drawall-partage-en-attente'))).toBe('jeton-de-recette-0123456789');

  answer = { status: 404, code: 'NOT_FOUND' };
  await page.reload();
  await expect(page.getByText('Invitation inconnue, déjà utilisée ou expirée : demandez un nouveau lien.')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('drawall-partage-en-attente'))).toBeNull();
});
