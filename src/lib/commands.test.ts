import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion } from '@/types/cad';
import { polarArray, rectangularArray } from './array';
import { applyTransform, decodeArgs, encodeArgs, validateCommand, versionDigest } from './commands';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const line = { ...base, id: 'OBJ-0001', name: 'L', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 } as CadObject;

describe('API de commandes (lot 18.1)', () => {
  it('arguments journalisables : champ retiré (undefined) et Map gardés, fonctions refusées', () => {
    const args = ['OBJ-0001', { height: undefined, w: 3 }, new Map([['a', { x: 1 }]]), undefined];
    const enc = encodeArgs(args);
    const text = JSON.stringify(enc);
    const dec = decodeArgs(JSON.parse(text)) as unknown[];
    expect(dec[0]).toBe('OBJ-0001');
    expect(Object.prototype.hasOwnProperty.call(dec[1], 'height')).toBe(true);
    expect((dec[1] as { height?: number }).height).toBeUndefined();
    expect(dec[2]).toEqual(new Map([['a', { x: 1 }]]));
    expect(dec).toHaveLength(4);
    expect(dec[3]).toBeUndefined();
    expect(() => encodeArgs([() => 1])).toThrow('fonction en argument');
    expect(() => encodeArgs([Number.NaN])).toThrow('nombre non fini');
    expect(() => encodeArgs([new Date()])).toThrow('objet non sérialisable');
  });

  it('validation : objets existants, transformations déclaratives, refus en clair', () => {
    expect(validateCommand('updateObject', ['OBJ-0001', { x1: 5 }], [line])).toBeNull();
    expect(validateCommand('updateObject', ['OBJ-0009', { x1: 5 }], [line])).toBe('objet OBJ-0009 absent');
    expect(validateCommand('removeObjects', [['OBJ-0001', 'OBJ-0002']], [line])).toBe('objet OBJ-0002 absent');
    expect(validateCommand('transform', [['OBJ-0001'], { kind: 'move', dx: 1, dy: 2 }, 'Déplacer'], [line])).toBeNull();
    expect(validateCommand('transform', [['OBJ-0001'], { kind: 'scale', cx: 0, cy: 0, factor: 0 }, 'x'], [line])).toBe('échelle : centre et rapport positif attendus');
    expect(validateCommand('transform', [['OBJ-0001'], { kind: 'twist' }, 'x'], [line])).toBe('transformation inconnue « twist »');
    expect(validateCommand('addObject', [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }], [])).toBeNull();
    expect(validateCommand('addObject', [{}], [])).toBe('objet à créer : type attendu');
    // Scripts (lot 18.2) : type connu, calque existant.
    expect(validateCommand('addObject', [{ kind: 'licorne' }], [])).toBe('type d’objet inconnu « licorne »');
    expect(validateCommand('addObject', [{ kind: 'toString' }], [])).toBe('type d’objet inconnu « toString »');
    expect(validateCommand('addObject', [{ kind: 'column', layerId: 'LAY-0009' }], [], [{ id: 'LAY-0001' }])).toBe('objet à créer : calque LAY-0009 absent');
    expect(validateCommand('addObject', [{ kind: 'column', layerId: 'LAY-0001', x: 0, y: 0, section: 'rect' }], [], [{ id: 'LAY-0001' }])).toBeNull();
    // Objet complet exigé : un solide sans recette, une ligne sans extrémité, des points invalides sont refusés.
    expect(validateCommand('addObject', [{ kind: 'solid', layerId: 'LAY-0001' }], [], [{ id: 'LAY-0001' }])).toBe('solide : recette attendue');
    expect(validateCommand('addObject', [{ kind: 'line', x1: 0, y1: 0, x2: 1 }], [])).toBe('line : y2 numérique fini attendu');
    expect(validateCommand('addObject', [{ kind: 'polyline', points: [0, 0, 1] }], [])).toBe('polyline : liste de points (x, y) finie attendue');
    expect(validateCommand('addObject', [{ kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 } }], [])).toBeNull();
    expect(validateCommand('addLevel', ['R+1', 'haut'], [])).toBe('nom et altitude attendus');
    expect(validateCommand('transformObjects', [['OBJ-0001'], (o: CadObject) => o], [line])).toBe('fonction en argument : utiliser une commande déclarative');
  });

  it('poses de copie déclaratives : réseaux et collage journalisables', () => {
    const rect = rectangularArray(2, 2, 100, 100), polar = polarArray(4, 360, 0, 0);
    if (!rect.ok || !polar.ok) throw new Error('réseau');
    expect(rect.placements).toEqual([{ kind: 'translate', dx: 100, dy: 0 }, { kind: 'translate', dx: 0, dy: 100 }, { kind: 'translate', dx: 100, dy: 100 }]);
    expect(validateCommand('addCopies', [[line], rect.placements, 'Réseau rectangulaire'], [line])).toBeNull();
    expect(validateCommand('addCopies', [[line], polar.placements, 'Réseau polaire'], [line])).toBeNull();
  });

  it('transformations déclaratives = fonctions de géométrie', () => {
    expect(applyTransform({ kind: 'move', dx: 10, dy: -5 })(line)).toEqual({ x1: 10, y1: -5, x2: 110, y2: -5 });
    expect(applyTransform({ kind: 'mirror', axis: 'x', value: 0 })(line)).toMatchObject({ x1: 0, x2: -100 });
    expect(applyTransform({ kind: 'scale', cx: 0, cy: 0, factor: 2 })(line)).toEqual({ x1: 0, y1: 0, x2: 200, y2: 0 });
  });

  it('empreinte de version : contenu seul (ni numéro, ni libellé, ni heure)', () => {
    const v = { seq: 1, label: 'a', time: 1, objects: [line], layers: [], blocks: [] } as unknown as MicroVersion;
    expect(versionDigest(v)).toBe(versionDigest({ ...v, seq: 9, label: 'b', time: 2 }));
    expect(versionDigest(v)).not.toBe(versionDigest({ ...v, objects: [] }));
  });
});
