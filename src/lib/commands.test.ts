import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion } from '@/types/cad';
import { polarArray, rectangularArray } from './array';
import { KIND_LABEL } from '@/types/cad';
import { applyTransform, OBJECT_SPEC_KINDS, SCRIPT_COMMANDS, decodeArgs, scriptCommandError, encodeArgs, validateCommand, versionDigest } from './commands';

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
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }], [])).toBeNull();
    expect(validateCommand('addObject', [{}], [])).toBe('objet à créer : type attendu');
    // Scripts (lot 18.2) : type connu, calque existant.
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'licorne' }], [])).toBe('type d’objet inconnu « licorne »');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'toString' }], [])).toBe('type d’objet inconnu « toString »');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'column', layerId: 'LAY-0009' }], [], [{ id: 'LAY-0001' }])).toBe('objet à créer : calque LAY-0009 absent');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'column', layerId: 'LAY-0001', x: 0, y: 0, section: 'rect', b: 300, h: 300 }], [], [{ id: 'LAY-0001' }])).toBeNull();
    // Dimensions exigées selon la section du poteau.
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'column', x: 0, y: 0, section: 'rect' }], [])).toBe('poteau rectangulaire : b et h positifs attendus');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'column', x: 0, y: 0, section: 'rect', b: 300, h: 0 }], [])).toBe('poteau rectangulaire : b et h positifs attendus');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'column', x: 0, y: 0, section: 'circle', b: 300, h: 300 }], [])).toBe('poteau circulaire : diamètre d positif attendu');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'column', x: 0, y: 0, section: 'circle', d: 400 }], [])).toBeNull();
    // Dimensions strictement positives (rayon, largeur, épaisseur, hauteur de texte…).
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'circle', cx: 0, cy: 0, r: -1 }], [])).toBe('circle : r positif attendu');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'circle', cx: 0, cy: 0, r: 0 }], [])).toBe('circle : r positif attendu');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'rect', x: 0, y: 0, w: 10, h: -5 }], [])).toBe('rect : h positif attendu');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'wall', x1: 0, y1: 0, x2: 1, y2: 0, thickness: 0, justification: 'axe' }], [])).toBe('wall : thickness positif attendu');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'circle', cx: -5, cy: -5, r: 2 }], [])).toBeNull();
    expect(validateCommand('addObject', [{ classification: 'structure', kind: 'beam', x1: 5, y1: 5, x2: 5, y2: 5, b: 200, h: 400 }], [])).toBe('poutre : deux points distincts attendus');
    // Champs communs : classification connue, hachure permise.
    expect(validateCommand('addObject', [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }], [])).toBe('line : classification parmi non-classifie, architecture, structure, mecanique, electrique attendue');
    expect(validateCommand('addObject', [{ classification: 'licorne', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }], [])).toMatch(/^line : classification parmi/);
    expect(validateCommand('addObject', [{ classification: 'structure', hatch: 'zigzag', kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }], [])).toBe('line : hachure parmi none, diagonal, cross, solid attendue');
    // Objet complet exigé : un solide sans recette, une ligne sans extrémité, des points invalides sont refusés.
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', layerId: 'LAY-0001' }], [], [{ id: 'LAY-0001' }])).toBe('solide : recette attendue');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'line', x1: 0, y1: 0, x2: 1 }], [])).toBe('line : y2 numérique fini attendu');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'polyline', points: [0, 0, 1] }], [])).toBe('polyline : liste de points (x, y) finie attendue');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 } }], [])).toBeNull();
    expect(validateCommand('addLevel', ['R+1', 'haut'], [])).toBe('nom et altitude attendus');
    expect(validateCommand('transformObjects', [['OBJ-0001'], (o: CadObject) => o], [line])).toBe('fonction en argument : utiliser une commande déclarative');
  });

  it('références vérifiées : niveau, bloc, objet désigné présent et du bon type', () => {
    const L = [{ id: 'LAY-0001' }];
    const P = { levels: [{ id: 'NIV-0001' }], blocks: [{ id: 'BLK-0001' }] };
    const add = (o: Record<string, unknown>, objects: CadObject[] = [line]) => validateCommand('addObject', [{ classification: 'non-classifie', layerId: 'LAY-0001', ...o }], objects, L, P);
    expect(add({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, levelId: 'NIV-0009' })).toBe('line : niveau NIV-0009 absent');
    expect(add({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, levelId: 'NIV-0001' })).toBeNull();
    expect(add({ kind: 'blockRef', x: 0, y: 0, scale: 1, blockId: 'BLK-0009' })).toBe('blockRef : bloc BLK-0009 absent');
    expect(add({ kind: 'blockRef', x: 0, y: 0, scale: 1, blockId: 'BLK-0001' })).toBeNull();
    const occ = { kind: 'occurrence', x: 0, y: 0, z: 0, angle: 0 };
    expect(add({ ...occ, sourceId: 'OBJ-0404' })).toBe('occurrence : objet désigné OBJ-0404 absent');
    expect(add({ ...occ, sourceId: 'OBJ-0001' })).toBe('occurrence : OBJ-0001 n’est pas un objet de type solid');
    expect(add({ kind: 'opening', position: 100, width: 900, type: 'porte', hostId: 'OBJ-0001' })).toBe('opening : OBJ-0001 n’est pas un objet de type wall');
    // Ouverture : hauteur positive et allège positive ou nulle, si présentes.
    const wallW = { ...line, id: 'WW', kind: 'wall', thickness: 200, justification: 'axe' } as unknown as CadObject;
    const op = { kind: 'opening', position: 100, width: 900, type: 'fenetre', hostId: 'WW' };
    expect(add({ ...op, height: 'bad' }, [wallW])).toBe('ouverture : hauteur positive attendue');
    expect(add({ ...op, sill: -1 }, [wallW])).toBe('ouverture : allège positive ou nulle attendue');
    expect(add({ ...op, height: 1200, sill: 900 }, [wallW])).toBeNull();
    const solid = { ...line, id: 'S', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    expect(add({ ...occ, sourceId: 'S' }, [solid])).toBeNull();
    // Source d'occurrence : une pièce seulement (un solide simple n'aurait aucune géométrie d'occurrence).
    const plain = { ...line, id: 'Q', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 } } as unknown as CadObject;
    expect(add({ ...occ, sourceId: 'Q' }, [plain])).toBe('occurrence : Q n’est pas une pièce (définir la pièce d’abord)');
    // Définition de pièce mal formée : refusée.
    expect(add({ kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: {} })).toBe('solide : définition de pièce mal formée (numéro entier positif, origine x y z, angle)');
    expect(add({ kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 2, origin: [0, 0, 0], angle: 90 } })).toBeNull();
    expect(add({ kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1.5, origin: [0, 0, 0], angle: 0 } })).toMatch(/numéro entier positif/);
    expect(add({ kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: -1, origin: [0, 0, 0], angle: 0 } })).toMatch(/numéro entier positif/);
    // Toiture : type et axe requis, pente et débord admissibles.
    const roof = { kind: 'roof', x: 0, y: 0, w: 8000, h: 6000, roofType: 'deux-pans', axis: 'x', pitch: 30, overhang: 500 };
    expect(add(roof)).toBeNull();
    expect(add({ ...roof, roofType: undefined })).toBe('roof : roofType parmi un-pan, deux-pans, quatre-pans attendu');
    expect(add({ ...roof, pitch: 90 })).toBe('Toiture : pente entre 0 et 90° (exclus) attendue.');
    expect(add({ ...roof, overhang: -1 })).toBe('Toiture : débord positif ou nul attendu.');
    // Coupe : évaluable (contour fermé, repère) ; une ligne n'est pas une face.
    const mark = { ...line, id: 'M', kind: 'section', x1: 50, y1: -100, x2: 50, y2: 100, label: 'A' } as unknown as CadObject;
    const face = { ...line, id: 'F', kind: 'rect', x: 0, y: 0, w: 100, h: 50 } as unknown as CadObject;
    const cut = { kind: 'cut', depth: 20, gap: 10, sourceId: 'F', markId: 'M' };
    expect(add(cut, [face, mark])).toBeNull();
    expect(add({ ...cut, sourceId: 'OBJ-0001' }, [line, mark])).toBe('coupe : OBJ-0001 n\'est pas un contour fermé.');
    // Vues liées : profondeur positive, au moins une vue demandée, source à face fermée.
    const rect = { ...line, id: 'RC', kind: 'rect', x: 0, y: 0, w: 100, h: 50 } as unknown as CadObject;
    const views = { kind: 'views', sourceId: 'RC', depth: 20, gap: 10, top: true, side: false };
    expect(add(views, [rect])).toBeNull();
    expect(add({ ...views, depth: 0 }, [rect])).toBe('views : depth positif attendu');
    expect(add({ ...views, top: false }, [rect])).toBe('vues : dessus et côté (booléens), l’un au moins demandé');
    expect(add({ ...views, sourceId: 'OBJ-0001' })).toBe('vues : OBJ-0001 n’offre pas de face fermée');
    expect(add({ ...occ, sourceId: 'S', mate: { type: 'fixe', to: 'X', rel: [0, 0, 0, 0] } }, [solid])).toBe('occurrence : liaison vers X absente');
    // Liaison incomplète (faces manquantes) : refusée avant toute résolution.
    expect(add({ ...occ, sourceId: 'S', mate: { type: 'coaxiale', to: 'X' } }, [solid])).toBe('occurrence : liaison mal formée (type, faces et cible attendus)');
    // Liaison vers une pièce (solide défini comme pièce) : permise, comme dans l'atelier ; vers un solide simple : non.
    const part = { ...solid, id: 'P', partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    expect(add({ ...occ, sourceId: 'P', mate: { type: 'fixe', to: 'P', rel: [0, 0, 0, 0] } }, [part])).toBeNull();
    expect(add({ ...occ, sourceId: 'S', mate: { type: 'fixe', to: 'Q', rel: [0, 0, 0, 0] } }, [solid, plain])).toBe('occurrence : liaison vers Q absente');
    // Pièce rangée dans une zone : la zone doit exister.
    const PZ = { ...P, zones: [{ id: 'ZON-0001' }] };
    expect(validateCommand('addObject', [{ classification: 'architecture', layerId: 'LAY-0001', kind: 'room', x: 0, y: 0, zoneId: 'ZON-0009' }], [line], L, PZ)).toBe('room : zone ZON-0009 absente');
    expect(validateCommand('addObject', [{ classification: 'architecture', layerId: 'LAY-0001', kind: 'room', x: 0, y: 0, zoneId: 'ZON-0001' }], [line], L, PZ)).toBeNull();
    // Jeux de propriétés : forme relue telle quelle seulement.
    const ln = { kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0 };
    // Spline : nœuds et poids bien formés et cohérents.
    const sp = { kind: 'spline', degree: 2, points: [0, 0, 10, 10, 20, 0] };
    expect(add(sp)).toBeNull();
    expect(add({ ...sp, knots: {} })).toBe('spline : nœuds (liste de nombres) attendus');
    expect(add({ ...sp, knots: [0, 0, 0, 1] })).toBe('spline : degré, nœuds ou poids incohérents');
    expect(add({ ...sp, weights: [1, -1, 1] })).toBe('spline : degré, nœuds ou poids incohérents');
    // Note : photos en liste d'identifiants ; coupe : profondeur positive.
    expect(add({ kind: 'note', x: 0, y: 0, time: 1, text: 'x', photoIds: {} })).toBe('note : photos (liste d’identifiants) attendues');
    expect(add({ kind: 'note', x: 0, y: 0, time: 1, text: 'x', photoIds: ['PHO-0001'] })).toBeNull();
    expect(add({ kind: 'cut', depth: 0, gap: 5, sourceId: 'OBJ-0001', markId: 'OBJ-0001' })).toBe('cut : depth positif attendu');
    // Trait, hachures, classe IFC, tableau : formes permises.
    expect(add({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, lineWeight: 'bad' })).toBe('line : épaisseur de trait positive attendue');
    expect(add({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, lineType: 'pointille' })).toMatch(/type de trait parmi/);
    expect(add({ kind: 'rect', x: 0, y: 0, w: 1, h: 1, hatchParams: { angle: 45, spacing: 0, unit: 'papier' } })).toMatch(/paramètres de hachure mal formés/);
    expect(add({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, ifcClass: 'IfcLicorne' })).toBe('line : classe IFC inconnue');
    expect(add({ kind: 'bom', x: 0, y: 0, table: 'licornes' })).toMatch(/tableau : type parmi/);
    expect(add({ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, lineWeight: 0.35, lineType: 'interrompu', color: '#ff0000' })).toBeNull();
    // Trous : liste d'identifiants d'objets existants.
    expect(add({ kind: 'rect', x: 0, y: 0, w: 10, h: 10, holes: {} })).toBe('rect : trous (liste d’identifiants) attendus');
    expect(add({ kind: 'rect', x: 0, y: 0, w: 10, h: 10, holes: ['OBJ-0404'] })).toBe('rect : trou OBJ-0404 absent');
    expect(add({ kind: 'rect', x: 0, y: 0, w: 10, h: 10, holes: ['OBJ-0001'] })).toBeNull();
    expect(add({ ...ln, psets: {} })).toBe('line : jeux de propriétés mal formés (nom, propriétés nommées, valeurs texte, nombre ou booléen)');
    expect(add({ ...ln, psets: [{ name: 'P', props: [{ name: 'a', value: { x: 1 } }] }] })).toMatch(/jeux de propriétés mal formés/);
    expect(add({ ...ln, psets: [{ name: 'P', props: [{ name: 'a', value: 2 }, { name: 'b', value: 'x' }] }] })).toBeNull();
    expect(add({ kind: 'dimension', offset: 5, style: 'aligned', targetId: 'OBJ-0404' })).toBe('dimension : objet désigné OBJ-0404 absent');
    // Mise à jour : une référence rompue est refusée.
    expect(validateCommand('updateObject', ['OBJ-0001', { levelId: 'NIV-0009' }], [line], L, P)).toBe('line : niveau NIV-0009 absent');
  });

  it('scripts : seules les commandes entièrement validées sont ouvertes', () => {
    // Calque et niveau actifs : existants.
    expect(validateCommand('setActiveLayerId', ['LAY-0009'], [], [{ id: 'LAY-0001' }])).toBe('calque LAY-0009 absent');
    expect(validateCommand('setActiveLevelId', ['NIV-0009'], [], [], { levels: [{ id: 'NIV-0001' }] })).toBe('niveau NIV-0009 absent');
    expect(validateCommand('setActiveLevelId', ['NIV-0001'], [], [], { levels: [{ id: 'NIV-0001' }] })).toBeNull();
    expect(scriptCommandError('addObject')).toBeNull();
    expect(scriptCommandError('undo')).toBeNull();
    expect(scriptCommandError('addSolids')).toBe('commande non ouverte aux scripts « addSolids »');
    expect(scriptCommandError('toString')).toBe('commande non ouverte aux scripts « toString »');
    expect(SCRIPT_COMMANDS).toEqual(expect.arrayContaining(['addObject', 'updateObject', 'removeObjects', 'transform', 'addLevel', 'setActiveLevelId']));
    expect(validateCommand('undo', [{ type: 'click' }], [])).toBe('annuler : sans argument');
    // Arguments en trop ou mal typés : refusés (un nom d'objet non textuel casserait l'affichage).
    const col = { classification: 'structure', kind: 'column', x: 0, y: 0, section: 'circle', d: 400 };
    expect(scriptCommandError('addObject', [col, {}])).toBe('addObject : argument 2 texte attendu');
    expect(scriptCommandError('addObject', [col, 'P1', 'Poser', 'trop'])).toBe('addObject : 3 arguments au plus');
    expect(scriptCommandError('addObject', [col, 'P1', 'Poser'])).toBeNull();
    expect(scriptCommandError('updateObject', ['OBJ-0001', {}, 42])).toBe('updateObject : argument 3 texte attendu');
    expect(scriptCommandError('undo', [1])).toBe('undo : 0 argument au plus');
  });

  it('chaque type d’objet a sa fiche de validation ; mise à jour validée sur l’objet résultant', () => {
    expect([...OBJECT_SPEC_KINDS].sort()).toEqual(Object.keys(KIND_LABEL).sort());
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'pdim', mode: 'chain', axis: 'horizontal', offset: 1 }], [])).toBe('pdim : liste de points (x, y) finie attendue');
    // Points selon le mode : niveau 1, chaîne et ligne de base 2, angle 3.
    const pd = (mode: string, points: number[]) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'pdim', mode, axis: 'horizontal', offset: 1, points }], []);
    expect(pd('level', [0, 0])).toBeNull();
    expect(pd('chain', [0, 0])).toBe('pdim : 2 points au moins pour le mode chain');
    expect(pd('baseline', [0, 0, 10, 0])).toBeNull();
    expect(pd('angular', [0, 0, 10, 0])).toBe('pdim : 3 points au moins pour le mode angular');
    expect(pd('angular', [0, 0, 10, 0, 0, 10])).toBeNull();
    const solid = { ...line, id: 'S', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 } } as unknown as CadObject;
    expect(validateCommand('updateObject', ['S', { recipe: undefined }], [solid])).toBe('solide : recette attendue');
    expect(validateCommand('updateObject', ['S', { kind: 'line' }], [solid])).toBe('modification : le type d’un objet ne change pas');
    expect(validateCommand('updateObject', ['S', { recipe: { op: 'box', x: 2, y: 1, z: 1 } }], [solid])).toBeNull();
    // Objet ancien déjà incomplet : il reste modifiable.
    const legacy = { ...line, id: 'L', x2: undefined } as unknown as CadObject;
    expect(validateCommand('updateObject', ['L', { name: 'x' }], [legacy])).toBeNull();
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
