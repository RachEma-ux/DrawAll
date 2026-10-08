import { expect, test, type Page } from '@playwright/test';
import { currentObjects, loadObjects, openAtelier } from './helpers';

async function openAssistant(page: Page) {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('assistant');
  await page.getByText('Assistant', { exact: true }).click();
  return page.getByRole('dialog', { name: 'Assistant' });
}

test('lot 18.3 — proposition validée, aperçue, exécutée après accord ; journal des hypothèses', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const before = await currentObjects(page);
  let dlg = await openAssistant(page);

  // Valeur absente : une question, aucune opération.
  await dlg.getByLabel('Demande').fill('grille de 3 x 4 poteaux entraxe 5 m');
  await dlg.getByRole('button', { name: 'Proposer' }).click();
  await expect(dlg.getByRole('region', { name: 'Proposition' })).toHaveAttribute('data-statut', 'questions');
  await expect(dlg).toContainText('Section des poteaux ?');
  expect(await currentObjects(page)).toEqual(before);

  // Proposition rejetée : rien n'est exécuté, la décision est journalisée.
  await dlg.getByLabel('Demande').fill('grille de 3 x 4 poteaux 300 x 300 mm entraxe 5 m');
  await dlg.getByRole('button', { name: 'Proposer' }).click();
  await expect(dlg.getByRole('region', { name: 'Proposition' })).toHaveAttribute('data-statut', 'ready');
  await expect(dlg.getByTestId('apercu-assistant')).toHaveAttribute('data-proposes', '12');
  await expect(dlg.getByRole('list', { name: 'Hypothèses' })).toContainText('Origine non précisée');
  await dlg.getByRole('button', { name: 'Rejeter' }).click();
  await expect(dlg.getByRole('status')).toContainText('rien n’a été exécuté');
  expect(await currentObjects(page)).toEqual(before);

  // Même demande : resservie par le cache des opérations validées, puis acceptée.
  await dlg.getByRole('button', { name: 'Proposer' }).click();
  await expect(dlg.getByTestId('corrections')).toContainText('cache des opérations validées');
  await dlg.getByRole('button', { name: 'Accepter et exécuter' }).click();
  await expect(dlg.getByRole('status')).toContainText('12 opérations exécutées', { timeout: 15_000 });
  const columns = (await currentObjects(page)).filter(o => o.kind === 'column');
  expect(columns).toHaveLength(12);
  expect(new Set(columns.map(c => `${c.x};${c.y}`))).toEqual(new Set([0, 1, 2].flatMap(i => [0, 1, 2, 3].map(j => `${j * 5000};${i * 5000}`))));
  const log = dlg.getByRole('list', { name: 'Journal des hypothèses' });
  await expect(log.locator('[data-decision="executee"]')).toHaveCount(1);
  await expect(log.locator('[data-decision="rejetee"]')).toHaveCount(1);
  await expect(log.locator('[data-decision="executee"]')).toContainText('Entraxe d’axe en axe');

  // Le journal des hypothèses est enregistré avec le projet.
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('drawall-projet-v1') ?? '{}').assistantLog ?? []).length)).toBe(2);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  dlg = await openAssistant(page);
  await expect(dlg.getByRole('list', { name: 'Journal des hypothèses' }).locator('[data-decision]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('lot 18.3 — projet modifié entre l’aperçu et l’accord : rien n’est exécuté, nouvelle proposition demandée', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const dlg = await openAssistant(page);
  await dlg.getByLabel('Demande').fill('grille de 2 x 2 poteaux 300 x 300 mm entraxe 5 m');
  await dlg.getByRole('button', { name: 'Proposer' }).click();
  await expect(dlg.getByRole('region', { name: 'Proposition' })).toHaveAttribute('data-statut', 'ready');
  // L'atelier reste modifiable pendant l'aperçu : la ligne est déplacée au clavier.
  await page.locator('body').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await currentObjects(page))[0].x1).not.toBe(0);
  const moved = await currentObjects(page);
  await dlg.getByRole('button', { name: 'Accepter et exécuter' }).click();
  await expect(dlg.getByRole('status')).toContainText('Le projet a changé depuis l’aperçu : rien n’a été exécuté.');
  expect(await currentObjects(page)).toEqual(moved);
  expect(errors).toEqual([]);
});

test('lot 18.3 — niveau actif changé entre l’aperçu et l’accord : rien n’est exécuté', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await page.waitForFunction(() => localStorage.getItem('drawall-projet-v1') !== null);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    s.versions[s.pointer].levels = [{ id: 'NIV-0001', name: 'Rez-de-chaussée', elevation: 0 }, { id: 'NIV-0002', name: 'Étage', elevation: 3000 }];
    localStorage.setItem('drawall-projet-v1', JSON.stringify(s));
  });
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const before = await currentObjects(page);
  const dlg = await openAssistant(page);
  await dlg.getByLabel('Demande').fill('grille de 2 x 2 poteaux 300 x 300 mm entraxe 5 m');
  await dlg.getByRole('button', { name: 'Proposer' }).click();
  await expect(dlg.getByRole('region', { name: 'Proposition' })).toHaveAttribute('data-statut', 'ready');
  // Le niveau actif change (sans modifier le contenu du projet).
  await page.getByRole('button', { name: 'Afficher le niveau Étage' }).click();
  await expect(page.getByRole('button', { name: 'Afficher le niveau Étage' })).toHaveAttribute('aria-pressed', 'true');
  await dlg.getByRole('button', { name: 'Accepter et exécuter' }).click();
  await expect(dlg.getByRole('status')).toContainText('Le projet a changé depuis l’aperçu : rien n’a été exécuté.');
  expect(await currentObjects(page)).toEqual(before);
  expect(errors).toEqual([]);
});
