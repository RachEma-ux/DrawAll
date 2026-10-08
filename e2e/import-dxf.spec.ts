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
