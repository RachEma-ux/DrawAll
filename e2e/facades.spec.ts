import { expect, test } from '@playwright/test';
import { currentObjects, loadObjects, openAtelier } from './helpers';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, kind: 'wall', layerId: 'LAY-0001', x1, y1, x2, y2, thickness: 200, justification: 'axe', classification: 'architecture', height: 2500 });

test('lot 16.2 — façade sud et coupe A–A générées depuis le modèle 3D, suivies, posées sur une feuille', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [
    wall('OBJ-0001', 0, 0, 5000, 0), wall('OBJ-0002', 5000, 0, 5000, 4000), wall('OBJ-0003', 5000, 4000, 0, 4000), wall('OBJ-0004', 0, 4000, 0, 0),
    { id: 'OBJ-0005', kind: 'section', layerId: 'LAY-0003', x1: -1000, y1: 2000, x2: 6000, y2: 2000, label: 'A' },
  ]);
  // Une feuille pour y poser les vues.
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Atelier', exact: true }).click();

  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('façades');
  await page.getByText('Façades et coupes', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Façades et coupes' });
  await panel.getByLabel('Façade sud').check();
  await panel.getByLabel('Coupe A–A').check();
  await panel.getByRole('button', { name: 'Générer' }).click();
  await expect(panel.getByTestId('facades-message')).toHaveText('2 vues générées sous le bâtiment.');
  await expect(page.locator('[data-projection][data-etat="prête"]')).toHaveCount(2, { timeout: 90_000 });
  const elevations = (await currentObjects(page)).filter(o => o.kind === 'elevation');
  expect(elevations).toMatchObject([{ view: 'sud' }, { view: 'coupe', markId: 'OBJ-0005' }]);
  const sud = page.locator(`[data-projection="${elevations[0].id}"]`), coupe = page.locator(`[data-projection="${elevations[1].id}"]`);
  // La coupe montre le nu intérieur du mur ouest coupé (X = 100, soit 200 mm du bord gauche du cadre) ;
  // la façade sud ne le montre pas (caché derrière le mur sud).
  const innerFace = (l: typeof sud, x0: number) => l.locator('line').evaluateAll((ls, x) => ls.some(e => Math.abs(Number(e.getAttribute('x1')) - x) < 1e-6 && Math.abs(Number(e.getAttribute('x2')) - x) < 1e-6), x0);
  expect(await innerFace(coupe, Number(elevations[1].x) + 200)).toBe(true);
  expect(await innerFace(sud, Number(elevations[0].x) + 200)).toBe(false);

  // Le modèle change (mur sud à 3 m) : la façade est recalculée.
  // Cadre ancré en haut : le pied de la façade descend de 500 mm.
  const bottom = () => sud.locator('line').evaluateAll(ls => Math.max(...ls.flatMap(l => [Number(l.getAttribute('y1')), Number(l.getAttribute('y2'))])));
  const before = await bottom();
  await page.getByRole('button', { name: 'Fermer les façades' }).click();
  // Sélection du mur sud et hauteur portée à 3 000 dans l'inspecteur.
  await page.getByRole('button', { name: 'OBJ-0001 OBJ-0001 Mur' }).click();
  await page.getByLabel('Hauteur du mur', { exact: true }).fill('3000');
  await page.getByLabel('Hauteur du mur', { exact: true }).press('Enter');
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === 'OBJ-0001')?.height).toBe(3000);
  await expect.poll(bottom, { timeout: 90_000 }).toBeCloseTo(before + 500, 6);

  // Posée sur la feuille au 1:100.
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('façades');
  await page.getByText('Façades et coupes', { exact: true }).click();
  await panel.getByLabel('Échelle de la fenêtre').selectOption('1:100');
  await panel.getByRole('button', { name: 'Poser Façade sud sur la feuille' }).click();
  await expect(panel.getByTestId('facades-message')).toContainText('Façade sud posée sur');
  const vps = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return s.versions[s.pointer].sheets[0].viewports; });
  expect(vps).toMatchObject([{ name: 'Façade sud', scale: { paper: 1, model: 100 } }]);
  expect(errors).toEqual([]);
});

test('lot 17.1 — export IFC 4.3 depuis la palette : fichier et rapport', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [
    wall('OBJ-0001', 0, 0, 5000, 0), wall('OBJ-0002', 5000, 0, 5000, 4000), wall('OBJ-0003', 5000, 4000, 0, 4000), wall('OBJ-0004', 0, 4000, 0, 0),
    { id: 'OBJ-0005', kind: 'opening', layerId: 'LAY-0001', hostId: 'OBJ-0001', type: 'fenetre', position: 2500, width: 1200, hinge: 'debut', side: 'gauche', classification: 'architecture' },
  ]);
  let report = '';
  page.on('dialog', d => { report = d.message(); d.accept().catch(() => {}); });
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('ifc');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Exporter en IFC 4.3', { exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.ifc$/);
  const { readFileSync } = await import('node:fs');
  const ifc = readFileSync((await download.path())!, 'utf8');
  expect(ifc).toContain("FILE_SCHEMA(('IFC4X3_ADD2'));");
  expect(ifc.match(/IFCWALL\(/g)).toHaveLength(4);
  await expect.poll(() => report).toContain('4 IfcWall');
  expect(report).toContain('OBJ-0005 : fenêtre sans hauteur de baie saisie');
  expect(errors).toEqual([]);
});

test('lot 17.3 — géoréférencement saisi, affiché et transmis à l’IFC', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [wall('OBJ-0001', 0, 0, 5000, 0)]);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('géoréférencement');
  await page.getByText('Géoréférencement', { exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Géoréférencement' });
  // Rien n'est proposé : sans système déclaré, l'enregistrement est impossible.
  await expect(panel.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  await panel.getByLabel('Système de coordonnées').fill('EPSG:2056');
  await panel.getByLabel('Est (E) du point de base').fill('2600000');
  await panel.getByLabel('Nord (N) du point de base').fill('1200000');
  await panel.getByLabel('Altitude du point de base').fill('432,5');
  await panel.getByLabel('Nord du quadrillage').fill('90');
  // Nord à droite du plan : le point (10 m ; 0) du dessin est 10 m au nord du point de base.
  await expect(panel.getByTestId('georef-exemple')).toContainText(/E 2\s600\s000 · N 1\s200\s010/);
  await panel.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(panel.getByTestId('georef-message')).toContainText('Géoréférencé : EPSG:2056');
  await panel.getByRole('button', { name: 'Fermer le géoréférencement' }).click();
  await page.reload();
  const state = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return s.versions[s.pointer].georef; });
  expect(state).toEqual({ crs: 'EPSG:2056', e: 2600000, n: 1200000, h: 432.5, north: 90 });
  page.on('dialog', d => { d.accept().catch(() => {}); });
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('ifc');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Exporter en IFC 4.3', { exact: true }).click()]);
  const { readFileSync } = await import('node:fs');
  const ifc = readFileSync((await download.path())!, 'utf8');
  expect(ifc).toContain("IFCPROJECTEDCRS('EPSG:2056'");
  expect(ifc).toMatch(/IFCMAPCONVERSION\(#\d+,#\d+,2600000\.,1200000\.,432\.5,/);
  expect(errors).toEqual([]);
});
