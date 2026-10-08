// Parcours de preuve final (feuille de route §6) : un même projet, de bout en bout.
// Logement de deux pièces et platine Ø 12,5 H7 ; A3 au 1:50 et détail 1:1 avec cartouche et indice ;
// PDF et DXF exportés puis relus ; DXF client réimporté ; relevé repris sur téléphone hors ligne
// (le projet passe par le paquet natif) ; restauration finale depuis le paquet.
// Le partage et les commentaires sont prouvés au niveau de l'API (api/projects-router.test.ts) :
// la recette navigateur n'a ni serveur ni compte.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices, expect, test, type Page } from '@playwright/test';
import { canvasPoint, chooseTool, currentObjects, loadObjects, openAtelier, tapModel, touch } from './helpers';

const point = (page: Page) => page.getByLabel('Point précis');
async function type(page: Page, ...points: string[]) {
  for (const p of points) { await point(page).fill(p); await point(page).press('Enter'); }
}
async function setField(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true });
  await f.fill(value);
  await f.press('Enter');
}
function answer(page: Page, values: string[]) {
  const queue = [...values];
  const handler = (d: import('@playwright/test').Dialog) => {
    const v = queue.shift();
    if (queue.length === 0) page.off('dialog', handler);
    void (d.type() === 'confirm' || d.type() === 'alert' ? d.accept() : d.accept(v));
  };
  page.on('dialog', handler);
}
async function openNavigator(page: Page) {
  const expand = page.getByRole('button', { name: 'Déplier le navigateur du projet', exact: true });
  if (await expand.isVisible().catch(() => false)) await expand.click();
}
async function exportPackage(page: Page) {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('exporter le paquet');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Exporter le paquet du projet').click()]);
  const path = (await download.path())!;
  return { path, text: readFileSync(path, 'utf8') };
}
async function restorePackage(page: Page, path: string) {
  page.once('dialog', d => d.accept());
  await page.locator('input[aria-label="Fichier du paquet DrawAll"]').setInputFiles(path);
}
const kinds = (objs: Record<string, unknown>[]) => objs.reduce<Record<string, number>>((a, o) => ({ ...a, [String(o.kind)]: (a[String(o.kind)] ?? 0) + 1 }), {});

test('parcours de preuve final — un projet, du dessin à la restauration', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'bureau', 'le parcours ouvre lui-même son téléphone');
  test.setTimeout(180_000);
  const errors = await openAtelier(page);
  await loadObjects(page, []);

  // 1. Logement : quatre murs, une cloison, deux portes, deux pièces.
  await chooseTool(page, /^Mur/);
  await page.getByLabel('Épaisseur du mur (mm)').fill('200');
  await type(page, '0;0', '8000;0', '8000;5000', '0;5000', '0;0');
  await page.getByRole('button', { name: 'Terminer' }).click();
  await type(page, '4000;0', '4000;5000');
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect.poll(async () => kinds(await currentObjects(page)).wall).toBe(5);
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await chooseTool(page, /^Ouverture/);
  await page.getByLabel('Largeur de l’ouverture (mm)').fill('900');
  await tapModel(page, info, 4000, 3600);
  // Mur bas : le haut du canevas est couvert par les paramètres de l'outil.
  await tapModel(page, info, 2000, 5000);
  await expect.poll(async () => kinds(await currentObjects(page)).opening).toBe(2);
  await chooseTool(page, /^Pièce/);
  page.once('dialog', d => d.accept('Séjour'));
  await tapModel(page, info, 2000, 2500);
  page.once('dialog', d => d.accept('Chambre'));
  await tapModel(page, info, 6000, 2500);
  await expect.poll(async () => kinds(await currentObjects(page)).room).toBe(2);
  // SIA 416, surfaces nettes : (4 − 0,2) × (5 − 0,2) = 18,24 m² de part et d'autre de la cloison.
  await expect(page.getByTestId('canvas').locator('g[data-piece] text[data-surface]')).toHaveText(['18,24 m²', '18,24 m²']);

  // Niveau : l'étage copié à +2,80 m, puis retour au rez-de-chaussée.
  await openNavigator(page);
  answer(page, ['Étage 1', '2,80']);
  await page.getByRole('button', { name: 'Copier le niveau Rez-de-chaussée' }).click();
  await expect.poll(async () => kinds(await currentObjects(page)).wall).toBe(10);
  await page.getByRole('button', { name: 'Afficher le niveau Rez-de-chaussée' }).click();

  // 2. Platine : alésage Ø 12,5 mm coté H7.
  await chooseTool(page, /^Cercle/);
  await type(page, '20000;0', '20006,25;0');
  await expect.poll(async () => kinds(await currentObjects(page)).circle).toBe(1);
  await chooseTool(page, /^Cote$/);
  await type(page, '20006,25;0');
  await expect.poll(async () => kinds(await currentObjects(page)).dimension).toBe(1);
  const dim = (await currentObjects(page)).find(o => o.kind === 'dimension')!;
  await chooseTool(page, /^Sélection/);
  await openNavigator(page);
  // La cote créée est déjà sélectionnée ; un clic dans le navigateur la désélectionnerait.
  if (!(await page.getByLabel('Tolérance de la cote').isVisible())) await page.getByRole('button', { name: new RegExp(`^${dim.id} `) }).click();
  await page.getByLabel('Tolérance de la cote').selectOption('classe');
  await expect(page.getByTestId('tolerance-iso')).toHaveText('Écarts +0,018 / 0 mm (IT7)');
  await expect(page.getByTestId('canvas').getByText('Ø 12,5 H7 (+0,018/0) mm')).toBeVisible();

  // 3. Feuille A3 : plan au 1:50, détail de la platine au 1:1, cartouche et indice A.
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await expect(page.getByLabel('Format')).toHaveValue('A3');
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByLabel('Échelle de la fenêtre').selectOption('1:50');
  await setField(page, 'Largeur', '190');
  await setField(page, 'Centre X', '4000');
  await setField(page, 'Centre Y', '2500');
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByLabel('Échelle de la fenêtre').selectOption('1:1');
  await setField(page, 'Position X', '220');
  await setField(page, 'Largeur', '120');
  await setField(page, 'Centre X', '20000');
  await setField(page, 'Centre Y', '0');
  await expect(page.getByTestId('sheet').getByText('FEN-0001 · 1:50')).toBeVisible();
  await expect(page.getByTestId('sheet').getByText('FEN-0002 · 1:1')).toBeVisible();
  const cartouche = page.getByRole('region', { name: 'Cartouche' });
  await cartouche.getByRole('button', { name: 'Ajouter' }).click();
  await setField(page, 'Cartouche — Projet', 'Logement et platine');
  await setField(page, 'Cartouche — Titre', 'Plan du rez et détail');
  page.once('dialog', d => d.accept('Indice A — dépôt'));
  await cartouche.getByRole('button', { name: 'Émettre l’indice A' }).click();
  await expect(page.getByTestId('cartouche').locator('[data-champ="index"]')).toHaveText(/IndiceA$/);

  // 4. PDF exporté et relu : A3 paysage exacte ; l'alésage Ø 12,5 mesure 12,5 mm sur la feuille au 1:1.
  const [pdfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en PDF' }).click()]);
  const pdf = readFileSync((await pdfDownload.path())!, 'latin1');
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf)!;
  expect(Number(box[1]) * 25.4 / 72).toBeCloseTo(420, 1);
  expect(Number(box[2]) * 25.4 / 72).toBeCloseTo(297, 1);
  const segs = [...pdf.matchAll(/(-?[\d.]+) (-?[\d.]+) m (-?[\d.]+) (-?[\d.]+) l S/g)].map(m => Math.hypot(+m[3] - +m[1], +m[4] - +m[2]) * 25.4 / 72);
  expect(segs.some(l => Math.abs(l - 164) <= 0.1)).toBe(true); // façade de 8,20 m au 1:50
  expect(segs.some(l => Math.abs(l - 12.5) <= 0.05)).toBe(true); // ligne de cote Ø 12,5 au 1:1

  // 5. DXF exporté et relu.
  await page.getByRole('button', { name: 'Atelier', exact: true }).click();
  const acceptAll = (d: import('@playwright/test').Dialog) => void d.accept();
  page.on('dialog', acceptAll);
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  const [dxfDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DXF', exact: true }).click()]);
  const dxf = readFileSync((await dxfDownload.path())!, 'utf8');
  expect(dxf.match(/\nCIRCLE\n/g)).toHaveLength(1);
  expect(dxf).toMatch(/\n40\n6\.25\n/); // rayon de l'alésage, en mm
  expect(dxf).toContain('S\\U+00E9jour'); // pièce : étiquette nom (caractères hors ASCII en \U+XXXX)
  expect(dxf).toContain('18,24 m');

  // 6. DXF client réimporté dans le même projet.
  const drawn = await currentObjects(page);
  const before = drawn.length;
  let report = '';
  const readReport = (d: import('@playwright/test').Dialog) => { report = d.message(); };
  page.on('dialog', readReport);
  await page.locator('input[type="file"][accept*=".dxf"]').setInputFiles(join(process.cwd(), 'src', 'lib', '__fixtures__', 'dxf', 'blocs.dxf'));
  await expect.poll(() => report).toContain('Import DXF — blocs.dxf');
  expect(report).toContain('Blocs : 2 occurrence(s) conservée(s)');
  page.off('dialog', acceptAll);
  page.off('dialog', readReport);
  await expect.poll(async () => (await currentObjects(page)).length).toBeGreaterThan(before);
  const imported = await currentObjects(page);
  // Le DXF client s'ajoute : tout le dessin du projet est conservé (deux niveaux de murs, portes, pièces, platine).
  expect(kinds(drawn)).toEqual({ wall: 10, opening: 4, room: 4, circle: 1, dimension: 1 });
  expect(imported.filter(o => drawn.some(d => d.id === o.id))).toEqual(drawn);

  // 7. Relevé sur téléphone, hors ligne : le projet y passe par le paquet natif.
  const desk = await exportPackage(page);
  const phone = await browser.newContext({ ...devices['Pixel 7'], baseURL: 'http://localhost:4173' });
  const mobile = await phone.newPage();
  const phoneErrors: string[] = [];
  mobile.on('pageerror', e => phoneErrors.push(e.message));
  await mobile.goto('/');
  await expect(mobile.getByTestId('canvas')).toBeVisible();
  await mobile.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await restorePackage(mobile, desk.path);
  await expect.poll(async () => (await currentObjects(mobile)).length).toBe(imported.length);
  await phone.setOffline(true);
  await mobile.reload();
  await expect(mobile.getByTestId('hors-ligne')).toBeVisible();
  await mobile.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await chooseTool(mobile, /^Note/);
  mobile.once('dialog', d => d.accept('Relevé : allège à vérifier'));
  // Note posée au doigt sur un point libre du canevas (le cadrage inclut aussi le DXF importé).
  await (await touch(mobile)).tap(await canvasPoint(mobile, 0.6, 0.5));
  await expect.poll(async () => (await currentObjects(mobile)).filter(o => o.kind === 'note').length).toBe(1);
  await mobile.reload();
  await expect(mobile.getByTestId('canvas')).toBeVisible();
  expect((await currentObjects(mobile)).find(o => o.kind === 'note')).toMatchObject({ text: 'Relevé : allège à vérifier' });
  const field = await exportPackage(mobile);
  await phone.setOffline(false);
  expect(phoneErrors).toEqual([]);

  // 8. Retour au bureau : restauration depuis le paquet du terrain, puis réexport à l'identique.
  await restorePackage(page, field.path);
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'note').length).toBe(1);
  expect((await currentObjects(page)).length).toBe(imported.length + 1);
  expect((await exportPackage(page)).text).toBe(field.text);
  await phone.close(); // après la restauration : le fichier téléchargé disparaît avec son contexte
  expect(errors).toEqual([]);
});
