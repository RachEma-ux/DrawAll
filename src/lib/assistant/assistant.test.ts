import { describe, expect, it } from 'vitest';
import { withoutDanglingMates, type CadObject } from '@/types/cad';
import { MAX_CORRECTIONS, controlledLoop, dryRun, previewDiff, provisionalId, remapIds, requestKey, scriptedGenerator, type AssistantContext, type Proposal } from './loop';
import { localGenerator } from './local-generator';

const ctx: AssistantContext = {
  objects: [{ id: 'OBJ-0001', name: 'l', kind: 'line', x1: 0, y1: 0, x2: 1000, y2: 0, layerId: 'LAY-0001', classification: 'non-classifie', hatch: 'none', createdSeq: 0 } as CadObject],
  layers: [{ id: 'LAY-0001', name: 'Dessin', locked: false }, { id: 'LAY-0002', name: 'Figé', locked: true }],
  activeLayerId: 'LAY-0001',
};
const column = (x: number, extra: Record<string, unknown> = {}) => ({ type: 'addObject', args: [{ kind: 'column', classification: 'structure', layerId: 'LAY-0001', hatch: 'none', x, y: 0, section: 'rect', b: 300, h: 300, ...extra }] });
const good: Proposal = { steps: [column(0), column(5000)], hypotheses: ['origine en 0;0'] };
const bad: Proposal = { steps: [column(0), column(5000, { b: -300 })], hypotheses: [] };

describe('assistant à boucle contrôlée (lot 18.3) — générateur simulé', () => {
  it('validation à blanc : chaque opération sur l’état laissé par la précédente ; erreurs numérotées', () => {
    const ok = dryRun(good.steps, ctx);
    expect(ok.errors).toEqual([]);
    expect(ok.added.map(o => o.id)).toEqual(['PROP-0001', 'PROP-0002']);
    expect(ok.objects).toHaveLength(3);
    expect(dryRun(bad.steps, ctx).errors).toEqual(['opération 2 (addObject) : poteau rectangulaire : b et h positifs attendus']);
    expect(dryRun([column(0, { layerId: 'LAY-0002' })], ctx).errors).toEqual(['opération 1 (addObject) : calque Figé verrouillé']);
    expect(dryRun([column(0, { layerId: 'LAY-0009' })], ctx).errors[0]).toContain('calque LAY-0009 absent');
    expect(dryRun([{ type: 'reset', args: [] }], ctx).errors).toEqual(['opération 1 (reset) : commande non permise à l’assistant']);
    expect(dryRun([], ctx).errors).toEqual(['aucune opération proposée']);
    // Transformation d'un objet existant puis suppression : simulées dans l'ordre.
    const moved = dryRun([{ type: 'transform', args: [['OBJ-0001'], { kind: 'move', dx: 0, dy: 500 }, 'Déplacer'] }, { type: 'removeObjects', args: [['OBJ-0001']] }], ctx);
    expect(moved.errors).toEqual([]);
    expect(moved.objects).toEqual([]);
    expect(dryRun([{ type: 'removeObjects', args: [['OBJ-0001']] }, { type: 'transform', args: [['OBJ-0001'], { kind: 'move', dx: 1, dy: 0 }, 'x'] }], ctx).errors).toEqual(['opération 2 (transform) : objet OBJ-0001 absent']);
  });

  it('proposition valide du premier coup : prête, aucune correction', async () => {
    const gen = scriptedGenerator([good]);
    const r = await controlledLoop(gen, 'deux poteaux', ctx);
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.corrections).toBe(0);
    expect(r.proposal.hypotheses).toEqual(['origine en 0;0']);
    expect(r.preview.added).toHaveLength(2);
    expect(gen.calls).toHaveLength(1);
    expect(gen.calls[0].feedback).toEqual([]);
  });

  it('correction : les erreurs sont renvoyées au générateur, qui corrige', async () => {
    const gen = scriptedGenerator([bad, good]);
    const r = await controlledLoop(gen, 'deux poteaux', ctx);
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.corrections).toBe(1);
    expect(r.attempts.map(a => a.errors.length)).toEqual([1, 0]);
    expect(gen.calls[1]).toMatchObject({ attempt: 1, feedback: ['opération 2 (addObject) : poteau rectangulaire : b et h positifs attendus'] });
  });

  it('trois corrections au plus : au-delà, échec, rien n’est proposé à l’exécution', async () => {
    const gen = scriptedGenerator([bad]);
    const r = await controlledLoop(gen, 'deux poteaux', ctx);
    expect(r.status).toBe('failed');
    expect(gen.calls).toHaveLength(1 + MAX_CORRECTIONS);
    expect(gen.calls.map(c => c.attempt)).toEqual([0, 1, 2, 3]);
    if (r.status === 'failed') expect(r.errors[0]).toContain('poteau rectangulaire');
  });

  it('questions : la demande ne suffit pas, aucune opération, aucune valeur inventée', async () => {
    const gen = scriptedGenerator([{ steps: [], hypotheses: [], questions: ['Section ?'] }]);
    const r = await controlledLoop(gen, 'des poteaux', ctx);
    expect(r).toMatchObject({ status: 'questions', questions: ['Section ?'] });
  });

  it('générateur en panne : échec déclaré', async () => {
    const r = await controlledLoop({ name: 'x', propose: async () => { throw new Error('hors service'); } }, 'x', ctx);
    expect(r).toMatchObject({ status: 'failed', errors: ['générateur : hors service'] });
  });

  it('cache sémantique : proposition validée resservie sans générateur, revalidée sur le projet du moment', async () => {
    const cache = new Map<string, Proposal>();
    const gen = scriptedGenerator([good]);
    await controlledLoop(gen, 'Deux  poteaux.', ctx, cache);
    const again = await controlledLoop(gen, 'deux poteaux', ctx, cache);
    expect(again).toMatchObject({ status: 'ready', fromCache: true });
    expect(gen.calls).toHaveLength(1);
    expect(requestKey('Deux  poteaux.')).toBe('deux poteaux');
    // Le calque a été verrouillé depuis : la proposition en cache n'est plus valide, le générateur est rappelé.
    const locked = { ...ctx, layers: [{ id: 'LAY-0001', name: 'Dessin', locked: true }] };
    const r = await controlledLoop(gen, 'deux poteaux', locked, cache);
    expect(gen.calls.length).toBeGreaterThan(1);
    expect(r.status).toBe('failed');
    expect(cache.size).toBe(0);
  });
});

describe('générateur local de démonstration (lot 18.3)', () => {
  const run = (request: string) => controlledLoop(localGenerator, request, ctx);

  it('grille de poteaux : 3 × 4 positions, section saisie, hypothèses déclarées', async () => {
    const r = await run('Grille de 3 x 4 poteaux 300 x 300 mm entraxe 5 m');
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    const pos = r.preview.added.map(o => `${(o as { x: number }).x};${(o as { y: number }).y}`);
    expect(pos).toHaveLength(12);
    expect(new Set(pos)).toEqual(new Set([0, 1, 2].flatMap(i => [0, 1, 2, 3].map(j => `${j * 5000};${i * 5000}`))));
    expect(r.preview.added.every(o => o.kind === 'column' && (o as { b?: number }).b === 300 && o.layerId === 'LAY-0001')).toBe(true);
    expect(r.proposal.hypotheses.join(' ')).toMatch(/Origine non précisée/);
    expect(r.proposal.hypotheses.join(' ')).toMatch(/même dans les deux directions : 5[\s\u202f]?000 mm/);
  });

  it('entraxes distincts, poteau circulaire, origine en mètres', async () => {
    const r = await run('grille de 2 x 2 poteaux diamètre 400 mm entraxes 5 m et 6,5 m à partir de 1;2 m');
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.preview.added.map(o => [(o as { x: number }).x, (o as { y: number }).y, (o as { d?: number }).d])).toEqual([[1000, 2000, 400], [6000, 2000, 400], [1000, 8500, 400], [6000, 8500, 400]]);
    expect(r.proposal.hypotheses.join(' ')).not.toMatch(/Origine non précisée/);
  });

  it('valeur absente : question, jamais de section ni d’entraxe par défaut', async () => {
    const r = await run('grille de 3 x 4 poteaux');
    expect(r.status).toBe('questions');
    if (r.status !== 'questions') return;
    expect(r.questions.join(' ')).toMatch(/Section des poteaux/);
    expect(r.questions.join(' ')).toMatch(/Entraxe/);
  });

  it('rectangle de murs : quatre murs fermés, épaisseur saisie', async () => {
    const r = await run('rectangle de murs 6 x 4 m épaisseur 200 mm');
    expect(r.status).toBe('ready');
    if (r.status !== 'ready') return;
    expect(r.preview.added.map(o => { const w = o as unknown as { x1: number; y1: number; x2: number; y2: number; thickness: number }; return [w.x1, w.y1, w.x2, w.y2, w.thickness]; }))
      .toEqual([[0, 0, 6000, 0, 200], [6000, 0, 6000, 4000, 200], [6000, 4000, 0, 4000, 200], [0, 4000, 0, 0, 200]]);
    expect((await run('rectangle de murs 6 x 4 m')).status).toBe('questions');
  });

  it('demande non reconnue : question qui donne les formes reconnues', async () => {
    const r = await run('dessine-moi un mouton');
    expect(r.status).toBe('questions');
    if (r.status === 'questions') expect(r.questions[0]).toMatch(/non reconnue/);
  });

  it('calque actif verrouillé : la proposition échoue à la validation, le générateur déterministe ne corrige pas', async () => {
    const r = await controlledLoop(localGenerator, 'grille de 1 x 2 poteaux 300 x 300 mm entraxe 5 m', { ...ctx, activeLayerId: 'LAY-0002' });
    expect(r.status).toBe('failed');
    if (r.status === 'failed') { expect(r.attempts).toHaveLength(1 + MAX_CORRECTIONS); expect(r.errors[0]).toMatch(/verrouillé/); }
  });
});

describe('aperçu du résultat simulé complet', () => {
  it('créations, modifications et suppressions distinguées (pas seulement les créations)', () => {
    const line = ctx.objects[0];
    const other = { ...line, id: 'OBJ-0002', x1: 0, y1: 1000, x2: 1000, y2: 1000 } as CadObject;
    const r = dryRun([
      { type: 'transform', args: [['OBJ-0001'], { kind: 'move', dx: 0, dy: 500 }, 'Déplacer'] },
      { type: 'removeObjects', args: [['OBJ-0002']] },
      column(0),
    ], { ...ctx, objects: [line, other] });
    expect(r.errors).toEqual([]);
    const d = previewDiff([line, other], r.objects, 'NIV-0001');
    expect(d.added.map(o => o.id)).toEqual(['PROP-0001']);
    expect(d.modified.map(o => o.id)).toEqual(['OBJ-0001']);
    expect(d.removed.map(o => o.id)).toEqual(['OBJ-0002']);
    expect(d.same).toEqual([]);
    // Suppression seule : l'objet supprimé n'apparaît plus parmi les objets montrés tels quels.
    const del = previewDiff([line, other], dryRun([{ type: 'removeObjects', args: [['OBJ-0002']] }], { ...ctx, objects: [line, other] }).objects, 'NIV-0001');
    expect(del.removed.map(o => o.id)).toEqual(['OBJ-0002']);
    expect(del.same.map(o => o.id)).toEqual(['OBJ-0001']);
  });
});

describe('identifiants provisoires', () => {
  it('une opération peut désigner un objet créé plus tôt dans la proposition ; réécrite à l’exécution', () => {
    const wall = { type: 'addObject', args: [{ kind: 'wall', classification: 'architecture', layerId: 'LAY-0001', hatch: 'none', x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200, justification: 'axe' }] };
    const door = { type: 'addObject', args: [{ kind: 'opening', classification: 'architecture', layerId: 'LAY-0001', hatch: 'none', hostId: provisionalId(1), type: 'porte', position: 2000, width: 900, hinge: 'debut', side: 'gauche' }] };
    expect(dryRun([wall, door], ctx).errors).toEqual([]);
    // À l'exécution, l'hôte provisoire est remplacé par l'identifiant réel du mur créé.
    const real = new Map([[provisionalId(1), 'OBJ-0042']]);
    expect((remapIds(door.args, real) as { hostId: string }[])[0].hostId).toBe('OBJ-0042');
    expect(remapIds([['PROP-0009', 'OBJ-0001'], { kind: 'move', dx: 1, dy: 0 }], real)).toEqual([['PROP-0009', 'OBJ-0001'], { kind: 'move', dx: 1, dy: 0 }]);
  });
});

describe('suppression simulée comme la commande', () => {
  it('les objets associatifs partent avec leur parent ; une opération qui les vise ensuite est refusée', () => {
    const wall = { ...ctx.objects[0], id: 'OBJ-0010', kind: 'wall', classification: 'architecture', x1: 0, y1: 0, x2: 4000, y2: 0, thickness: 200, justification: 'axe' } as CadObject;
    const door = { ...ctx.objects[0], id: 'OBJ-0011', kind: 'opening', classification: 'architecture', hostId: 'OBJ-0010', type: 'porte', position: 2000, width: 900 } as unknown as CadObject;
    const c = { ...ctx, objects: [wall, door] };
    const r = dryRun([{ type: 'removeObjects', args: [['OBJ-0010']] }], c);
    expect(r.objects).toEqual([]);
    expect(previewDiff(c.objects, r.objects, 'NIV-0001').removed.map(o => o.id)).toEqual(['OBJ-0010', 'OBJ-0011']);
    expect(dryRun([{ type: 'removeObjects', args: [['OBJ-0010']] }, { type: 'transform', args: [['OBJ-0011'], { kind: 'move', dx: 1, dy: 0 }, 'x'] }], c).errors)
      .toEqual(['opération 2 (transform) : objet OBJ-0011 absent']);
  });
});

describe('transformation simulée comme la commande', () => {
  it('objet d’un calque verrouillé : proposition refusée (la commande ne le bougerait pas)', () => {
    const locked = { ...ctx.objects[0], id: 'OBJ-0020', layerId: 'LAY-0002' } as CadObject;
    const c = { ...ctx, objects: [...ctx.objects, locked] };
    expect(dryRun([{ type: 'transform', args: [['OBJ-0020'], { kind: 'move', dx: 1, dy: 0 }, 'x'] }], c).errors)
      .toEqual(['opération 1 (transform) : OBJ-0020 non transformable (calque verrouillé)']);
    expect(dryRun([{ type: 'transform', args: [['OBJ-0001'], { kind: 'move', dx: 1, dy: 0 }, 'x'] }], c).errors).toEqual([]);
  });
});

describe('liaisons d’assemblage à la suppression', () => {
  it('une occurrence liée à une occurrence supprimée garde sa place et perd sa liaison', () => {
    const occ = (id: string, extra: Record<string, unknown> = {}) => ({ ...ctx.objects[0], id, kind: 'occurrence', sourceId: 'S', x: 0, y: 0, z: 0, angle: 0, ...extra }) as unknown as CadObject;
    const left = withoutDanglingMates([occ('A'), occ('C', { mate: { type: 'coincidence', to: 'B' } })]);
    expect(left.map(o => ('mate' in o ? o.mate : undefined))).toEqual([undefined, undefined]);
    const kept = withoutDanglingMates([occ('B'), occ('C', { mate: { type: 'coincidence', to: 'B' } })]);
    expect((kept[1] as { mate?: unknown }).mate).toEqual({ type: 'coincidence', to: 'B' });
  });
});
