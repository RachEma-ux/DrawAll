import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion } from '@/types/cad';
import { createDefaultLayers } from '@/types/cad';
import { normalizeProjectState } from '@/store/project';
import { canonicalJson, fromPackage, toPackage } from './package';
import { addPset, commonPsetName, defaultIfcClass, formatValue, ifcClassOf, normalizePsets, parseValue, removeProperty, removePset, setProperty, type PropertySet } from './properties';

const base = { classification: 'non-classifie' as const, layerId: 'LAY-0001', hatch: 'none' as const, createdSeq: 0 };
const wall = { ...base, id: 'OBJ-0001', name: 'Mur', kind: 'wall', x1: 0, y1: 0, x2: 5000, y2: 0, thickness: 200, justification: 'axe' } as CadObject;
const door = { ...base, id: 'OBJ-0002', name: 'Porte', kind: 'opening', hostId: 'OBJ-0001', type: 'porte', position: 1500, width: 900, hinge: 'debut', side: 'droite' } as CadObject;
const win = { ...door, id: 'OBJ-0003', type: 'fenetre' } as CadObject;
const line = { ...base, id: 'OBJ-0004', name: 'Trait', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 } as CadObject;

describe('propriétés et classification IFC (lot 12.3)', () => {
  it('classe IFC par type d’objet ; choix explicite prioritaire', () => {
    expect([wall, door, win, line].map(defaultIfcClass)).toEqual(['IfcWall', 'IfcDoor', 'IfcWindow', 'IfcAnnotation']);
    expect(defaultIfcClass({ ...base, id: 'R', name: 'R', kind: 'room', x: 0, y: 0, points: [] } as unknown as CadObject)).toBe('IfcSpace');
    expect(ifcClassOf({ ...line, ifcClass: 'IfcBeam' })).toBe('IfcBeam');
    expect(ifcClassOf({ ...line, ifcClass: 'IfcInventee' })).toBe('IfcAnnotation');
    expect(commonPsetName('IfcWall')).toBe('Pset_WallCommon');
  });

  it('jeux de propriétés : ajouter, poser, remplacer, retirer', () => {
    let ps = addPset(undefined, 'Pset_WallCommon') as PropertySet[];
    expect(addPset(ps, 'Pset_WallCommon')).toEqual({ error: 'Le jeu « Pset_WallCommon » existe déjà.' });
    expect(addPset(ps, '  ')).toEqual({ error: 'Nom du jeu de propriétés attendu.' });
    // Un nom que la relecture écarterait est refusé dès la création.
    expect(addPset(ps, 'P'.repeat(129))).toEqual({ error: 'Nom du jeu de propriétés trop long (128 caractères au plus).' });
    expect(normalizePsets([{ name: 'P'.repeat(129), props: [] }])).toBeUndefined();
    expect(Array.isArray(addPset(ps, 'P'.repeat(128)))).toBe(true);
    ps = setProperty(ps, 'Pset_WallCommon', { name: 'IsExternal', value: true }) as PropertySet[];
    ps = setProperty(ps, 'Pset_WallCommon', { name: 'ThermalTransmittance', value: 0.24, unit: 'W/(m²·K)' }) as PropertySet[];
    ps = setProperty(ps, 'Pset_WallCommon', { name: 'IsExternal', value: false }) as PropertySet[];
    expect(ps[0].props).toEqual([{ name: 'IsExternal', value: false }, { name: 'ThermalTransmittance', value: 0.24, unit: 'W/(m²·K)' }]);
    expect(setProperty(ps, 'Autre', { name: 'x', value: 1 })).toEqual({ error: 'Jeu « Autre » inconnu.' });
    expect(removeProperty(ps, 'Pset_WallCommon', 'IsExternal')[0].props).toHaveLength(1);
    expect(removePset(ps, 'Pset_WallCommon')).toEqual([]);
    expect(formatValue(ps[0].props[1])).toBe('0,24 W/(m²·K)');
    expect(formatValue(ps[0].props[0])).toBe('faux');
  });

  it('saisie typée : booléen, nombre à virgule, texte', () => {
    expect(parseValue('Vrai', 'booleen')).toBe(true);
    expect(parseValue('non', 'booleen')).toBe(false);
    expect(parseValue('peut-être', 'booleen')).toEqual({ error: 'Valeur booléenne attendue (vrai ou faux).' });
    expect(parseValue('0,24', 'nombre')).toBe(0.24);
    expect(parseValue('abc', 'nombre')).toEqual({ error: 'Nombre attendu, « abc » reçu.' });
    expect(parseValue(' EI 60 ', 'texte')).toBe('EI 60');
  });

  it('relecture : valeurs typées et unités connues seulement, doublons écartés', () => {
    expect(normalizePsets([
      { name: 'A', props: [{ name: 'x', value: 1, unit: 'mm' }, { name: 'x', value: 2 }, { name: 'y', value: NaN }, { name: 'z', value: { o: 1 } }, { name: 'u', value: 3, unit: 'pouce' }] },
      { name: 'A', props: [] }, { name: '', props: [] }, null,
    ])).toEqual([{ name: 'A', props: [{ name: 'x', value: 1, unit: 'mm' }, { name: 'u', value: 3 }] }]);
    expect(normalizePsets('rien')).toBeUndefined();
  });

  it('paquet natif : classe IFC et propriétés conservées à l’aller-retour, octet pour octet', () => {
    const withProps = [
      { ...wall, ifcClass: 'IfcWall', psets: [{ name: 'Pset_WallCommon', props: [{ name: 'IsExternal', value: true }, { name: 'FireRating', value: 'REI 60' }, { name: 'ThermalTransmittance', value: 0.24, unit: 'W/(m²·K)' }] }] },
      { ...line, ifcClass: 'IfcMember' },
    ] as CadObject[];
    const v0: MicroVersion = { seq: 0, label: 'Initial', time: 1, objects: withProps, layers: createDefaultLayers(), blocks: [] };
    const state = normalizeProjectState({ versions: [v0], pointer: 0, counter: 4, layerCounter: 4, blockCounter: 0, activeLayerId: 'LAY-0001' });
    const pkg = toPackage(state);
    const back = fromPackage(pkg);
    if (!back.ok) throw new Error(back.error);
    expect(toPackage(back.state)).toBe(pkg);
    expect(canonicalJson(back.state)).toBe(canonicalJson(state));
    const [w, l] = back.state.versions[0].objects;
    expect(w.psets![0].props[2]).toEqual({ name: 'ThermalTransmittance', value: 0.24, unit: 'W/(m²·K)' });
    expect(l.ifcClass).toBe('IfcMember');
    // Classe inconnue écartée à la relecture.
    const bad = normalizeProjectState({ versions: [{ ...v0, objects: [{ ...line, ifcClass: 'IfcInventee' }] }], pointer: 0, counter: 1, layerCounter: 4, blockCounter: 0, activeLayerId: 'LAY-0001' });
    expect('ifcClass' in bad.versions[0].objects[0]).toBe(false);
  });
});
