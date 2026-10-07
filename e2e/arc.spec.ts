import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { canvasPoint, chooseTool, isPhone, objectCount, openAtelier, touch } from './helpers';

async function tapAt(page: Page, info: TestInfo, fx: number, fy: number) {
  const at = await canvasPoint(page, fx, fy);
  if (isPhone(info)) await (await touch(page)).tap(at);
  else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(80);
}

async function lastObject(page: Page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    const objects = s.versions[s.pointer].objects;
    return objects[objects.length - 1];
  });
}

test('lot 1.3 — arc par trois points', async ({ page }, info) => {
  const errors = await openAtelier(page);
  const before = await objectCount(page);
  await chooseTool(page, /^Arc 3 points/);
  await tapAt(page, info, 0.3, 0.85);
  await tapAt(page, info, 0.5, 0.75);
  await tapAt(page, info, 0.7, 0.85);
  await expect.poll(() => objectCount(page)).toBe(before + 1);
  const arc = await lastObject(page);
  expect(arc.kind).toBe('arc');
  expect(arc.r).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('lot 1.3 — arc par le centre', async ({ page }, info) => {
  await openAtelier(page);
  const before = await objectCount(page);
  await chooseTool(page, /^Arc par le centre/);
  await tapAt(page, info, 0.5, 0.85);
  await tapAt(page, info, 0.65, 0.85);
  await tapAt(page, info, 0.5, 0.75);
  await expect.poll(() => objectCount(page)).toBe(before + 1);
  const arc = await lastObject(page);
  expect(arc.kind).toBe('arc');
  // Début à droite du centre (0°), fin au-dessus (90°) : quart de cercle antihoraire.
  expect(arc.start).toBeCloseTo(0, 0);
  expect(arc.end).toBeCloseTo(90, 0);
});
