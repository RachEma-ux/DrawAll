import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

test('lot 12.3 — classe IFC et jeux de propriétés éditables dans l’inspecteur, conservés au rechargement', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' }]);
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 2500, 0);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();

  // Classe par défaut selon le type d'objet, puis jeu de propriétés et deux propriétés typées.
  await expect(page.getByLabel('Classe IFC')).toHaveValue('');
  await expect(page.getByLabel('Classe IFC').locator('option').first()).toHaveText('Par défaut (IfcWall)');
  await page.getByLabel('Nom du nouveau jeu de propriétés').fill('Pset_WallCommon');
  await page.getByRole('button', { name: 'Ajouter le jeu de propriétés' }).click();
  await page.getByLabel('Nom de la propriété').fill('IsExternal');
  await page.getByLabel('Type de la valeur').selectOption('booleen');
  await page.getByLabel('Valeur de la propriété').fill('vrai');
  await page.getByRole('button', { name: 'Ajouter la propriété' }).click();
  await page.getByLabel('Nom de la propriété').fill('ThermalTransmittance');
  await page.getByLabel('Type de la valeur').selectOption('nombre');
  await page.getByLabel('Valeur de la propriété').fill('0,24');
  await page.getByLabel('Unité de la propriété').selectOption('W/(m²·K)');
  await page.getByRole('button', { name: 'Ajouter la propriété' }).click();
  await expect(page.locator('[data-propriete="Pset_WallCommon.ThermalTransmittance"]')).toContainText('0,24 W/(m²·K)');
  // Saisie invalide : refusée avec sa raison.
  await page.getByLabel('Nom de la propriété').fill('LoadBearing');
  await page.getByLabel('Type de la valeur').selectOption('booleen');
  await page.getByLabel('Valeur de la propriété').fill('peut-être');
  await page.getByRole('button', { name: 'Ajouter la propriété' }).click();
  await expect(page.getByTestId('proprietes-erreur')).toHaveText('Valeur booléenne attendue (vrai ou faux).');

  await page.getByLabel('Classe IFC').selectOption('IfcCurtainWall');
  await expect.poll(async () => (await currentObjects(page))[0]).toMatchObject({
    ifcClass: 'IfcCurtainWall',
    psets: [{ name: 'Pset_WallCommon', props: [{ name: 'IsExternal', value: true }, { name: 'ThermalTransmittance', value: 0.24, unit: 'W/(m²·K)' }] }],
  });

  // Rechargement : relu depuis l'enregistrement local.
  await page.reload();
  await expect.poll(async () => (await currentObjects(page))[0]?.psets).toEqual([{ name: 'Pset_WallCommon', props: [{ name: 'IsExternal', value: true }, { name: 'ThermalTransmittance', value: 0.24, unit: 'W/(m²·K)' }] }]);
  expect(errors).toEqual([]);
});
