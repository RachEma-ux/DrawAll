import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier } from './helpers';

// Lot 19.1 — démonstrateur réduit bâtiment–mécanique : scénario de recette de bout en bout.
// Ce n'est pas le démonstrateur complet du Concept §10 (la représentation électrique de l'armoire et
// ses raccordements relèvent du module électricité, P3).

async function palette(page: Page, search: string, title: string) {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill(search);
  await page.getByText(title, { exact: true }).click();
}

async function runScript(page: Page, code: string) {
  await palette(page, 'console de scripts', 'Console de scripts');
  const dlg = page.getByRole('dialog', { name: 'Console de scripts' });
  await dlg.getByLabel('Code du script').fill(code);
  await dlg.getByRole('button', { name: 'Exécuter' }).click();
  await expect(dlg.getByRole('log', { name: 'Sortie du script' })).toHaveAttribute('data-script', 'reussi', { timeout: 20_000 });
  await dlg.getByRole('button', { name: 'Fermer la console' }).click();
}

async function publishedPdf(page: Page, pub: string): Promise<Buffer> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-publication="${pub}"]`).getByRole('button', { name: 'PDF publié de Feuille 1' }).click()]);
  return readFileSync((await dl.path())!);
}

const BUILD = `
const { activeLayerId: L, activeLevelId } = await drawall.context();
const base = { layerId: L, hatch: 'none' };
const walls = (await drawall.objects()).filter(o => o.kind === 'wall');
for (const w of walls) await drawall.execute('updateObject', w.id, { height: 6000 });
// Mezzanine portée par quatre poteaux de 250 × 250 mm.
for (const [x, y] of [[8000, 0], [11875, 0], [8000, 3875], [11875, 3875]])
  await drawall.execute('addObject', { ...base, kind: 'column', classification: 'structure', x, y: y + 4000, section: 'rect', b: 250, h: 250 });
// Support de machine (platine 1 200 × 800 × 300 mm) et quatre ancrages scellés de 100 mm.
await drawall.execute('addObject', { ...base, kind: 'solid', classification: 'mecanique', ifcClass: 'IfcPlate', recipe: { op: 'box', x: 1200, y: 800, z: 300, at: [2000, 2000, 0] } }, 'Support de machine');
for (const [x, y] of [[2100, 2100], [3100, 2100], [2100, 2700], [3100, 2700]])
  await drawall.execute('addObject', { ...base, kind: 'solid', classification: 'mecanique', ifcClass: 'IfcMechanicalFastener', recipe: { op: 'cylinder', r: 12, h: 400, at: [x, y, -100] } }, 'Ancrage');
// Armoire implantée comme équipement mécanique : pièce type et une occurrence tournée.
const cab = await drawall.execute('addObject', { ...base, kind: 'solid', classification: 'mecanique', recipe: { op: 'box', x: 800, y: 600, z: 2000, at: [500, 7000, 0] },
  partDef: { no: 1, origin: [500, 7000, 0], angle: 0 }, psets: [{ name: 'Équipement', props: [{ name: 'Désignation', value: 'Armoire' }] }] }, 'Armoire');
await drawall.execute('addObject', { ...base, kind: 'occurrence', classification: 'mecanique', sourceId: cab, x: 5000, y: 7000, z: 0, angle: 90 }, 'Armoire 2');
// Niveaux : la mezzanine à 3 m (plancher de 200 mm), la toiture à 6 m.
await drawall.execute('addLevel', 'Mezzanine', 3000);
await drawall.execute('addObject', { ...base, kind: 'slab', classification: 'structure', points: [8000, 4000, 12000, 4000, 12000, 8000, 8000, 8000], thickness: 200 }, 'Plancher de mezzanine');
await drawall.execute('addLevel', 'Toiture', 6000);
await drawall.execute('setActiveLevelId', activeLevelId ?? 'NIV-0001');
drawall.log('atelier construit');
`;

// Dimension déterminante : la nef passe de 12 à 14 m (murs du pignon est et retours allongés).
const LENGTHEN = `
for (const w of (await drawall.objects()).filter(o => o.kind === 'wall')) {
  const patch = {};
  if (w.x1 === 12000) patch.x1 = 14000;
  if (w.x2 === 12000) patch.x2 = 14000;
  if (Object.keys(patch).length) await drawall.execute('updateObject', w.id, patch);
}`;

const moveCabinet = (dx: number) => `
const occ = (await drawall.objects()).find(o => o.kind === 'occurrence');
await drawall.execute('transform', [occ.id], { kind: 'move', dx: ${dx}, dy: 0 }, 'Déplacer l’armoire');`;

test('lot 19.1 — atelier, mezzanine, support de machine, armoire : de la conception à l’échange IFC', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  test.setTimeout(180_000);
  const errors = await openAtelier(page);
  await loadObjects(page, []);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  // 1. Nef de l'atelier par l'assistant (proposition validée, aperçue, acceptée).
  await palette(page, 'assistant', 'Assistant');
  const assistant = page.getByRole('dialog', { name: 'Assistant' });
  await assistant.getByLabel('Demande').fill('rectangle de murs 12 x 8 m épaisseur 250 mm');
  await assistant.getByRole('button', { name: 'Proposer' }).click();
  await expect(assistant.getByTestId('apercu-assistant')).toHaveAttribute('data-proposes', '4');
  await assistant.getByRole('button', { name: 'Accepter et exécuter' }).click();
  await expect(assistant.getByRole('status')).toContainText('4 opérations exécutées', { timeout: 15_000 });
  await assistant.getByRole('button', { name: 'Fermer l’assistant' }).click();

  // 2. Mezzanine, poteaux, support de machine, ancrages, armoire : par l'API de commandes (script).
  await runScript(page, BUILD);
  const all = await currentObjects(page);
  const count = (k: string) => all.filter(o => o.kind === k).length;
  expect([count('wall'), count('column'), count('solid'), count('occurrence')]).toEqual([4, 4, 6, 1]);

  // 3. Tableau des murs et nomenclature d'assemblage, calculés depuis le modèle.
  await palette(page, 'tableau des murs', 'Insérer le tableau des murs');
  await palette(page, 'nomenclature d’assemblage', 'Insérer la nomenclature d’assemblage');
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('text', { hasText: /^40,00$/ })).toHaveCount(1);
  await expect(canvas.locator('text', { hasText: /^Armoire$/ })).toHaveCount(1);

  // 4. Feuille et dossier publié.
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByRole('button', { name: 'Publier…' }).click();
  await page.getByLabel('Nom du dossier à publier').fill('Dossier atelier');
  await page.getByRole('button', { name: 'Publier la version courante' }).click();
  await expect(page.locator('[data-publication="PUB-0001"] [data-etat-publication]')).toHaveText('publié');
  const first = await publishedPdf(page, 'PUB-0001');
  await page.getByRole('button', { name: 'Fermer les publications' }).click();

  // 5. Dimension déterminante modifiée : la nef passe à 14 m ; tableau, feuille et dossier suivent.
  await page.getByRole('button', { name: 'Atelier', exact: true }).click();
  await runScript(page, LENGTHEN);
  await expect(canvas.locator('text', { hasText: /^44,00$/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Publier…' }).click();
  await expect(page.locator('[data-publication="PUB-0001"] [data-etat-publication]')).toHaveText('modifié depuis');
  await page.getByLabel('Nom du dossier à publier').fill('Dossier atelier — indice B');
  await page.getByRole('button', { name: 'Publier la version courante' }).click();
  await expect(page.locator('[data-publication="PUB-0002"] [data-etat-publication]')).toHaveText('publié');
  const second = await publishedPdf(page, 'PUB-0002');
  expect(second.equals(first)).toBe(false);
  expect((await publishedPdf(page, 'PUB-0001')).equals(first)).toBe(true);
  await page.getByRole('button', { name: 'Fermer les publications' }).click();
  await page.getByRole('button', { name: 'Atelier', exact: true }).click();

  // 6. Conflit entre variantes : l'armoire déplacée dans les deux ; la variante B l'emporte.
  const occId = (await currentObjects(page)).find(o => o.kind === 'occurrence')!.id as string;
  await page.getByLabel('Nom de la nouvelle variante').fill('B');
  await page.getByRole('button', { name: 'Créer la variante' }).click();
  await runScript(page, moveCabinet(1000));
  await page.getByLabel('Variante active').selectOption('BR-0000');
  await runScript(page, moveCabinet(-1000));
  await page.getByRole('button', { name: 'Comparer et fusionner…' }).click();
  const merge = page.getByRole('button', { name: 'Fusionner « B » dans « Principale »' });
  await expect(merge).toBeDisabled();
  await page.locator(`[data-conflit="objects:${occId}"]`).getByLabel('garder « B »').check();
  await merge.click();
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === occId)?.x).toBe(6000);

  // 7. Coupure réseau : l'atelier se recharge hors ligne, on y travaille, tout est retrouvé.
  const before = (await currentObjects(page)).length;
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.getByTestId('hors-ligne')).toBeVisible();
  expect(await currentObjects(page)).toHaveLength(before);
  const point = page.getByLabel('Point précis');
  await chooseTool(page, /^Ligne/);
  for (const p of ['0;-1000', '14000;-1000']) { await point.fill(p); await point.press('Enter'); }
  await expect.poll(async () => (await currentObjects(page)).length).toBe(before + 1);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(before + 1);
  await context.setOffline(false);
  await expect(page.getByTestId('hors-ligne')).toHaveCount(0);

  // 8. Échange IFC 4.3 : atelier, mezzanine, platine, ancrages, armoire et son occurrence.
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('ifc');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Exporter en IFC 4.3', { exact: true }).click()]);
  const ifc = readFileSync((await download.path())!, 'utf8');
  const n = (e: string) => (ifc.match(new RegExp(`=${e}\\(`, 'g')) ?? []).length;
  expect([n('IFCWALL'), n('IFCCOLUMN'), n('IFCSLAB'), n('IFCPLATE'), n('IFCMECHANICALFASTENER'), n('IFCBUILDINGELEMENTPROXY'), n('IFCBUILDINGSTOREY')]).toEqual([4, 4, 1, 1, 4, 2, 3]);
  // Nef allongée : mur sud de 14 m d'axe en axe (quantité Length).
  expect(ifc).toContain("IFCQUANTITYLENGTH('Length',$,$,14000.,$)");
  const dir = process.env.E2E_IFC_DIR;
  if (dir) {
    // Relu en CI par IfcOpenShell (scripts/check-ifc.py) : comptes, étages, propriétés, volumes.
    const objs = await currentObjects(page);
    const id = (name: string) => objs.find(o => o.name === name)!.id as string;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'demonstrateur.ifc'), ifc);
    writeFileSync(join(dir, 'demonstrateur.ifc.expected.json'), JSON.stringify({
      schema: 'IFC4X3_ADD2',
      counts: { IfcWall: 4, IfcColumn: 4, IfcSlab: 1, IfcPlate: 1, IfcMechanicalFastener: 4, IfcBuildingElementProxy: 2, IfcBuildingStorey: 3 },
      storeys: [{ name: 'Rez-de-chaussée', elevation: 0 }, { name: 'Mezzanine', elevation: 3000 }, { name: 'Toiture', elevation: 6000 }],
      psets: { [id('Armoire')]: { 'Équipement': { 'Désignation': 'Armoire' } } },
      volumes: { [id('Support de machine')]: 'GrossVolume', [id('Armoire')]: 'NetVolume', [id('Armoire 2')]: 'NetVolume', [id('Plancher de mezzanine')]: 'GrossVolume' },
    }, null, 2));
  }
  expect(errors).toEqual([]);
});
