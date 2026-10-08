import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

/** Volume affiché par le panneau (mm³, calculé par le noyau OCCT). */
const shownVolume = async (page: Page) => {
  const el = page.getByTestId('solide-volume');
  await expect(el).toHaveAttribute('data-volume', /\d/, { timeout: 90_000 });
  return Number(await el.getAttribute('data-volume'));
};
const rel = (a: number, b: number) => Math.abs(a - b) / b;

async function extrudeAt(page: Page, info: TestInfo, x: number, y: number, height: string) {
  await tapModel(page, info, x, y);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  await page.getByRole('button', { name: /^Solides \(extrusion/ }).click();
  if (isPhone(info)) await page.keyboard.press('Escape');
  const panel = page.getByRole('dialog', { name: 'Solides' });
  await panel.getByLabel('Hauteur d’extrusion (mm)').fill(height);
  await panel.getByRole('button', { name: 'Extruder' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Extrusion créée', { timeout: 90_000 });
  return panel;
}

test('lot 15.2 — extrusion d’un contour fermé, volume calculé par le noyau ; contour ouvert refusé', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 },
    { id: 'OBJ-0002', kind: 'polyline', points: [2000, 0, 3000, 0, 3000, 500] },
  ]);
  const panel = await extrudeAt(page, info, 500, 0, '300');
  // 1 000 × 500 × 300 mm = 0,15 m³.
  await expect(panel.getByTestId('solides-message')).toHaveText('Extrusion créée — volume 0,15 m³.');
  expect(rel(await shownVolume(page), 1.5e8)).toBeLessThan(1e-9);
  const solids = (await currentObjects(page)).filter(o => o.kind === 'solid');
  expect(solids).toMatchObject([{ recipe: { op: 'extrude', height: 300, profile: [[0, 0], [1000, 0], [1000, 500], [0, 500]] } }]);
  await expect(page.locator(`[data-solide="${solids[0].id}"]`)).toHaveCount(1);
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();

  // Polyligne ouverte : pas de bouton Solides dans l'inspecteur, rien n'est créé.
  await tapModel(page, info, 2500, 0);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  await expect(page.getByRole('button', { name: /^Solides \(extrusion/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('lot 15.2 — différence de deux solides, perçage traversant : volumes de référence', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'désignation multiple à la souris (Maj + clic)');
  test.setTimeout(180_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 1000 },
    { id: 'OBJ-0002', kind: 'rect', x: 500, y: 500, w: 1000, h: 1000 },
  ]);
  let panel = await extrudeAt(page, info, 500, 0, '300');
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();
  panel = await extrudeAt(page, info, 1500, 1000, '300');
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();
  const [a, b] = (await currentObjects(page)).filter(o => o.kind === 'solid');

  // Le premier désigné reste ; le second est retiré de lui.
  await tapModel(page, info, 0, 500);
  await page.keyboard.down('Shift');
  await tapModel(page, info, 1500, 1000);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('solides 3d');
  await page.getByText('Solides 3D', { exact: true }).click();
  panel = page.getByRole('dialog', { name: 'Solides' });
  await panel.getByRole('button', { name: 'Différence (1er − 2e)' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText('Différence faite — volume 0,225 m³.', { timeout: 90_000 });
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'solid').map(o => o.id)).toEqual([a.id]);
  // La partie retirée est tracée en interrompu.
  await expect(page.locator(`[data-solide="${a.id}"] [stroke-dasharray]`)).toHaveCount(1);
  expect(b.id).not.toEqual(a.id);

  // Perçage Ø 100 traversant au point (250 ; 250).
  await panel.getByLabel('X du perçage (mm)').fill('250');
  await panel.getByLabel('Y du perçage (mm)').fill('250');
  await panel.getByLabel('Diamètre du perçage (mm)').fill('100');
  await panel.getByRole('button', { name: 'Percer' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Perçage fait', { timeout: 90_000 });
  await expect(panel.getByTestId('solide-volume')).toContainText('extrusion → extrusion → différence → perçage');
  expect(rel(await shownVolume(page), 750000 * 300 - Math.PI * 50 * 50 * 300)).toBeLessThan(1e-9);

  // Point hors du solide : refus en clair, rien ne change.
  await panel.getByLabel('X du perçage (mm)').fill('5000');
  await panel.getByRole('button', { name: 'Percer' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText('Perçage : le point est hors de l’emprise du solide.');

  // Le solide apparaît dans la vue 3D, maillé par le noyau.
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();
  await page.getByRole('button', { name: 'Vue 3D', exact: true }).click();
  const view = page.getByRole('dialog', { name: 'Vue 3D' });
  await expect(view.getByTestId('vue3d-contenu')).toHaveText('1 solide', { timeout: 90_000 });
  await expect(view).toHaveAttribute('data-trame-p95', /^\d+\.\d\d$/);
  expect(errors).toEqual([]);
});

test('lot 15.3 — balayage (Follow Me) : profil le long d’une polyligne à angle vif, volume = aire × longueur', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'désignation multiple à la souris (Maj + clic)');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 50 },
    { id: 'OBJ-0002', kind: 'polyline', points: [1000, 1000, 2000, 1000, 2000, 1500] },
  ]);
  // Le profil d'abord, le trajet ensuite.
  await tapModel(page, info, 50, 0);
  await page.keyboard.down('Shift');
  await tapModel(page, info, 1500, 1000);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('solides 3d');
  await page.getByText('Solides 3D', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Solides' });
  await panel.getByRole('button', { name: 'Balayer' }).click();
  // 100 × 50 mm sur 1 500 mm de trajet : 0,0075 m³.
  await expect(panel.getByTestId('solides-message')).toHaveText(/^Balayage créé \(trajet de 1\s500 mm\) — volume 0,0075 m³\.$/, { timeout: 90_000 });
  const solid = (await currentObjects(page)).find(o => o.kind === 'solid')!;
  expect(solid.recipe).toMatchObject({ op: 'sweep', profile: [[-50, 50], [50, 50], [50, 0], [-50, 0]] });
  expect(rel(await shownVolume(page), 5000 * 1500)).toBeLessThan(1e-9);
  // En plan, la trace du balayage est son trajet.
  await expect(page.locator(`[data-solide="${solid.id}"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('lot 15.4 — lissage par deux sections : tronc de pyramide, sections retrouvées à 10⁻⁶ mm', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'désignation multiple à la souris (Maj + clic)');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 1000 },
    { id: 'OBJ-0002', kind: 'rect', x: 250, y: 250, w: 500, h: 500 },
  ]);
  await tapModel(page, info, 500, 0);
  await page.keyboard.down('Shift');
  await tapModel(page, info, 500, 250);
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('solides 3d');
  await page.getByText('Solides 3D', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Solides' });
  // Une cote par section : sinon, refus en clair.
  await panel.getByLabel('Cotes des sections (mm, séparées par ;)').fill('0');
  await panel.getByRole('button', { name: 'Lisser' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText('Lissage : 2 cotes attendues (une par section), 1 données.');
  await panel.getByLabel('Cotes des sections (mm, séparées par ;)').fill('0 ; 1000');
  await panel.getByRole('button', { name: 'Lisser' }).click();
  // h/3 (A1 + A2 + √(A1·A2)) = 1 000/3 × (1 + 0,25 + 0,5) m² ≈ 0,583333 m³.
  await expect(panel.getByTestId('solides-message')).toHaveText('Lissage créé par 2 sections — sections retrouvées à 10⁻⁶ mm — volume 0,583333 m³.', { timeout: 90_000 });
  expect(rel(await shownVolume(page), (1000 / 3) * 1.75e6)).toBeLessThan(1e-9);
  expect((await currentObjects(page)).find(o => o.kind === 'solid')!.recipe).toMatchObject({ op: 'loft', ruled: true, sections: [{ z: 0 }, { z: 1000 }] });
  expect(errors).toEqual([]);
});
