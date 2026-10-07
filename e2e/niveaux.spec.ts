import { expect, test, type Page } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

const w = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe' });
const box = [w('OBJ-0001', 0, 0, 5200, 0), w('OBJ-0002', 5200, 0, 5200, 4200), w('OBJ-0003', 5200, 4200, 0, 4200), w('OBJ-0004', 0, 4200, 0, 0)];

/** Répond dans l'ordre aux boîtes de dialogue suivantes (nom, altitude…). */
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

const levelOf = (o: Record<string, unknown>) => (o.levelId as string | undefined) ?? 'NIV-0001';
const walls = (page: Page) => page.getByTestId('canvas').locator(':scope > g > g[data-mur]');

test('lot 4.4 — recette deux niveaux : copier, changer de niveau, éditer séparément', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, box);
  await openNavigator(page);

  // Copier le rez-de-chaussée vers un étage à +2,80 m.
  answer(page, ['Étage 1', '2,80']);
  await page.getByRole('button', { name: 'Copier le niveau Rez-de-chaussée' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(8);
  const levels = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return { levels: s.versions[s.pointer].levels, active: s.activeLevelId }; });
  expect(levels.levels).toContainEqual({ id: 'NIV-0002', name: 'Étage 1', elevation: 2800 });
  expect(levels.active).toBe('NIV-0002');
  await expect(page.locator('[data-level="NIV-0002"]')).toContainText('+2,80 m');

  // L'étage montre ses 4 murs ; le rez-de-chaussée est en fond de plan, estompé.
  await expect(walls(page)).toHaveCount(4);
  await expect(page.getByTestId('fond-de-plan')).toBeVisible();
  await expect(page.getByTestId('fond-de-plan').locator('g[data-mur]')).toHaveCount(4);

  // Édition propre à l'étage : supprimer le mur nord.
  if (info.project.name === 'telephone') {
    const collapse = page.getByRole('button', { name: 'Plier le navigateur du projet', exact: true });
    if (await collapse.isVisible().catch(() => false)) await collapse.click();
  }
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 2600, 0);
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect.poll(async () => (await currentObjects(page)).filter(o => levelOf(o) === 'NIV-0002').length).toBe(3);
  expect((await currentObjects(page)).filter(o => levelOf(o) === 'NIV-0001')).toHaveLength(4);
  await expect(walls(page)).toHaveCount(3);

  // Retour au rez-de-chaussée : ses 4 murs intacts, pas de fond de plan (aucun niveau inférieur).
  await openNavigator(page);
  await page.getByRole('button', { name: 'Afficher le niveau Rez-de-chaussée' }).click();
  await expect(walls(page)).toHaveCount(4);
  await expect(page.getByTestId('fond-de-plan')).toHaveCount(0);

  // Les niveaux sont enregistrés avec le projet.
  await page.reload();
  await openNavigator(page);
  await expect(page.locator('[data-level="NIV-0002"]')).toContainText('Étage 1');
  await expect(walls(page)).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('lot 4.4 — supprimer un niveau supprime ses objets ; le dernier niveau reste', async ({ page }) => {
  await openAtelier(page);
  await loadObjects(page, box);
  await openNavigator(page);
  answer(page, ['Étage 1', '2,80']);
  await page.getByRole('button', { name: 'Copier le niveau Rez-de-chaussée' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(8);
  answer(page, ['ok']);
  await page.getByRole('button', { name: 'Supprimer le niveau Étage 1' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(4);
  await expect(page.getByRole('button', { name: 'Supprimer le niveau Rez-de-chaussée' })).toBeDisabled();
});
