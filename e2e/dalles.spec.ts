import { expect, test } from '@playwright/test';
import { chooseTool, currentObjects, isPhone, loadObjects, openAtelier, tapModel, toScreen } from './helpers';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number) => ({ id, kind: 'wall', x1, y1, x2, y2, thickness: 200, justification: 'axe', classification: 'architecture' });

test('lot 13.1 — dalle depuis une pièce et par contour : surface et volume de référence', async ({ page }, info) => {
  const errors = await openAtelier(page);
  // Murs de 200 mm d'axe en axe 5 × 4 m et une pièce : contour intérieur 4,80 × 3,80 m.
  await loadObjects(page, [
    wall('OBJ-0001', 0, 0, 5000, 0), wall('OBJ-0002', 5000, 0, 5000, 4000), wall('OBJ-0003', 5000, 4000, 0, 4000), wall('OBJ-0004', 0, 4000, 0, 0),
    { id: 'OBJ-0005', kind: 'room', x: 2500, y: 2000, name: 'Séjour' },
  ]);
  await chooseTool(page, /^Dalle/);

  // Depuis la pièce : contour intérieur repris, 200 mm.
  await tapModel(page, info, 3000, 1200);
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'slab').length).toBe(1);
  const fromRoom = (await currentObjects(page)).find(o => o.kind === 'slab')!;
  expect(fromRoom).toMatchObject({ thickness: 200, roomId: 'OBJ-0005', classification: 'architecture' });
  await expect(page.getByText('Dalle créée : 18,24 m², 3,648 m³.')).toBeVisible();
  // Hors de toute pièce : rien n'est créé, la raison est donnée.
  // Premier point hors pièce visible à l'écran (la vue diffère entre bureau et téléphone).
  const box = (await page.getByTestId('canvas').boundingBox())!;
  let outside: [number, number] | null = null;
  for (const [x, y] of [[6000, 2000], [3000, -500], [3000, 4500], [-500, 2000]] as const) {
    const s = await toScreen(page, x, y);
    if (s.x > box.x + 60 && s.x < box.x + box.width - 20 && s.y > box.y + 80 && s.y < box.y + box.height - 20) { outside = [x, y]; break; }
  }
  expect(outside).not.toBeNull();
  await tapModel(page, info, outside![0], outside![1]);
  await expect(page.getByText('Aucune pièce fermée à cet endroit', { exact: false })).toBeVisible();

  // Par contour (ici dans la pièce, sans la désigner) : 2 × 1,5 m, 250 mm → 3 m², 0,75 m³.
  // Vue recadrée (le panneau de l'outil recouvre le bouton sur téléphone : événement direct).
  await page.getByRole('button', { name: 'Cadrer', exact: true }).dispatchEvent('click');
  await page.getByLabel('Création de la dalle').selectOption('contour');
  await page.getByLabel('Épaisseur de la dalle (mm)').fill('250');
  for (const [x, y] of [[2600, 800], [4600, 800], [4600, 2300], [2600, 2300]]) await tapModel(page, info, x, y);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect.poll(async () => (await currentObjects(page)).filter(o => o.kind === 'slab').length).toBe(2);
  const drawn = (await currentObjects(page)).filter(o => o.kind === 'slab')[1];
  expect(drawn).toMatchObject({ thickness: 250, points: [2600, 800, 4600, 800, 4600, 2300, 2600, 2300] });

  // Inspecteur : surface et volume.
  await chooseTool(page, /^Sélection/);
  await tapModel(page, info, 3600, 800);
  if (isPhone(info)) await page.getByRole('button', { name: /^Inspecteur/ }).click();
  await expect(page.getByTestId('dalle-surface')).toHaveText('3,00 m²');
  await expect(page.getByTestId('dalle-volume')).toHaveText('0,750 m³');
  expect(errors).toEqual([]);
});
