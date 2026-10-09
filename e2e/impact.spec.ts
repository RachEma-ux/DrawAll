import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel } from './helpers';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe', classification: 'architecture' });

test('lot 14.3 — analyse d’impact avant suppression : associés, pièce, feuille à recalculer', async ({ page }, info) => {
  const errors = await openAtelier(page);
  await loadObjects(page, [
    wall('OBJ-0001', 0, 0, 5000, 0), wall('OBJ-0002', 5000, 0, 5000, 4000), wall('OBJ-0003', 5000, 4000, 0, 4000), wall('OBJ-0004', 0, 4000, 0, 0),
    { id: 'OBJ-0005', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 2500, width: 900, hinge: 'debut', side: 'gauche' },
    { id: 'OBJ-0006', kind: 'room', x: 2500, y: 2000, name: 'Séjour' },
  ]);
  // Une feuille dont la fenêtre montre le plan.
  await page.getByRole('button', { name: 'Feuilles', exact: true }).click();
  await page.getByRole('button', { name: 'Nouvelle feuille' }).click();
  await page.getByRole('button', { name: 'Ajouter une fenêtre' }).click();
  await page.getByRole('button', { name: 'Atelier', exact: true }).click();
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();

  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 1000, 0);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  await page.getByTestId('impact').locator('summary').click();
  await expect(page.getByTestId('impact-supprimes')).toContainText('OBJ-0005 (ouverture)');
  await expect(page.getByTestId('impact-touches')).toContainText('OBJ-0006 (contour délimité par OBJ-0001)');
  await expect(page.getByTestId('impact-feuilles')).toContainText('FEN-0001');
  if (isPhone(info)) await page.keyboard.press('Escape');

  await page.keyboard.press('Delete');
  await expect(page.getByText(/^Supprimé — 1 objet\(s\) associé\(s\) supprimé\(s\) avec : OBJ-0005 ; .*feuille\(s\) à recalculer/)).toBeVisible();
  expect((await currentObjects(page)).map(o => o.id)).toEqual(['OBJ-0002', 'OBJ-0003', 'OBJ-0004', 'OBJ-0006']);
  expect(errors).toEqual([]);
});

test('lot 14.3 — suppression refusée (ouverture sur un calque verrouillé) : annoncée comme refusée, rien ne disparaît', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'raccourci Suppr : recette bureau');
  const errors = await openAtelier(page);
  await loadObjects(page, [
    wall('OBJ-0001', 0, 0, 5000, 0),
    { id: 'OBJ-0005', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 2500, width: 900, hinge: 'debut', side: 'gauche' },
  ]);
  // L'ouverture passe sur un autre calque, verrouillé.
  const locked = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    const v = s.versions[s.pointer];
    const layer = v.layers.find((l: { id: string }) => l.id !== 'LAY-0004');
    layer.locked = true;
    v.objects.find((o: { id: string }) => o.id === 'OBJ-0005').layerId = layer.id;
    localStorage.setItem('drawall-projet-v1', JSON.stringify(s));
    return layer.id as string;
  });
  await page.reload();
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 1000, 0);
  await page.keyboard.press('Delete');
  await expect(page.getByText(`Suppression refusée : suppression : OBJ-0005 (emporté avec son parent) sur le calque ${locked} verrouillé.`)).toBeVisible();
  await expect(page.getByText(/^Supprimé —/)).toHaveCount(0);
  expect((await currentObjects(page)).map(o => o.id)).toEqual(['OBJ-0001', 'OBJ-0005']);
  expect(errors).toEqual([]);
});
