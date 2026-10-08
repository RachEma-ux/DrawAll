import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

/** Sommets actuels du rectangle (polyligne fermée OBJ-0001). */
async function corners(page: Page): Promise<number[]> {
  const o = (await currentObjects(page)).find(x => x.id === 'OBJ-0001')!;
  return o.points as number[];
}
/** Touche le milieu du côté i (0 : bas, 1 : droite, 2 : haut, 3 : gauche). */
async function tapSide(page: Page, info: TestInfo, i: number) {
  const p = await corners(page);
  await tapModel(page, info, (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2);
}
async function constrain(page: Page, type: string, value?: string) {
  await page.getByLabel('Type de contrainte').selectOption({ label: type });
  if (value !== undefined) await page.getByLabel('Valeur de la contrainte (mm)').fill(value);
}
const round = (v: number[]) => v.map(x => Math.round(x * 1000) / 1000);

test('lot 12.1 — rectangle contraint, re-résolu à chaque modification ; conflit expliqué ; sur-contrainte signalée', async ({ page }, info) => {
  const errors = await openAtelier(page);
  // Rectangle dessiné de travers (polyligne fermée) et un cadre de fond pour le cadrage.
  await loadObjects(page, [
    { id: 'OBJ-0001', kind: 'polyline', points: [0, 0, 1003, 4, 998, 497, 2, 506, 0, 0] },
    { id: 'OBJ-0002', kind: 'rect', x: -600, y: -600, w: 2400, h: 1800 },
  ]);
  await chooseTool(page, /^Contrainte/);

  // Coin fixé à sa position actuelle (l'origine), puis horizontales et verticales, puis deux longueurs.
  await constrain(page, 'Fixe');
  await tapModel(page, info, 0, 0);
  for (const [type, side] of [['Horizontale', 0], ['Verticale', 1], ['Horizontale', 2], ['Verticale', 3]] as const) {
    await constrain(page, type);
    await tapSide(page, info, side);
  }
  await constrain(page, 'Longueur', '1000');
  await tapSide(page, info, 0);
  await constrain(page, 'Longueur', '500');
  await tapSide(page, info, 1);
  await expect(page.getByTestId('contraintes')).toHaveText('7 contraintes · 0 ddl');
  expect(round(await corners(page))).toEqual([0, 0, 1000, 0, 1000, 500, 0, 500, 0, 0]);
  // Symboles sur le canevas, un par élément visé.
  await expect(page.locator('[data-contrainte="CTR-0001"]')).toHaveText('⚓');
  await expect(page.locator('[data-contrainte="CTR-0002"]')).toHaveText('H');
  await expect(page.locator('[data-contrainte="CTR-0006"]')).toHaveText('L 1000');

  // Une modification re-résout : la longueur du bas passe à 1 200, le haut suit.
  await page.getByLabel('Valeur de CTR-0006 (mm)').fill('1200');
  await page.getByLabel('Valeur de CTR-0006 (mm)').press('Enter');
  await expect.poll(async () => round(await corners(page))).toEqual([0, 0, 1200, 0, 1200, 500, 0, 500, 0, 0]);

  // Conflit : une longueur de 900 sur le haut, incompatible avec 1 200 en bas.
  await constrain(page, 'Longueur', '900');
  await tapSide(page, info, 2);
  await expect(page.getByTestId('contraintes-conflit')).toContainText('CTR-0008 (longueur)');
  await expect(page.getByTestId('contraintes')).toContainText('conflit');
  await expect(page.locator('[data-contrainte="CTR-0008"]')).toHaveAttribute('data-etat', 'conflit');
  // Le dessin n'est pas déformé en attendant.
  expect(round(await corners(page))).toEqual([0, 0, 1200, 0, 1200, 500, 0, 500, 0, 0]);
  await page.getByRole('button', { name: 'Retirer CTR-0008' }).click();
  await expect(page.getByTestId('contraintes-conflit')).toHaveCount(0);

  // Sur-contrainte cohérente : une longueur de 1 200 sur le haut n'ajoute rien.
  await constrain(page, 'Longueur', '1200');
  await tapSide(page, info, 2);
  await expect(page.getByTestId('contraintes-redondantes')).toBeVisible();
  await expect(page.getByTestId('contraintes-conflit')).toHaveCount(0);
  expect(errors).toEqual([]);
});
