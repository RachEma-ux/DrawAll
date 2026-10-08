import { describe, expect, it } from 'vitest';
import type { CadObject, CutObj } from '@/types/cad';
import { cutView, distanceToCut, materialIntervals } from './cuts';

const base = { classification: 'mecanique' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0, name: 'o' };
// Platine percée : 100 × 60, deux perçages Ø 12,5 sur l'axe y = 30, épaisseur 10.
const plate: CadObject = { ...base, id: 'OBJ-0001', kind: 'rect', x: 0, y: 0, w: 100, h: 60, holes: ['OBJ-0002', 'OBJ-0003'] };
const h1: CadObject = { ...base, id: 'OBJ-0002', kind: 'circle', cx: 25, cy: 30, r: 6.25 };
const h2: CadObject = { ...base, id: 'OBJ-0003', kind: 'circle', cx: 75, cy: 30, r: 6.25 };
const mark = (o: Partial<Extract<CadObject, { kind: 'section' }>> = {}): CadObject => ({ ...base, id: 'OBJ-0004', kind: 'section', x1: -10, y1: 30, x2: 110, y2: 30, label: 'A', ...o });
const cut: CutObj = { ...base, id: 'OBJ-0005', kind: 'cut', sourceId: 'OBJ-0001', markId: 'OBJ-0004', depth: 10, gap: 20 };
const all = (m = mark()) => [plate, h1, h2, m];

describe('coupes (lot 5.3) — platine percée', () => {
  it('coupe A–A par l’axe des perçages : trois surfaces coupées, les perçages sont des vides', () => {
    const r = cutView(cut, plate, mark(), all(), 3, 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const xs = r.value.material.map(m => [m.x, m.x + m.w].map(v => Math.round(v * 1e4) / 1e4));
    expect(xs).toEqual([[0, 18.75], [31.25, 68.75], [81.25, 100]]);
    expect(r.value.material.every(m => m.h === 10)).toBe(true);
    expect(r.value.hatch.length).toBeGreaterThan(0);
    // Aucune hachure dans un vide de perçage.
    expect(r.value.hatch.every(([x1, , x2]) => !(Math.min(x1, x2) > 18.76 && Math.max(x1, x2) < 31.24))).toBe(true);
    expect(r.value.label.text).toBe('A–A');
  });

  it('placement selon le sens des flèches et la méthode de projection', () => {
    // Trace vers +x, flèches à gauche = vers le haut de l'écran : premier dièdre, vue au-dessus de la face.
    const up = cutView(cut, plate, mark(), all(), 3, 5);
    expect(up.ok && up.value.frame.y).toBe(-30);
    const down = cutView(cut, plate, mark({ flip: true }), all(mark({ flip: true })), 3, 5);
    expect(down.ok && down.value.frame.y).toBe(80);
    const third = cutView({ ...cut, method: 'troisieme-diedre' }, plate, mark(), all(), 3, 5);
    expect(third.ok && third.value.frame.y).toBe(80);
  });

  it('trace verticale : coupe le long de y', () => {
    const v = mark({ x1: 25, y1: -10, x2: 25, y2: 70 });
    const r = cutView(cut, plate, v, all(v), 3, 5);
    expect(r.ok && r.value.material.map(m => [m.y, Math.round((m.y + m.h) * 1e4) / 1e4])).toEqual([[0, 23.75], [36.25, 60]]);
  });

  it('modifier la face ou la trace met la coupe à jour', () => {
    const wide = { ...plate, w: 140 } as CadObject;
    const long = mark({ x2: 150 });
    const r = cutView(cut, wide, long, [wide, h1, h2, long], 3, 5);
    expect(r.ok && r.value.material[2].x + r.value.material[2].w).toBe(140);
    const off = mark({ y1: 10, y2: 10 });
    const r2 = cutView(cut, plate, off, all(off), 3, 5);
    expect(r2.ok && r2.value.material).toHaveLength(1); // hors des perçages : une seule surface
  });

  it('cas non évalués : trace oblique, hors matière, repère absent', () => {
    const oblique = mark({ y2: 40 });
    expect(cutView(cut, plate, oblique, all(oblique), 3, 5)).toMatchObject({ ok: false, error: expect.stringMatching(/oblique/) });
    const outside = mark({ y1: 100, y2: 100 });
    expect(cutView(cut, plate, outside, all(outside), 3, 5)).toMatchObject({ ok: false });
    expect(cutView(cut, plate, undefined, [plate], 3, 5)).toMatchObject({ ok: false });
  });

  it('trace raccourcie ou déplacée qui ne traverse plus toute la face : non évaluée', () => {
    const short = mark({ x1: 40 });
    expect(cutView(cut, plate, short, all(short), 3, 5)).toMatchObject({ ok: false, error: expect.stringMatching(/traverse pas toute la face/) });
    const wide = { ...plate, w: 140 } as CadObject;
    expect(cutView(cut, wide, mark(), [wide, h1, h2, mark()], 3, 5)).toMatchObject({ ok: false });
    const vertical = mark({ x1: 50, y1: 10, x2: 50, y2: 70 });
    expect(cutView(cut, plate, vertical, all(vertical), 3, 5)).toMatchObject({ ok: false });
    const across = mark({ x1: 50, y1: -10, x2: 50, y2: 70 });
    expect(cutView(cut, plate, across, all(across), 3, 5).ok).toBe(true);
  });

  it('intervalles pair-impair et désignation', () => {
    expect(materialIntervals([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]], 'y', 5)).toEqual([[0, 10]]);
    const r = cutView(cut, plate, mark(), all(), 3, 5);
    expect(r.ok && distanceToCut(r.value, 50, -25)).toBe(0);
  });
});
