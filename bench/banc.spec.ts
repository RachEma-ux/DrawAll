// Banc de mesure (lot 19.2, Concept §11) : temps de retour p95 et temps de trame p95 sur le projet
// de référence déclaré (src/lib/bench/reference.ts). Écrit le rapport versionné dans docs/mesures/
// (ou BENCH_OUT). Lancement : npm run bench.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, totalmem, platform, release } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { REFERENCE_SPEC, referenceProject } from '../src/lib/bench/reference';

const N = Number(process.env.BENCH_N ?? 60);
const WARMUP = Math.min(5, Number(process.env.BENCH_N ?? 60));
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const r2 = (v: number) => Math.round(v * 100) / 100;

declare global { interface Window { __arm: (type: string) => void; __done: Promise<number | null> } }

/** Sonde : de l'horodatage de l'événement d'entrée à la trame qui suit la mise à jour du DOM. */
async function installProbe(page: Page) {
  await page.evaluate(() => {
    window.__arm = (type: string) => {
      window.__done = new Promise(resolve => {
        let t0: number | null = null;
        const onEvent = (e: Event) => { if (t0 === null) t0 = e.timeStamp; };
        document.addEventListener(type, onEvent, { capture: true });
        const mo = new MutationObserver(() => {
          if (t0 === null) return;
          mo.disconnect();
          document.removeEventListener(type, onEvent, { capture: true });
          const start = t0;
          // La trame est peinte après les rappels requestAnimationFrame : la tâche suivante la suit.
          requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start), 0));
        });
        mo.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
        setTimeout(() => { mo.disconnect(); resolve(null); }, 5000);
      });
    };
  });
}

async function settle(page: Page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));
}

async function measure(page: Page, type: string, act: (i: number) => Promise<void>, before?: (i: number) => Promise<void>) {
  const out: number[] = [];
  for (let i = 0; i < WARMUP + N; i++) {
    if (before) await before(i);
    await settle(page);
    await page.evaluate(t => window.__arm(t), type);
    await act(i);
    const v = await page.evaluate(() => window.__done);
    expect(v, `${type} : aucune mise à jour de l'affichage (mesure ${i})`).not.toBeNull();
    if (i >= WARMUP) out.push(v!);
  }
  return { n: out.length, p95: r2(p95(out)), median: r2(median(out)), max: r2(Math.max(...out)) };
}

async function toScreen(page: Page, x: number, y: number) {
  const tr = await page.getByTestId('canvas').locator('> g').first().getAttribute('transform');
  const m = tr!.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)\s*scale\(([-\d.e]+)\)/)!;
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + Number(m[1]) + x * Number(m[3]), y: box.y + Number(m[2]) + y * Number(m[3]) };
}

test('banc de mesure — projet de référence déclaré', async ({ page, browser }) => {
  test.setTimeout(3_600_000);
  const ref = referenceProject();
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.evaluate(({ objects, levels }) => {
    const s = JSON.parse(localStorage.getItem('drawall-projet-v1')!);
    const v = s.versions[s.pointer];
    v.objects = objects;
    v.levels = levels;
    s.versions = [v];
    s.pointer = 0;
    s.counter = objects.length;
    s.activeLevelId = levels[0].id;
    localStorage.setItem('drawall-projet-v1', JSON.stringify(s));
  }, { objects: ref.objects, levels: ref.levels });

  // Ouverture (cache chaud) : rechargement jusqu'au dessin des pièces du niveau actif.
  const t0 = Date.now();
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await settle(page);
  const openMs = Date.now() - t0;
  const shown = ref.objects.filter(o => o.levelId === ref.levels[0].id).length;
  await installProbe(page);
  const pitch = REFERENCE_SPEC.pitch;

  // 1. Zoom à la molette.
  const centre = await toScreen(page, 5 * pitch, 5 * pitch);
  await page.mouse.move(centre.x, centre.y);
  const zoom = await measure(page, 'wheel', async i => { await page.mouse.wheel(0, i % 2 ? 120 : -120); });

  // 2. Sélection d'un mur au clic (deux murs en alternance).
  await page.getByRole('button', { name: 'Cadrer', exact: true }).click();
  await settle(page);
  // Hors des portes (au milieu des murs du bas) et des poteaux.
  const targets = [await toScreen(page, 2.2 * pitch, 3 * pitch), await toScreen(page, 6.8 * pitch, 7 * pitch)];
  const select = await measure(page, 'pointerdown', async () => { await page.mouse.down(); await page.mouse.up(); }, async i => { await page.mouse.move(targets[i % 2].x, targets[i % 2].y); });

  // 3. Déplacement au clavier de la sélection (nouvelle version à chaque pas), puis 4. annuler.
  const move = await measure(page, 'keydown', async i => { await page.keyboard.press(i % 2 ? 'Shift+ArrowLeft' : 'Shift+ArrowRight'); });
  const undo = await measure(page, 'keydown', async () => { await page.keyboard.press('Control+z'); });

  // 5. Temps de trame en plan : 120 trames, la vue zoomée à chaque trame (tout le dessin redessiné).
  const planFrames = await page.evaluate(async () => {
    const svg = document.querySelector('[data-testid="canvas"]')!;
    const r = svg.getBoundingClientRect();
    const times: number[] = [];
    await new Promise<void>(done => {
      let i = 0;
      const step = (t: number) => {
        times.push(t);
        svg.dispatchEvent(new WheelEvent('wheel', { deltaY: i % 2 ? 100 : -100, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
        if (++i <= 125) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    return times.slice(6).map((t, k) => t - times[5 + k]);
  });
  // Image sautée : intervalle de plus d'une fois et demie la période d'affichage (60 Hz).
  const plan = { n: planFrames.length, p95: r2(p95(planFrames)), median: r2(median(planFrames)), max: r2(Math.max(...planFrames)), imagesSautees: planFrames.filter(t => t > 1.5 * (1000 / 60)).length };

  // 6. Temps de trame de la vue 3D (60 trames autour du bâtiment, attendues jusqu'à la fin du GPU).
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Rechercher un outil/).fill('vue 3d');
  await page.getByText('Vue 3D', { exact: true }).click();
  const view3d = page.getByRole('dialog', { name: 'Vue 3D' });
  await expect(view3d).toHaveAttribute('data-trame-p95', /\d/, { timeout: 120_000 });
  const p3d = Number(await view3d.getAttribute('data-trame-p95'));
  const meshes = Number(await view3d.getAttribute('data-solides'));

  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return 'WebGL2 indisponible';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });
  const viewport = page.viewportSize()!;
  const env = {
    date: new Date().toISOString().slice(0, 10),
    navigateur: `Chromium ${browser.version()} (sans tête)`,
    processeur: `${cpus()[0]?.model ?? 'inconnu'} × ${cpus().length}`,
    memoire: `${Math.round(totalmem() / 2 ** 30)} Gio`,
    systeme: `${platform()} ${release()}`,
    gpu,
    fenetre: `${viewport.width} × ${viewport.height}`,
    reseau: 'aucun (application servie en local, vite preview)',
    cache: 'chaud (deuxième chargement)',
  };
  const result = {
    lot: '19.2',
    projet: { spec: REFERENCE_SPEC, objets: ref.objects.length, parType: ref.counts, niveaux: ref.levels.length, elementsAffichesNiveauActif: shown, maillages3d: meshes },
    environnement: env,
    methode: {
      retour: `de l'horodatage de l'événement d'entrée (Event.timeStamp, entrée Playwright de confiance) à la tâche qui suit la première trame après la mise à jour du DOM ; ${N} mesures après ${WARMUP} d'échauffement`,
      tramePlan: `120 trames consécutives, la vue zoomée à chaque trame ; intervalle entre rappels requestAnimationFrame et images sautées (intervalle > 25 ms) ; la cible est jugée à la gigue de l'horloge d'affichage près (${VSYNC_JITTER_MS} ms)`,
      trame3d: 'mesure intégrée de la vue 3D (lot 15.1) : 60 trames, gl.finish',
    },
    ouvertureMs: openMs,
    retours: { zoom, selection: select, deplacementClavier: move, annuler: undo },
    trames: { plan, vue3dP95: p3d },
    cibles: { retourP95Ms: 100, trameP95Ms: 16.7 },
  };
  const out = process.env.BENCH_OUT ?? join(process.cwd(), 'docs', 'mesures');
  mkdirSync(out, { recursive: true });
  // Mesure précédente du même banc (rapport versionné), pour la comparaison.
  const previousFile = join(out, 'banc-19.2.json');
  const previous = existsSync(previousFile) ? JSON.parse(readFileSync(previousFile, 'utf8')) as Previous : undefined;
  writeFileSync(join(out, 'banc-19.2.json'), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(out, 'DrawAll_Banc_de_mesure.md'), report(result, previous));
});

type Stat = { n: number; p95: number; median: number; max: number; imagesSautees?: number };
type Previous = { environnement: { date: string }; retours: Record<string, Stat>; trames: { plan: Stat; vue3dP95: number } };
/** Gigue de l'horloge d'affichage : un intervalle de 16,8 ms à 60 Hz n'est pas une image sautée. */
const VSYNC_JITTER_MS = 0.5;
const KIND_FR: Record<string, string> = { wall: 'murs', column: 'poteaux', opening: 'portes', room: 'pièces' };
function report(r: { projet: { spec: { levels: number; cells: number; pitch: number }; objets: number; parType: Record<string, number>; niveaux: number; elementsAffichesNiveauActif: number; maillages3d: number }; environnement: Record<string, string>; methode: Record<string, string>; ouvertureMs: number; retours: Record<string, Stat>; trames: { plan: Stat; vue3dP95: number }; cibles: { retourP95Ms: number; trameP95Ms: number } }, previous?: Previous): string {
  const fr = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const verdict = (v: number, cible: number) => (v <= cible ? 'atteinte' : 'non atteinte');
  const label: Record<string, string> = { zoom: 'Zoom à la molette', selection: 'Sélection d’un mur au clic', deplacementClavier: 'Déplacement au clavier (nouvelle version)', annuler: 'Annuler (Ctrl+Z)' };
  const missed = [
    ...Object.entries(r.retours).filter(([, s]) => s.p95 >= r.cibles.retourP95Ms).map(([k]) => `${(label[k] ?? k).toLowerCase()} (retour)`),
    ...(r.trames.plan.p95 > r.cibles.trameP95Ms + VSYNC_JITTER_MS ? ['trame en plan'] : []),
  ];
  return [
    '# DrawAll — banc de mesure (lot 19.2)',
    '',
    'Rapport écrit par `npm run bench` (`bench/banc.spec.ts`). Concept §11 : retour simple p95 < 100 ms ; budget de trame p95 ≤ 16,7 ms pour 60 images/s. Les valeurs sont celles mesurées sur l’environnement déclaré ci-dessous, et sur lui seul.',
    '',
    '## Projet de référence déclaré',
    '',
    `Trame de ${r.projet.spec.cells} × ${r.projet.spec.cells} pièces de ${fr(r.projet.spec.pitch)} mm d’axe en axe, sur ${r.projet.niveaux} niveaux (\`src/lib/bench/reference.ts\`) : ${r.projet.objets} objets (${Object.entries(r.projet.parType).map(([k, v]) => `${KIND_FR[k] ?? k} : ${v}`).join(', ')}). Niveau actif affiché en entier : ${r.projet.elementsAffichesNiveauActif} objets ; vue 3D : ${r.projet.maillages3d} maillages.`,
    '',
    '## Environnement',
    '',
    '| Élément | Valeur |', '| --- | --- |',
    ...Object.entries(r.environnement).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Méthode',
    '',
    ...Object.entries(r.methode).map(([k, v]) => `- **${k}** : ${v}.`),
    '',
    '## Résultats',
    '',
    `Ouverture du projet (rechargement jusqu’au cadrage) : ${fr(r.ouvertureMs)} ms.`,
    '',
    ...(previous ? [`Colonne « p95 précédent » : mesure versionnée du ${previous.environnement.date}, avant ce passage.`, ''] : []),
    `| Retour | Mesures | Médiane (ms) | p95 (ms) | Max (ms) |${previous ? ' p95 précédent (ms) |' : ''} Cible p95 < 100 ms |`, `| --- | --- | --- | --- | --- |${previous ? ' --- |' : ''} --- |`,
    ...Object.entries(r.retours).map(([k, s]) => `| ${label[k] ?? k} | ${s.n} | ${fr(s.median)} | ${fr(s.p95)} | ${fr(s.max)} |${previous ? ` ${previous.retours[k] ? fr(previous.retours[k].p95) : '—'} |` : ''} ${verdict(s.p95, r.cibles.retourP95Ms - 1e-9)} |`),
    '',
    `| Trame | Mesures | Médiane (ms) | p95 (ms) | Images sautées |${previous ? ' p95 précédent (ms) |' : ''} Cible p95 ≤ 16,7 ms |`, `| --- | --- | --- | --- | --- |${previous ? ' --- |' : ''} --- |`,
    `| Plan, vue zoomée à chaque trame | ${r.trames.plan.n} | ${fr(r.trames.plan.median)} | ${fr(r.trames.plan.p95)} | ${r.trames.plan.imagesSautees ?? '—'} |${previous ? ` ${fr(previous.trames.plan.p95)} |` : ''} ${verdict(r.trames.plan.p95, r.cibles.trameP95Ms + VSYNC_JITTER_MS)} |`,
    `| Vue 3D (orbite) | 60 | — | ${fr(r.trames.vue3dP95)} | — |${previous ? ` ${fr(previous.trames.vue3dP95)} |` : ''} ${verdict(r.trames.vue3dP95, r.cibles.trameP95Ms)} |`,
    '',
    '## Lecture',
    '',
    missed.length
      ? `- Au-dessus des cibles sur ce projet : ${missed.join(', ')}.`
      : '- Toutes les cibles sont atteintes sur ce projet.',
    '- Rendu du plan : pendant un geste de zoom, seule la transformation du plan change ; les objets sont redessinés à la nouvelle échelle (épaisseurs de trait, tailles d’annotation) 120 ms après le dernier pas. Après une modification ou une annulation, seuls les objets touchés sont redessinés. Le reste du temps de retour est surtout le travail du navigateur (style et peinture du SVG).',
    `- Vue 3D : budget de trame ${r.trames.vue3dP95 <= r.cibles.trameP95Ms ? 'tenu' : 'dépassé'}, rendu par le processeur graphique déclaré.`,
    '',
    '## Limites',
    '',
    '- Un seul appareil, celui déclaré : ni téléphone, ni projet très volumineux (Concept §11 : bancs propres).',
    '- Navigateur sans tête ; le rendu graphique est celui indiqué à la ligne « gpu » (rendu logiciel le cas échéant), qui pèse sur la vue 3D.',
    '- Une cible non atteinte est un résultat, pas un échec du banc : elle désigne ce qu’il faut optimiser.',
    '',
  ].join('\n');
}
