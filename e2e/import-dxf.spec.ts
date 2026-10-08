import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { openAtelier } from './helpers';

test('lot 6.1 — importer un DXF de référence : blocs conservés et éclatés, rapport d’échange', async ({ page }) => {
  const errors = await openAtelier(page);
  let report = '';
  page.on('dialog', d => { report = d.message(); void d.accept(); });
  await page.locator('input[type="file"][accept*=".dxf"]').setInputFiles(join(process.cwd(), 'src', 'lib', '__fixtures__', 'dxf', 'blocs.dxf'));
  await expect.poll(() => report).toContain('Import DXF — blocs.dxf');
  expect(report).toContain('Blocs : 2 occurrence(s) conservée(s)');
  expect(report).toContain('Blocs : 2 occurrence(s) éclatée(s)');
  const state = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return s.versions[s.pointer]; });
  const vis = state.blocks.find((b: { name: string }) => b.name === 'VIS_M8');
  expect(vis.primitives).toHaveLength(2);
  expect(state.objects.filter((o: { kind: string; blockId?: string }) => o.kind === 'blockRef' && o.blockId === vis.id)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('lot 6.3 — un fichier DWG est reconnu et refusé avec la marche à suivre (décision §7 en attente)', async ({ page }) => {
  await openAtelier(page);
  const before = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return s.versions[s.pointer].objects.length; });
  let message = '';
  page.on('dialog', d => { message = d.message(); void d.accept(); });
  await page.locator('input[type="file"][accept*=".dwg"]').setInputFiles({ name: 'plan.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('AC1032' + '\0'.repeat(200), 'latin1') });
  await expect.poll(() => message).toContain('fichier DWG (AutoCAD 2018');
  expect(message).toContain('DXF');
  const after = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!); return s.versions[s.pointer].objects.length; });
  expect(after).toBe(before);
});

test('lot 6.3 — l’import DWG se trouve dans la palette de commandes et sur le bouton d’import', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'raccourci clavier : recette bureau');
  await openAtelier(page);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('dwg');
  await expect(page.getByText('Importer un fichier DXF ou DWG')).toBeVisible();
  await page.keyboard.press('Escape');
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  await expect(page.getByRole('button', { name: 'Importer DXF / DWG' })).toBeVisible();
});
