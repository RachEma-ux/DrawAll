import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion, ProjectState, Sheet } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { normalizeProjectState } from '@/store/project';
import { createBranch } from './branches';
import { fromPackage, toPackage } from './package';
import { pdfString } from './pdf';
import { buildPublication, publicationStatus, type Publication } from './publication';

const layers = createDefaultLayers();
const base = { classification: 'non-classifie' as const, layerId: layers[0].id, hatch: 'none' as const, createdSeq: 0 };
const text = (content: string) => ({ ...base, id: 'OBJ-0001', name: 't', kind: 'text', x: 0, y: 0, content, height: 250, rotation: 0, align: 'left' }) as CadObject;
const sheet: Sheet = {
  id: 'FEU-0001', name: 'Plan', format: 'A3', orientation: 'paysage', margins: { top: 10, right: 10, bottom: 10, left: 20 },
  viewports: [{ id: 'FEN-0001', name: 'Plan', x: 20, y: 10, w: 390, h: 245, scale: { paper: 1, model: 50 }, center: { x: 0, y: 0 }, hiddenLayerIds: [] }],
};
const v = (seq: number, content: string): MicroVersion => ({ seq, label: `v${seq}`, time: seq, objects: [text(content)], layers, blocks: [], sheets: [sheet] });
const state = (): ProjectState => normalizeProjectState({ versions: [v(0, 'Avant-projet')], pointer: 0, counter: 1, layerCounter: 4, blockCounter: 0, activeLayerId: layers[0].id });
const date = new Date(Date.UTC(2026, 9, 8, 12));
const ok = (p: Publication | { error: string }) => { if ('error' in p) throw new Error(p.error); return p; };

describe('publication (lot 14.4)', () => {
  it('dossier : un PDF par feuille, de la version courante', () => {
    const p = ok(buildPublication(state(), 'PUB-0001', 'Permis', date));
    expect(p).toMatchObject({ id: 'PUB-0001', name: 'Permis', branchId: 'BR-0000', branchName: 'Principale', seq: 0, time: date.getTime() });
    expect(p.sheets.map(s => s.id)).toEqual(['FEU-0001']);
    expect(p.sheets[0].pdf.startsWith('%PDF-')).toBe(true);
    expect(p.sheets[0].pdf).toContain(pdfString('Avant-projet'));
    expect(buildPublication(state(), 'X', ' ', date)).toEqual({ error: 'Nom de publication attendu.' });
  });

  it('le dossier publié ne change pas quand le projet évolue ; son état passe à « modifié depuis »', () => {
    let s = state();
    const p = ok(buildPublication(s, 'PUB-0001', 'Permis', date));
    const frozen = p.sheets[0].pdf;
    expect(publicationStatus(s, p)).toBe('publié');
    s = { ...s, versions: [...s.versions, v(1, 'Projet modifié')], pointer: 1 };
    expect(publicationStatus(s, p)).toBe('modifié depuis');
    expect(p.sheets[0].pdf).toBe(frozen);
    expect(frozen).not.toContain(pdfString('Projet modifié'));
    expect(ok(buildPublication(s, 'PUB-0002', 'Suivant', date)).sheets[0].pdf).toContain(pdfString('Projet modifié'));
    // Revenir à la version publiée : de nouveau « publié ».
    expect(publicationStatus({ ...s, pointer: 0 }, p)).toBe('publié');
    expect(publicationStatus(createBranch(s, 'B') as ProjectState, p)).toBe('autre variante');
  });

  it('sans feuille : refus ; dossiers conservés par le paquet natif', () => {
    const empty = normalizeProjectState({ versions: [{ ...v(0, 'x'), sheets: [] }], pointer: 0, counter: 1, layerCounter: 4, blockCounter: 0, activeLayerId: layers[0].id });
    expect(buildPublication(empty, 'X', 'Permis', date)).toEqual({ error: 'Aucune feuille à publier : créez d’abord une feuille.' });
    const s = { ...state(), publications: [ok(buildPublication(state(), 'PUB-0001', 'Permis', date))] };
    const pkg = toPackage(s);
    const back = fromPackage(pkg);
    if (!back.ok) throw new Error(back.error);
    expect(back.state.publications).toEqual(s.publications);
    expect(toPackage(back.state)).toBe(pkg);
  });
});
