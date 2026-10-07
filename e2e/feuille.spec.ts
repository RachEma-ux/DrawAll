import { expect, test, type Page } from '@playwright/test';
import { isPhone, loadObjects, openAtelier, touch } from './helpers';

async function sheets(page: Page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    return s.versions[s.pointer].sheets as { id: string; format: string; orientation: string; viewports: { id: string; x: number; y: number; w: number; h: number; scale: { paper: number; model: number } }[] }[];
  });
}

async function setField(page: Page, label: string, value: string) {
  const f = page.getByLabel(label, { exact: true });
  await f.fill(value);
  await f.press('Enter');
}

const plan = [
  { id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 8000, h: 5000 },
  { id: 'OBJ-0002', kind: 'circle', cx: 4000, cy: 2500, r: 50 },
];

test('lot 2.2 — deux fenêtres 1:50 et 1:5 sur une A3', async ({ page }) => {
  const errors = await openAtelier(page);
  await loadObjects(page, plan);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await expect(page.getByLabel('Format')).toHaveValue('A3');
  await expect(page.getByTestId('cadre')).toBeVisible();

  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByLabel('Échelle de la fenêtre').selectOption('1:50');
  await setField(page, 'Largeur', '190');

  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByLabel('Échelle de la fenêtre').selectOption('1:5');
  await setField(page, 'Position X', '220');
  await setField(page, 'Largeur', '180');
  await setField(page, 'Centre X', '4000');
  await setField(page, 'Centre Y', '2500');

  const [sheet] = await sheets(page);
  expect(sheet).toMatchObject({ format: 'A3', orientation: 'paysage' });
  expect(sheet.viewports.map(v => v.scale)).toEqual([{ paper: 1, model: 50 }, { paper: 1, model: 5 }]);
  expect(sheet.viewports.map(v => [v.x, v.w])).toEqual([[20, 190], [220, 180]]);
  await expect(page.getByTestId('sheet').getByText('FEN-0001 · 1:50')).toBeVisible();
  await expect(page.getByTestId('sheet').getByText('FEN-0002 · 1:5')).toBeVisible();
  // Aucune alerte de débordement : les deux fenêtres tiennent dans la zone utile.
  await expect(page.getByRole('alert')).toHaveCount(0);
  // L'échelle ne touche pas au modèle.
  const objects = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    return s.versions[s.pointer].objects;
  });
  expect(objects[0]).toMatchObject({ w: 8000, h: 5000 });
  expect(errors).toEqual([]);
});

test('lot 2.2 — déplacer une fenêtre au geste (souris ou doigt)', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, plan);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await setField(page, 'Largeur', '150');
  await setField(page, 'Hauteur', '100');
  const box = (await page.getByTestId('fenetre-FEN-0001').locator('rect').first().boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const to = { x: from.x + box.width / 3, y: from.y + box.height / 4 };
  if (isPhone(info)) {
    await (await touch(page)).drag(from, to);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect.poll(async () => (await sheets(page))[0].viewports[0].x).toBeGreaterThan(20);
  const [vp] = (await sheets(page))[0].viewports;
  expect(Number.isInteger(vp.x) && Number.isInteger(vp.y)).toBe(true); // accroché au millimètre
  expect([vp.w, vp.h]).toEqual([150, 100]);
});

test('lot 2.3 — cartouche : champs du projet, l’indice suit l’indice émis', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, plan);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByLabel('Échelle de la fenêtre').selectOption('1:50');
  const cartouche = page.getByRole('region', { name: 'Cartouche' });
  await cartouche.getByRole('button', { name: 'Ajouter' }).click();
  await setField(page, 'Cartouche — Projet', 'Logement Rue Haute');
  await setField(page, 'Cartouche — Titre', 'Plan du rez');
  const block = page.getByTestId('cartouche');
  await expect(block.locator('[data-champ="project"]')).toContainText('Logement Rue Haute');
  await expect(block.locator('[data-champ="scale"]')).toContainText('1:50');
  await expect(block.locator('[data-champ="projection"]')).toContainText('Premier dièdre');
  await expect(block.locator('[data-champ="index"]')).toContainText('aucun indice émis');

  page.once('dialog', d => d.accept('Indice A — dépôt'));
  await cartouche.getByRole('button', { name: 'Émettre l’indice A' }).click();
  await expect(block.locator('[data-champ="index"]')).toHaveText(/IndiceA$/);
  await expect(cartouche.getByText('Indice A émis sur cette version.')).toBeVisible();
  // Une modification ultérieure : l'indice reste A, signalé modifié ; le prochain sera B.
  await setField(page, 'Cartouche — Titre', 'Plan du rez-de-chaussée');
  await expect(block.locator('[data-champ="index"]')).toContainText('A (modifié depuis)');
  await expect(cartouche.getByRole('button', { name: 'Émettre l’indice B' })).toBeVisible();
});

test('lot 2.2 — annuler une modification de feuille sans quitter le mode Feuilles', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, plan);
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  expect((await sheets(page))[0].viewports).toHaveLength(1);
  await page.getByTitle('Annuler (Ctrl+Z)').click();
  await expect.poll(async () => (await sheets(page))[0].viewports.length).toBe(0);
  await page.getByTitle(/Rétablir/).click();
  await expect.poll(async () => (await sheets(page))[0].viewports.length).toBe(1);
  // Les ressources du rendu (motifs, flèches de cote) sont définies dans la feuille.
  await expect(page.getByTestId('sheet').locator('pattern#hatch-diagonal, marker#dim-arrow')).toHaveCount(2);
});

test('lot 2.2 — une fenêtre se cadre sur les calques visibles seulement', async ({ page }) => {
  await openAtelier(page);
  // Un objet lointain sur un calque masqué ne doit pas décentrer la nouvelle fenêtre.
  await loadObjects(page, [...plan, { id: 'OBJ-0003', kind: 'circle', cx: 500000, cy: 500000, r: 10, layerId: 'LAY-0003' }]);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    s.versions[s.pointer].layers = s.versions[s.pointer].layers.map((l: { id: string }) => (l.id === 'LAY-0003' ? { ...l, visible: false } : l));
    localStorage.setItem('drawall-projet-v1', JSON.stringify(s));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  const vp = (await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return s.versions[s.pointer].sheets[0].viewports[0]; }));
  expect(vp.center).toEqual({ x: 4000, y: 2500 });
});
