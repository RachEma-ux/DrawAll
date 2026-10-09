import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

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
  await expect(view).toHaveAttribute('data-trame-p95', /^\d+\.\d\d$/, { timeout: 30_000 });
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

test('lot 15.5 — coque : extrusion évidée, dessus ouvert, épaisseur 20 mm', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  const panel = await extrudeAt(page, info, 500, 0, '300');
  // Aucune face désignée : refus en clair.
  await panel.getByLabel('Épaisseur de la coque (mm)').fill('20');
  await panel.getByRole('button', { name: 'Évider' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText('Coque : désignez au moins une face ouverte.');
  await panel.getByLabel('OBJ-0001 — dessus').check();
  await panel.getByRole('button', { name: 'Évider' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Coque faite (1 face ouverte)', { timeout: 90_000 });
  // 1 000 × 500 × 300 − 960 × 460 × 280 mm³.
  expect(rel(await shownVolume(page), 1.5e8 - 960 * 460 * 280)).toBeLessThan(1e-9);
  await expect(panel.getByTestId('solide-volume')).toContainText('extrusion → coque');
  expect(errors).toEqual([]);
});

test('lot 15.6 — pousser / tirer le dessus, puis coque sur la face déplacée (référence suivie)', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  const panel = await extrudeAt(page, info, 500, 0, '300');
  await panel.getByLabel('Face à pousser ou tirer').selectOption({ label: 'OBJ-0001 — dessus' });
  await panel.getByLabel('Distance (mm)').fill('100');
  await panel.getByRole('button', { name: 'Appliquer' }).click();
  // 1 000 × 500 × 400 mm = 0,2 m³.
  await expect(panel.getByTestId('solides-message')).toHaveText('Face tirée (OBJ-0001 — dessus) — volume 0,2 m³.', { timeout: 90_000 });
  // Le dessus, déplacé de 100 mm, reste désigné par son nom : la coque l'ouvre.
  await panel.getByLabel('Épaisseur de la coque (mm)').fill('20');
  await panel.getByLabel('OBJ-0001 — dessus').check();
  await panel.getByRole('button', { name: 'Évider' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Coque faite', { timeout: 90_000 });
  expect(rel(await shownVolume(page), 1000 * 500 * 400 - 960 * 460 * 380)).toBeLessThan(1e-9);
  await expect(panel.getByTestId('solide-volume')).toContainText('extrusion → pousser / tirer → coque');
  expect(errors).toEqual([]);
});

test('lot 16.1 — vues projetées associées : percer le solide fait apparaître les arêtes cachées dans les vues', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  const panel = await extrudeAt(page, info, 500, 0, '300');
  await panel.getByRole('button', { name: 'Poser les vues' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText('3 vues posées à droite du solide.');
  const views = page.locator('[data-projection]');
  await expect(views).toHaveCount(3);
  await expect(page.locator('[data-projection][data-etat="prête"]')).toHaveCount(3, { timeout: 90_000 });
  const face = page.locator('[data-projection][data-vue="face"]');
  await expect(face).toHaveAttribute('data-vues', '4');
  await expect(face).toHaveAttribute('data-cachees', '0');
  // Perçage Ø 100 traversant : deux arêtes cachées dans la vue de face et dans la vue de côté.
  await panel.getByLabel('X du perçage (mm)').fill('500');
  await panel.getByLabel('Y du perçage (mm)').fill('250');
  await panel.getByLabel('Diamètre du perçage (mm)').fill('100');
  await panel.getByRole('button', { name: 'Percer' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Perçage fait', { timeout: 90_000 });
  await expect(face).toHaveAttribute('data-cachees', '2', { timeout: 90_000 });
  await expect(page.locator('[data-projection][data-vue="cote"]')).toHaveAttribute('data-cachees', '2');
  await expect(face.locator('[stroke-dasharray]')).toHaveCount(2);
  const types = (await currentObjects(page)).filter(o => o.kind === 'projection').map(o => o.view);
  expect(types).toEqual(['dessus', 'face', 'cote']);
  expect(errors).toEqual([]);
});

test('lot 16.3 — pièce numérotée et occurrences : modifier la pièce type met à jour toutes les occurrences', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  const panel = await extrudeAt(page, info, 500, 0, '300');
  await panel.getByRole('button', { name: 'Définir comme pièce' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText(/devient la pièce n° 1\.$/);
  for (const [x, y] of [['2000', '0'], ['4000', '0']]) {
    await panel.getByLabel('X de l’occurrence (mm)').fill(x);
    await panel.getByLabel('Y de l’occurrence (mm)').fill(y);
    await panel.getByRole('button', { name: 'Poser une occurrence' }).click();
    await expect(panel.getByTestId('solides-message')).toContainText('de la pièce n° 1 posée');
  }
  const occs = page.locator('[data-occurrence]');
  await expect(occs).toHaveCount(2);
  await expect(page.locator('[data-occurrence] [data-repere="1"]')).toHaveCount(2);
  await expect(panel).toContainText('repère 1, 3 exemplaires (pièce type comprise)');
  // La pièce type est tirée d'un côté de 200 mm : la tranche ajoutée apparaît dans chaque occurrence.
  // Emprise de la trace de chaque occurrence (repère du modèle), sans le texte du repère.
  const traces = () => occs.evaluateAll(gs => gs.map(g => {
    const ys = [...g.querySelectorAll('polyline, path, line')].map(e => (e as SVGGraphicsElement).getBBox()).flatMap(b => [b.y, b.y + b.height]);
    return Math.round(Math.max(...ys) - Math.min(...ys));
  }));
  const before = await traces();
  const faceSelect = panel.getByLabel('Face à pousser ou tirer');
  const side = await faceSelect.locator('option').evaluateAll(os => os.find(o => o.textContent?.startsWith('OBJ-0001 — côté 1 (0 ; 0)'))?.getAttribute('value'));
  await faceSelect.selectOption(side!);
  await panel.getByLabel('Distance (mm)').fill('200');
  await panel.getByRole('button', { name: 'Appliquer' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Face tirée', { timeout: 90_000 });
  expect(before).toEqual([500, 500]);
  await expect.poll(traces).toEqual([700, 700]);
  expect(errors).toEqual([]);
});

test('lot 16.4 — liaison appui plan suivie, nomenclature d’assemblage et vue éclatée', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'désignation multiple à la souris (Maj + clic)');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 300, h: 100 }]);
  const panel = await extrudeAt(page, info, 150, 0, '50');
  await panel.getByRole('button', { name: 'Définir comme pièce' }).click();
  await panel.getByLabel('X de l’occurrence (mm)').fill('1000');
  await panel.getByLabel('Y de l’occurrence (mm)').fill('0');
  await panel.getByLabel('Z de l’occurrence (mm)').fill('500');
  await panel.getByRole('button', { name: 'Poser une occurrence' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('posée');
  const objs = await currentObjects(page);
  const def = objs.find(o => o.kind === 'solid')!, occ = objs.find(o => o.kind === 'occurrence')!;

  // L'occurrence d'abord, puis la pièce type : appui de son dessous sur le dessus de la pièce.
  const reopen = async () => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/Rechercher un outil/).fill('solides 3d');
    await page.getByText('Solides 3D', { exact: true }).click();
  };
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await tapModel(page, info, 1150, 0);
  await page.keyboard.down('Shift');
  await tapModel(page, info, 150, 0);
  await page.keyboard.up('Shift');
  await reopen();
  await panel.getByLabel('Type de liaison').selectOption('appui');
  await panel.getByLabel('Face de l’occurrence').selectOption({ label: 'OBJ-0001 — dessous' });
  await panel.getByLabel('Face de la référence').selectOption({ label: 'OBJ-0001 — dessus' });
  await panel.getByRole('button', { name: 'Lier' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText(`Liaison appui plan : ${occ.id} suit ${def.id}.`);
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === occ.id)).toMatchObject({ x: 1000, y: 0, z: 50, mate: { type: 'appui', to: def.id } });

  // La pièce type s'épaissit de 30 mm : l'occurrence liée remonte d'autant.
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();
  await tapModel(page, info, 600, 400); // clic dans le vide : désélection
  await tapModel(page, info, 150, 0);
  await reopen();
  await panel.getByLabel('Face à pousser ou tirer').selectOption({ label: 'OBJ-0001 — dessus' });
  await panel.getByLabel('Distance (mm)').fill('30');
  await panel.getByRole('button', { name: 'Appliquer' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Face tirée', { timeout: 90_000 });
  await expect.poll(async () => (await currentObjects(page)).find(o => o.id === occ.id)?.z).toBe(80);
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();

  // Nomenclature d'assemblage : repère 1, quantité 2 (pièce type + occurrence).
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('nomenclature d’assemblage');
  await page.getByText('Insérer la nomenclature d’assemblage').click();
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('text', { hasText: /^Désignation$/ })).toHaveCount(1);
  await expect(canvas.locator('text', { hasText: /^2$/ })).toHaveCount(2); // quantité et total

  // Vue éclatée : les deux éléments s'écartent.
  await page.getByRole('button', { name: 'Vue 3D', exact: true }).click();
  const view = page.getByRole('dialog', { name: 'Vue 3D' });
  await expect(view.getByTestId('vue3d-contenu')).toHaveText('2 solides', { timeout: 90_000 });
  await view.getByLabel('Vue éclatée').fill('1');
  await expect(view).toHaveAttribute('data-eclate', '1');
  await expect(view).toHaveAttribute('data-trame-p95', /^\d+\.\d\d$/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('lot 17.2 — export STEP AP242 édition 3 puis réimport : mêmes solides', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  const panel = await extrudeAt(page, info, 500, 0, '300');
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();
  let report = '';
  page.on('dialog', d => { report = d.message(); d.accept().catch(() => {}); });
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('step');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByText('Exporter les solides en STEP (AP242 édition 3)', { exact: true }).click()]);
  const path = (await download.path())!;
  const { readFileSync } = await import('node:fs');
  const step = readFileSync(path, 'utf8');
  expect(step).toContain("FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 3 1 4 }'));");
  await expect.poll(() => report).toContain('1 solide(s)');

  // Réimport du fichier : un deuxième solide, de même volume.
  report = '';
  await page.getByLabel('Fichier STEP à importer').setInputFiles(path);
  await expect.poll(() => report, { timeout: 90_000 }).toContain('Import STEP : importé');
  const solids = (await currentObjects(page)).filter(o => o.kind === 'solid');
  expect(solids).toHaveLength(2);
  expect(solids[1].recipe).toMatchObject({ op: 'step' });
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('solides 3d');
  await page.getByText('Solides 3D', { exact: true }).click();
  expect(Math.abs((await shownVolume(page)) - 1.5e8) / 1.5e8).toBeLessThan(1e-6);
  expect(errors).toEqual([]);
});

test('lot 16.3 — repères de pièce attribués sur toutes les variantes : deux variantes ne numérotent pas pareil', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'panneau d’historique en colonne : recette bureau');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }, { id: 'OBJ-0002', kind: 'rect', x: 3000, y: 0, w: 1000, h: 500 }]);
  // Variante B : la première extrusion devient la pièce n° 1.
  await page.getByLabel('Nom de la nouvelle variante').fill('B');
  await page.getByRole('button', { name: 'Créer la variante' }).click();
  let panel = await extrudeAt(page, info, 500, 0, '300');
  await panel.getByRole('button', { name: 'Définir comme pièce' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText(/devient la pièce n° 1\.$/);
  await panel.getByRole('button', { name: /Fermer/ }).first().click();
  // Principale : une autre pièce, définie après, reçoit le repère suivant.
  await page.getByLabel('Variante active').selectOption('BR-0000');
  panel = await extrudeAt(page, info, 3500, 0, '300');
  await panel.getByRole('button', { name: 'Définir comme pièce' }).click();
  await expect(panel.getByTestId('solides-message')).toHaveText(/devient la pièce n° 2\.$/);
  expect(errors).toEqual([]);
});

test('relecture 50e passe — import STEP appliqué à l’état courant : une modification faite pendant la lecture est gardée', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'saisie au clavier');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  let report = '';
  page.on('dialog', d => { report = d.message(); d.accept().catch(() => {}); });
  // Lecture lancée (chargement du noyau compris), puis une ligne tracée sans attendre.
  await page.getByLabel('Fichier STEP à importer').setInputFiles('e2e/fixtures/cube.step');
  await chooseTool(page, /^Ligne/);
  const point = page.getByLabel('Point précis');
  await point.fill('0;2000'); await point.press('Enter');
  await point.fill('3000;2000'); await point.press('Enter');
  await expect.poll(async () => (await currentObjects(page)).some(o => o.kind === 'line')).toBe(true);
  expect(report).toBe('');
  await expect.poll(() => report, { timeout: 90_000 }).toContain('Import STEP : importé');
  const kinds = (await currentObjects(page)).map(o => o.kind);
  expect(kinds).toContain('line');
  expect(kinds).toContain('solid');
  expect(kinds).toContain('rect');
  expect(errors).toEqual([]);
});

test('relecture 51e passe — panneau des solides fermé pendant le calcul : le résultat est abandonné', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'panneau en dialogue : recette bureau');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  await tapModel(page, info, 500, 0);
  await page.getByRole('button', { name: /^Solides \(extrusion/ }).click();
  const panel = page.getByRole('dialog', { name: 'Solides' });
  await panel.getByLabel('Hauteur d’extrusion (mm)').fill('300');
  // Extrusion lancée (chargement du noyau compris), panneau fermé aussitôt.
  await panel.getByRole('button', { name: 'Extruder' }).click();
  await panel.getByRole('button', { name: 'Fermer les solides' }).click();
  await page.waitForTimeout(10_000);
  expect((await currentObjects(page)).filter(o => o.kind === 'solid')).toEqual([]);
  expect(errors).toEqual([]);
});

test('relecture 54e passe — variante changée pendant un import STEP : rien n’est importé dans l’autre variante', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'panneau d’historique en colonne : recette bureau');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  let report = '';
  page.on('dialog', d => { report = d.message(); d.accept().catch(() => {}); });
  // Lecture lancée, puis nouvelle variante (active) avant la fin.
  await page.getByLabel('Fichier STEP à importer').setInputFiles('e2e/fixtures/cube.step');
  await page.getByLabel('Nom de la nouvelle variante').fill('B');
  await page.getByRole('button', { name: 'Créer la variante' }).click();
  await expect.poll(() => report, { timeout: 90_000 }).toContain('Import STEP abandonné');
  expect((await currentObjects(page)).filter(o => o.kind === 'solid')).toEqual([]);
  expect(errors).toEqual([]);
});

test('relecture 59e passe — niveau changé pendant le calcul : le solide reste sur le niveau de son contour', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'sélecteur de niveaux : recette bureau');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await page.waitForFunction(() => localStorage.getItem('drawall-projet-v1') !== null);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    s.versions[s.pointer].levels = [{ id: 'NIV-0001', name: 'Rez-de-chaussée', elevation: 0 }, { id: 'NIV-0002', name: 'Étage', elevation: 3000 }];
    localStorage.setItem('drawall-projet-v1', JSON.stringify(s));
  });
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  await tapModel(page, info, 500, 0);
  await page.getByRole('button', { name: /^Solides \(extrusion/ }).click();
  const panel = page.getByRole('dialog', { name: 'Solides' });
  await panel.getByLabel('Hauteur d’extrusion (mm)').fill('300');
  await panel.getByRole('button', { name: 'Extruder' }).click();
  // Calcul en cours (chargement du noyau) : l'étage devient actif.
  await page.getByRole('button', { name: 'Afficher le niveau Étage' }).click();
  await expect(panel.getByTestId('solides-message')).toContainText('Extrusion créée', { timeout: 90_000 });
  const solid = (await currentObjects(page)).find(o => o.kind === 'solid')!;
  expect(solid.levelId ?? 'NIV-0001').toBe('NIV-0001');
  expect(errors).toEqual([]);
});

test('relecture 59e passe — calque verrouillé pendant le calcul : rien n’est appliqué, jamais annoncé fait', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'panneau des calques : recette bureau');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500, layerId: 'LAY-0001' }]);
  await tapModel(page, info, 500, 0);
  await page.getByRole('button', { name: /^Solides \(extrusion/ }).click();
  const panel = page.getByRole('dialog', { name: 'Solides' });
  await panel.getByLabel('Hauteur d’extrusion (mm)').fill('300');
  await panel.getByRole('button', { name: 'Extruder' }).click();
  // Calcul en cours : le calque du contour (et du solide à créer) est verrouillé.
  await page.getByTitle('Verrouiller', { exact: true }).first().click();
  await expect(panel.getByTestId('solides-message')).toContainText('Rien n’est appliqué : la commande a été refusée', { timeout: 90_000 });
  expect((await currentObjects(page)).filter(o => o.kind === 'solid')).toEqual([]);
  expect(errors).toEqual([]);
});

test('relecture 60e passe — import STEP : niveau de départ gardé ; calques tous verrouillés : import refusé', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'panneaux des niveaux et des calques : recette bureau');
  test.setTimeout(150_000);
  const errors = await openAtelier(page);
  await page.waitForFunction(() => localStorage.getItem('drawall-projet-v1') !== null);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    s.versions[s.pointer].levels = [{ id: 'NIV-0001', name: 'Rez-de-chaussée', elevation: 0 }, { id: 'NIV-0002', name: 'Étage', elevation: 3000 }];
    localStorage.setItem('drawall-projet-v1', JSON.stringify(s));
  });
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 1000, h: 500 }]);
  let report = '';
  page.on('dialog', d => { report = d.message(); d.accept().catch(() => {}); });
  // Lecture lancée au rez-de-chaussée, puis l'étage devient actif avant la fin.
  await page.getByLabel('Fichier STEP à importer').setInputFiles('e2e/fixtures/cube.step');
  await page.getByRole('button', { name: 'Afficher le niveau Étage' }).click();
  await expect.poll(() => report, { timeout: 90_000 }).toContain('Import STEP : importé');
  const solid = (await currentObjects(page)).find(o => o.kind === 'solid')!;
  expect(solid.levelId ?? 'NIV-0001').toBe('NIV-0001');
  // Tous les calques verrouillés : l'import est refusé, rien n'est ajouté.
  report = '';
  const lock = page.getByTitle('Verrouiller', { exact: true });
  while (await lock.count()) await lock.first().click();
  await page.getByLabel('Fichier STEP à importer').setInputFiles('e2e/fixtures/cube.step');
  await expect.poll(() => report, { timeout: 90_000 }).toContain('Import STEP refusé : calque');
  expect((await currentObjects(page)).filter(o => o.kind === 'solid')).toHaveLength(1);
  expect(errors).toEqual([]);
});
