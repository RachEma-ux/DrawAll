import { expect, test, type Page } from '@playwright/test';
import { currentObjects, loadObjects, openAtelier } from './helpers';

async function openConsole(page: Page) {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('console de scripts');
  await page.getByText('Console de scripts', { exact: true }).click();
  return page.getByRole('dialog', { name: 'Console de scripts' });
}

async function runCode(page: Page, code: string, expected: 'reussi' | 'annule', timeout = 15_000) {
  const dlg = page.getByRole('dialog', { name: 'Console de scripts' });
  await dlg.getByLabel('Code du script').fill(code);
  await dlg.getByRole('button', { name: 'Exécuter' }).click();
  await expect(dlg.getByRole('log', { name: 'Sortie du script' })).toHaveAttribute('data-script', expected, { timeout });
  return dlg;
}

test('lot 18.2 — un script trace une grille de poteaux par l’API de commandes', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const dlg = await openConsole(page);
  // Le script d'exemple : 3 × 4 poteaux de 300 × 300 mm, entraxe 5 m.
  await dlg.getByRole('button', { name: 'Exécuter' }).click();
  await expect(dlg.getByRole('log', { name: 'Sortie du script' })).toHaveAttribute('data-script', 'reussi', { timeout: 15_000 });
  await expect(dlg).toContainText('13 objets');
  const columns = (await currentObjects(page)).filter(o => o.kind === 'column');
  expect(columns).toHaveLength(12);
  const at = columns.map(c => `${c.x};${c.y}`).sort();
  const want = [0, 1, 2].flatMap(i => [0, 1, 2, 3].map(j => `${j * 5000};${i * 5000}`)).sort();
  expect(at).toEqual(want);
  expect(columns.every(c => c.section === 'rect' && c.b === 300 && c.h === 300)).toBe(true);
  // Les commandes du script sont au journal, comme celles de l'interface.
  await dlg.getByRole('button', { name: 'Fermer la console' }).click();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('journal');
  await page.getByText('Journal des commandes', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Journal des commandes' })).toHaveAttribute('data-commandes', '12');
  expect(errors).toEqual([]);
});

test('lot 18.2 — un script fautif n’abîme rien ; le script n’a accès ni au stockage ni au réseau direct', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  test.setTimeout(60_000);
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  const before = await currentObjects(page);
  await openConsole(page);
  const add = (x: number) => `await drawall.execute('addObject', { kind: 'column', classification: 'structure', layerId: (await drawall.context()).activeLayerId, hatch: 'none', x: ${x}, y: 0, section: 'circle', d: 400 });`;

  // Exception après deux poteaux : le projet revient à son état d'avant le script.
  let dlg = await runCode(page, `${add(0)}\n${add(5000)}\nthrow new Error('panne volontaire');`, 'annule');
  await expect(dlg).toContainText('Échec : panne volontaire. Projet rétabli');
  await expect.poll(() => currentObjects(page)).toEqual(before);

  // Commande refusée par la validation (calque absent) : annulation aussi.
  dlg = await runCode(page, `${add(0)}\nawait drawall.execute('addObject', { kind: 'column', layerId: 'LAY-9999', x: 0, y: 0, section: 'circle', d: 400 });`, 'annule');
  await expect(dlg).toContainText('calque LAY-9999 absent');
  await expect.poll(() => currentObjects(page)).toEqual(before);

  // Boucle sans fin : arrêtée au délai, annulée.
  await dlg.getByLabel('Délai (s)').fill('1');
  dlg = await runCode(page, `${add(0)}\nwhile (true) {}`, 'annule');
  await expect(dlg).toContainText('délai de 1 s dépassé');
  await expect.poll(() => currentObjects(page)).toEqual(before);

  // Arrêt à la main.
  await dlg.getByLabel('Délai (s)').fill('30');
  await dlg.getByLabel('Code du script').fill(`${add(0)}\nawait new Promise(() => {});`);
  await dlg.getByRole('button', { name: 'Exécuter' }).click();
  await expect.poll(async () => (await currentObjects(page)).length).toBe(before.length + 1);
  await dlg.getByRole('button', { name: 'Arrêter' }).click();
  await expect(dlg.getByRole('log', { name: 'Sortie du script' })).toHaveAttribute('data-script', 'annule');
  await expect.poll(() => currentObjects(page)).toEqual(before);

  // Ni stockage ni réseau direct, même par le prototype de l'objet global.
  dlg = await runCode(page, [
    "const proto = Object.getPrototypeOf(self);",
    "const viaProto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'indexedDB');",
    "drawall.log('acces', typeof indexedDB, typeof localStorage, typeof caches, typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts, String(viaProto && (viaProto.get ? viaProto.get.call(self) : viaProto.value)));",
  ].join('\n'), 'reussi');
  await expect(dlg).toContainText('acces undefined undefined undefined undefined undefined undefined undefined undefined');
  expect(await currentObjects(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('lot 18.2 — aucun accès réseau : import() dynamique bloqué avant toute requête', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'palette de commandes au clavier');
  const errors = await openAtelier(page);
  await loadObjects(page, [{ id: 'OBJ-0001', kind: 'line', x1: 0, y1: 0, x2: 4000, y2: 0 }]);
  // Une tentative bloquée par la politique de sécurité apparaît comme requête échouée, sans réponse :
  // seule une réponse (ou une requête réellement partie) serait une fuite.
  const leaks: string[] = [], blocked: string[] = [];
  page.on('response', r => { if (r.url().includes('fuite')) leaks.push(r.url()); });
  page.on('requestfinished', r => { if (r.url().includes('fuite')) leaks.push(r.url()); });
  page.on('requestfailed', r => { if (r.url().includes('fuite')) blocked.push(r.failure()?.errorText ?? ''); });
  await openConsole(page);
  // Le script lit le projet puis tente de l'envoyer par un chargement de module.
  const dlg = await runCode(page, [
    "const data = encodeURIComponent(JSON.stringify(await drawall.objects()));",
    "await import(location.origin === 'null' ? 'http://localhost:4173/fuite.js?d=' + data : '/fuite.js?d=' + data);",
  ].join('\n'), 'annule');
  await expect(dlg.getByRole('log', { name: 'Sortie du script' })).toContainText('Échec');
  // Ni import(), ni requête d'aucune sorte : rien n'a quitté la page.
  await page.waitForTimeout(500);
  expect(leaks).toEqual([]);
  expect(blocked.every(t => /BLOCKED_BY_CSP|csp/i.test(t))).toBe(true);
  expect(errors).toEqual([]);
});
