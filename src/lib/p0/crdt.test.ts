// Essai P0 — bibliothèque CRDT (annexe D.3 : « Yjs vs Automerge, à évaluer en P0 ») pour la note de
// décision 11.5. Périmètre de la décision D3 : texte d'annotation et métadonnées légères (la géométrie
// relève de la réservation et de la fusion validée). Critères de l'annexe : charge mémoire, granularité
// des mises à jour, observabilité. Les deux bibliothèques sont des dépendances de développement.
// Avec P0_REPORT=<fichier>, les mesures sont écrites (docs/p0/11.5-crdt-mesures.json) ; lancer avec
// NODE_OPTIONS=--expose-gc pour des mesures de mémoire stables.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import * as A from '@automerge/automerge';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { moyenne: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100, p95: Math.round(s[Math.floor(s.length * 0.95)] * 100) / 100, max: s[s.length - 1] };
};
const gc = () => (globalThis as { gc?: () => void }).gc?.();
const mem = () => { gc(); const m = process.memoryUsage(); return m.heapUsed + m.external; };
const mo = (b: number) => Math.round((b / 1e6) * 100) / 100;

/** Saisie d'une annotation : 2 000 frappes au curseur, 10 % d'effacements, quelques sauts de curseur. */
type Op = { pos: number; ins?: string; del?: boolean };
function typing(n = 2000): Op[] {
  const r = rng(7), ops: Op[] = [];
  let len = 0, cur = 0;
  for (let i = 0; i < n; i++) {
    if (r() < 0.02) cur = Math.floor(r() * (len + 1));
    if (r() < 0.1 && cur > 0) { ops.push({ pos: cur - 1, del: true }); cur--; len--; continue; }
    ops.push({ pos: cur, ins: 'abcdefghijklmnopqrstuvwxyz '[Math.floor(r() * 27)] }); cur++; len++;
  }
  return ops;
}
/** Métadonnées : 500 objets (nom, calque, classe, deux propriétés), puis 5 000 modifications. */
const OBJECTS = 500;
function metaEdits(n = 5000) {
  const r = rng(11);
  return Array.from({ length: n }, (_, i) => ({ obj: `OBJ-${Math.floor(r() * OBJECTS)}`, key: ['nom', 'calque', 'classe', 'p1', 'p2'][Math.floor(r() * 5)], value: r() < 0.5 ? `v${i}` : Math.round(r() * 1e6) / 100 }));
}
const initialMeta = () => Object.fromEntries(Array.from({ length: OBJECTS }, (_, i) => [`OBJ-${i}`, { nom: `Objet ${i}`, calque: 'C1', classe: 'non-classifie', p1: 0, p2: '' }]));

const report: Record<string, unknown> = {};

// Bancs de plusieurs milliers d'opérations : délai large quand toute la suite tourne en parallèle.
describe('essai P0 — CRDT pour annotations et métadonnées (D3)', { timeout: 60000 }, () => {
  const ops = typing(), edits = metaEdits();

  it('Yjs : saisie et métadonnées', () => {
    const m0 = mem();
    const doc = new Y.Doc();
    const text = doc.getText('annotation');
    const sizes: number[] = [], times: number[] = [];
    doc.on('update', (u: Uint8Array) => sizes.push(u.byteLength));
    for (const o of ops) { const t = performance.now(); if (o.ins) text.insert(o.pos, o.ins); else text.delete(o.pos, 1); times.push(performance.now() - t); }
    const meta = doc.getMap<Y.Map<unknown>>('objets');
    doc.transact(() => { for (const [k, v] of Object.entries(initialMeta())) meta.set(k, new Y.Map(Object.entries(v))); });
    const msizes: number[] = [], mtimes: number[] = [];
    for (const e of edits) { const t = performance.now(); meta.get(e.obj)!.set(e.key, e.value); mtimes.push(performance.now() - t); }
    msizes.push(...sizes.splice(ops.length + 1));
    const saved = Y.encodeStateAsUpdate(doc);
    const t = performance.now(); const copy = new Y.Doc(); Y.applyUpdate(copy, saved); const loadMs = performance.now() - t;
    expect(copy.getText('annotation').toString()).toBe(text.toString());
    report.yjs = {
      saisie: { majOctets: stats(sizes.slice(0, ops.length)), ms: stats(times) },
      metadonnees: { majOctets: stats(msizes), ms: stats(mtimes) },
      documentEnregistreOctets: saved.byteLength, rechargementMs: Math.round(loadMs * 10) / 10, memoireMo: mo(mem() - m0),
    };
  });

  it('Automerge : saisie et métadonnées', () => {
    const m0 = mem();
    let doc = A.from<{ annotation: string; objets: Record<string, Record<string, string | number>> }>({ annotation: '', objets: {} });
    const sizes: number[] = [], times: number[] = [];
    for (const o of ops) {
      const t = performance.now();
      doc = A.change(doc, d => { A.splice(d, ['annotation'], o.pos, o.ins ? 0 : 1, o.ins ?? ''); });
      times.push(performance.now() - t);
      sizes.push(A.getLastLocalChange(doc)!.byteLength);
    }
    doc = A.change(doc, d => { d.objets = initialMeta(); });
    const msizes: number[] = [], mtimes: number[] = [];
    for (const e of edits) {
      const t = performance.now();
      doc = A.change(doc, d => { d.objets[e.obj][e.key] = e.value; });
      mtimes.push(performance.now() - t);
      msizes.push(A.getLastLocalChange(doc)!.byteLength);
    }
    const saved = A.save(doc);
    const t = performance.now(); const copy = A.load<typeof doc>(saved); const loadMs = performance.now() - t;
    expect(copy.annotation).toBe(doc.annotation);
    report.automerge = {
      saisie: { majOctets: stats(sizes), ms: stats(times) },
      metadonnees: { majOctets: stats(msizes), ms: stats(mtimes) },
      documentEnregistreOctets: saved.byteLength, rechargementMs: Math.round(loadMs * 10) / 10, memoireMo: mo(mem() - m0),
    };
  });

  it('même texte final pour les deux bibliothèques', () => {
    const y = new Y.Doc(), yt = y.getText('t');
    let a = A.from<{ t: string }>({ t: '' });
    for (const o of ops) {
      if (o.ins) yt.insert(o.pos, o.ins); else yt.delete(o.pos, 1);
      a = A.change(a, d => { A.splice(d, ['t'], o.pos, o.ins ? 0 : 1, o.ins ?? ''); });
    }
    expect(a.t).toBe(yt.toString());
    expect(a.t.length).toBeGreaterThan(1000);
  });

  it('modifications concurrentes : convergence, intentions gardées, conflit observable ?', () => {
    // Base commune, puis deux répliques modifient en même temps, puis échangent.
    const base = 'Note de relevé : mur porteur à vérifier.';
    // Yjs
    const y1 = new Y.Doc(); y1.getText('t').insert(0, base);
    const m1 = y1.getMap<Y.Map<unknown>>('o'); m1.set('OBJ-1', new Y.Map([['calque', 'C1']])); m1.set('OBJ-2', new Y.Map([['p1', 0]]));
    const y2 = new Y.Doc(); Y.applyUpdate(y2, Y.encodeStateAsUpdate(y1));
    y1.getText('t').insert(5, 'AAA '); y2.getText('t').insert(30, 'BBB ');
    y1.getMap<Y.Map<unknown>>('o').get('OBJ-1')!.set('calque', 'C2'); y2.getMap<Y.Map<unknown>>('o').get('OBJ-1')!.set('calque', 'C3');
    y1.getMap('o').delete('OBJ-2'); y2.getMap<Y.Map<unknown>>('o').get('OBJ-2')!.set('p1', 42);
    const s1 = Y.encodeStateAsUpdate(y1), s2 = Y.encodeStateAsUpdate(y2);
    Y.applyUpdate(y1, s2); Y.applyUpdate(y2, s1);
    expect(y1.getText('t').toString()).toBe(y2.getText('t').toString());
    expect(y1.getText('t').toString()).toContain('AAA ');
    expect(y1.getText('t').toString()).toContain('BBB ');
    expect(JSON.stringify(y1.getMap('o').toJSON())).toBe(JSON.stringify(y2.getMap('o').toJSON()));
    const yCalque = (y1.getMap<Y.Map<unknown>>('o').get('OBJ-1')!.get('calque'));

    // Automerge
    type D = { t: string; o: Record<string, Record<string, string | number>> };
    let a1 = A.from<D>({ t: base, o: { 'OBJ-1': { calque: 'C1' }, 'OBJ-2': { p1: 0 } } });
    let a2 = A.clone(a1);
    a1 = A.change(a1, d => { A.splice(d, ['t'], 5, 0, 'AAA '); d.o['OBJ-1'].calque = 'C2'; delete d.o['OBJ-2']; });
    a2 = A.change(a2, d => { A.splice(d, ['t'], 30, 0, 'BBB '); d.o['OBJ-1'].calque = 'C3'; d.o['OBJ-2'].p1 = 42; });
    const b1 = A.merge(A.clone(a1), a2), b2 = A.merge(A.clone(a2), a1);
    expect(b1.t).toBe(b2.t);
    expect(b1.t).toContain('AAA ');
    expect(b1.t).toContain('BBB ');
    expect(JSON.stringify(b1.o)).toBe(JSON.stringify(b2.o));
    // Automerge expose les valeurs concurrentes d'une même clé ; Yjs en garde une sans le signaler.
    const conflicts = A.getConflicts(b1.o['OBJ-1'], 'calque');
    expect(Object.values(conflicts ?? {}).sort()).toEqual(['C2', 'C3']);

    report.concurrence = {
      texte: 'les deux insertions sont gardées, mêmes résultats sur les deux répliques (Yjs et Automerge)',
      memeCleDeuxValeurs: { yjs: `une valeur retenue (${String(yCalque)}), aucun signalement`, automerge: `une valeur retenue (${String(b1.o['OBJ-1'].calque)}), les deux consultables par getConflicts` },
      suppressionContreModification: { yjs: y1.getMap('o').has('OBJ-2') ? 'objet gardé' : 'objet supprimé, modification concurrente perdue sans signalement', automerge: 'OBJ-2' in b1.o ? 'objet gardé' : 'objet supprimé, modification concurrente perdue sans signalement' },
    };
  });

  it('poids dans le navigateur (minifié, gzip) et compte rendu', async () => {
    const size = async (contents: string) => {
      const r = await build({ stdin: { contents, resolveDir: process.cwd() }, bundle: true, minify: true, write: false, format: 'esm', platform: 'browser', loader: { '.wasm': 'binary' }, logLevel: 'silent' });
      const bytes = r.outputFiles[0].contents;
      return { minifieMo: mo(bytes.byteLength), gzipMo: mo(gzipSync(bytes).byteLength) };
    };
    report.poids = {
      yjs: await size("export * from 'yjs';"),
      automerge: await size("export * from '@automerge/automerge';"),
    };
    expect(report.yjs).toBeDefined();
    if (process.env.P0_REPORT) {
      writeFileSync(process.env.P0_REPORT, JSON.stringify({ moteur: `Node ${process.version}`, gcExpose: typeof (globalThis as { gc?: unknown }).gc === 'function', date: new Date().toISOString().slice(0, 10), versions: { yjs: '13.6.33', automerge: '3.5.0' }, ...report }, null, 2) + '\n');
    }
  }, 60000);
});
