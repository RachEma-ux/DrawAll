import { expect, type Page, type TestInfo } from '@playwright/test';

/** Le projet est-il exécuté en configuration téléphone ? */
export const isPhone = (info: TestInfo) => info.project.name === 'telephone';

/** Ouvre l'atelier sur un projet de démonstration neuf et relève les erreurs JavaScript. */
export async function openAtelier(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('drawall-e2e-init')) {
      localStorage.clear();
      sessionStorage.setItem('drawall-e2e-init', '1');
    }
  });
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  return errors;
}

/** Nombre d'objets de la version courante du projet (stockage local). */
export async function objectCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('drawall-projet-v1');
    if (!raw) return 0;
    const state = JSON.parse(raw) as { versions: { objects: unknown[] }[]; pointer: number };
    return state.versions[state.pointer].objects.length;
  });
}

/** Valeur numérique du zoom affichée dans la barre d'état. */
export async function zoomPercent(page: Page): Promise<number> {
  const text = await page.locator('text=/zoom \\d+ %/').last().textContent();
  return Number(text?.match(/(\d+)/)?.[1] ?? NaN);
}

/** Choisit un outil : barre d'outils, ou menu « Plus » sur petit écran. */
export async function chooseTool(page: Page, label: RegExp) {
  const direct = page.getByRole('button', { name: label }).first();
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }
  await page.getByRole('button', { name: 'Plus d’outils' }).click();
  await page.getByTestId('more-tools').getByRole('button', { name: label }).first().click();
}

/** Gestes tactiles bas niveau (CDP) : un doigt ou deux. */
export async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, points: { x: number; y: number; id?: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points });
  return {
    async drag(from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
      await send('touchStart', [{ ...from, id: 1 }]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id: 1 }]);
      }
      await send('touchEnd', []);
    },
    async tap(at: { x: number; y: number }) {
      await send('touchStart', [{ ...at, id: 1 }]);
      await send('touchEnd', []);
    },
    async pinch(center: { x: number; y: number }, from = 30, to = 110) {
      await send('touchStart', [{ x: center.x - from, y: center.y, id: 1 }]);
      await send('touchStart', [{ x: center.x - from, y: center.y, id: 1 }, { x: center.x + from, y: center.y, id: 2 }]);
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const d = from + ((to - from) * i) / steps;
        await send('touchMove', [{ x: center.x - d, y: center.y, id: 1 }, { x: center.x + d, y: center.y, id: 2 }]);
      }
      await send('touchEnd', []);
    },
  };
}

/** Point du canevas exprimé en fraction de sa taille. */
export async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Remplace le projet local par des objets donnés (projet de démonstration vidé), puis recharge. */
export async function loadObjects(page: Page, objects: Record<string, unknown>[]) {
  await page.evaluate(objs => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    const v = s.versions[s.pointer];
    v.objects = objs.map(o => ({ classification: 'non-classifie', layerId: 'LAY-0004', hatch: 'none', createdSeq: 0, name: String(o.id), ...o }));
    s.versions = [v];
    s.pointer = 0;
    s.counter = 100;
    localStorage.setItem('drawall-projet-v1', JSON.stringify(s));
  }, objects);
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
}

/** Convertit un point du modèle (mm) en point écran, d'après la transformation du canevas. */
export async function toScreen(page: Page, x: number, y: number) {
  const tr = await page.getByTestId('canvas').locator('> g').first().getAttribute('transform');
  const m = tr!.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/)!;
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + Number(m[1]) + x * Number(m[3]), y: box.y + Number(m[2]) + y * Number(m[3]) };
}

/** Objets de la version courante. */
export async function currentObjects(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    return s.versions[s.pointer].objects;
  });
}

/** Touche (téléphone) ou clique (bureau) un point du modèle (mm). */
export async function tapModel(page: Page, info: TestInfo, x: number, y: number) {
  const at = await toScreen(page, x, y);
  if (isPhone(info)) await (await touch(page)).tap(at);
  else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(100);
}
