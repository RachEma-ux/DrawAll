import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, loadObjects, openAtelier, tapModel } from './helpers';

const wall = { id: 'OBJ-0001', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' };

test('lot 4.2 — porte posée sur un mur ; déplacer le mur déplace la porte', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [wall]);
  await chooseTool(page, /^Ouverture/);
  await page.getByLabel('Largeur de l’ouverture (mm)').fill('900');
  await tapModel(page, info, 1500, 0);
  await expect.poll(async () => (await currentObjects(page)).length).toBe(2);
  const [, door] = await currentObjects(page);
  expect(door).toMatchObject({ kind: 'opening', hostId: 'OBJ-0001', type: 'porte', width: 900 });
  expect(Math.abs(Number(door.position) - 1500)).toBeLessThan(60);

  const leafX = async () => Number(await page.getByTestId('canvas').locator('g[data-ouverture="porte"] line').first().getAttribute('x1'));
  const before = await leafX();
  // Sélectionner le mur et le déplacer de 10 pas de 10 mm vers la droite (Maj + flèche).
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 4000, 0);
  await page.getByTestId('canvas').focus().catch(() => {});
  if (info.project.name === 'bureau') {
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => (await currentObjects(page))[0].x1).toBe(100);
    expect(await leafX()).toBeCloseTo(before + 100, 6);
    // La porte n'a pas changé : elle suit son mur.
    expect((await currentObjects(page))[1].position).toBe(door.position);
    // Supprimer le mur supprime la porte.
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await currentObjects(page)).length).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('lot 4.2 — ouverture trop large refusée avec un message', async ({ page }, info) => {
  await openAtelier(page);
  await loadObjects(page, [{ ...wall, x2: 1000 }]);
  await chooseTool(page, /^Ouverture/);
  await page.getByLabel('Largeur de l’ouverture (mm)').fill('1500');
  await tapModel(page, info, 500, 0);
  await expect(page.getByRole('status')).toContainText('dépasse du mur');
  expect(await currentObjects(page)).toHaveLength(1);
});
