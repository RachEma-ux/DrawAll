import { describe, expect, it } from 'vitest';
import type { CadObject, MicroVersion } from '@/types/cad';
import { polarArray, rectangularArray } from './array';
import { KIND_LABEL } from '@/types/cad';
import { applyTransform, mergedReferenceError, OBJECT_SPEC_KINDS, SCRIPT_COMMANDS, decodeArgs, scriptCommandError, transformTargetsError, encodeArgs, validateCommand, versionDigest } from './commands';

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
    expect(add({ kind: 'opening', position: 100, width: 900, type: 'porte', hinge: 'debut', side: 'gauche', hostId: 'OBJ-0001' })).toBe('opening : OBJ-0001 n’est pas un objet de type wall');
    // Porte : charnière et côté requis.
    expect(add({ kind: 'opening', position: 100, width: 900, type: 'porte', hostId: 'OBJ-0001' })).toBe('porte : charnière (debut, fin) et côté (gauche, droite) attendus');
    // Ouverture : hauteur positive et allège positive ou nulle, si présentes.
    const wallW = { ...line, id: 'WW', kind: 'wall', x2: 2000, thickness: 200, justification: 'axe' } as unknown as CadObject;
    const op = { kind: 'opening', position: 1000, width: 900, type: 'fenetre', hostId: 'WW' };
    // L'ouverture tient dans son mur (2 000 mm), à la création comme en modification.
    expect(add({ ...op, position: 100 }, [wallW])).toBe('ouverture : L’ouverture (900 mm) dépasse du mur (2000 mm).');
    const placed = { ...line, ...op, id: 'OP' } as unknown as CadObject;
    expect(validateCommand('updateObject', ['OP', { position: 1800 }], [wallW, placed], L, P)).toBe('ouverture : L’ouverture (900 mm) dépasse du mur (2000 mm).');
    expect(validateCommand('updateObject', ['OP', { position: 1500 }], [wallW, placed], L, P)).toBeNull();
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
    // Texte : alignement permis.
    const tx = { kind: 'text', x: 0, y: 0, rotation: 0, height: 2.5, content: 'A' };
    expect(add(tx)).toBe('text : align parmi left, center, right attendu');
    expect(add({ ...tx, align: 'left' })).toBeNull();
    // Champs facultatifs : forme exigée s'ils sont présents.
    expect(add({ kind: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, rotation: 0, start: 'bad', end: 90 })).toBe('ellipse : start numérique fini attendu');
    expect(add({ kind: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, rotation: 0, start: 0 })).toBe('ellipse : début et fin d’arc ensemble');
    expect(add({ kind: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, rotation: 0, start: 0, end: 90 })).toBeNull();
    expect(add({ kind: 'wall', x1: 5, y1: 5, x2: 5, y2: 5, thickness: 200, justification: 'axe' })).toBe('mur : deux points distincts attendus');
    expect(add({ kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: 5, tolerance: { kind: 'ecarts', upper: 'bad', lower: 0 } })).toBe('cote : écarts supérieur et inférieur numériques attendus');
    expect(add({ kind: 'dimension', targetId: 'OBJ-0001', style: 'aligned', offset: 5, tolerance: { kind: 'classe', cls: 'H7' } })).toBeNull();
    expect(add({ kind: 'column', x: 0, y: 0, section: 'circle', d: 400, height: -1 })).toBe('column : height positif attendu');
    expect(add({ kind: 'cut', depth: 20, gap: 10, sourceId: 'OBJ-0001', markId: 'OBJ-0001', method: 'quatrieme' })).toMatch(/method parmi premier-diedre, troisieme-diedre/);
    // Trous : liste d'identifiants d'objets existants.
    expect(add({ kind: 'rect', x: 0, y: 0, w: 10, h: 10, holes: {} })).toBe('rect : trous (liste d’identifiants) attendus');
    expect(add({ kind: 'rect', x: 0, y: 0, w: 10, h: 10, holes: ['OBJ-0404'] })).toBe('rect : trou OBJ-0404 absent');
    // Îlot : contour fermé contenu dans l'objet ; une ligne, un contour extérieur ou l'objet lui-même : refusés.
    const disc = { ...line, id: 'D', kind: 'circle', cx: 50, cy: 50, r: 10 } as unknown as CadObject;
    const far = { ...line, id: 'F', kind: 'circle', cx: 500, cy: 500, r: 10 } as unknown as CadObject;
    expect(add({ kind: 'rect', x: 0, y: 0, w: 100, h: 100, holes: ['D'] }, [line, disc, far])).toBeNull();
    expect(add({ kind: 'rect', x: 0, y: 0, w: 100, h: 100, holes: ['F'] }, [line, disc, far])).toBe('rect : îlot F hors du contour (contour fermé contenu dans l’objet attendu)');
    expect(add({ kind: 'rect', x: 0, y: 0, w: 100, h: 100, holes: ['OBJ-0001'] }, [line, disc, far])).toBe('rect : îlot OBJ-0001 hors du contour (contour fermé contenu dans l’objet attendu)');
    const R = { ...line, id: 'R', kind: 'rect', x: 0, y: 0, w: 100, h: 100 } as unknown as CadObject;
    expect(validateCommand('updateObject', ['R', { holes: ['R'] }], [R], L, P)).toBe('rect : îlot R hors du contour (contour fermé contenu dans l’objet attendu)');
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
    expect(validateCommand('setActiveLayerId', ['LAY-0002'], [], [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }])).toBe('calque LAY-0002 verrouillé');
    expect(validateCommand('setActiveLayerId', ['LAY-0001'], [], [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }])).toBeNull();
    // Modification d'un objet d'un calque verrouillé, ou vers un calque verrouillé : refusée.
    const onLocked = { ...line, id: 'K', layerId: 'LAY-0002' } as CadObject;
    expect(validateCommand('updateObject', ['K', { x2: 50 }], [onLocked], [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }])).toBe('modification : calque LAY-0002 verrouillé');
    expect(validateCommand('updateObject', ['OBJ-0001', { layerId: 'LAY-0002' }], [line], [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }])).toBe('modification : calque LAY-0002 verrouillé');
    // Création sur un calque verrouillé : refusée ; mur de hauteur invalide : refusé.
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'line', layerId: 'LAY-0002', x1: 0, y1: 0, x2: 1, y2: 0 }], [], [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }])).toBe('objet à créer : calque LAY-0002 verrouillé');
    expect(validateCommand('addObject', [{ classification: 'architecture', kind: 'wall', x1: 0, y1: 0, x2: 1, y2: 0, thickness: 200, justification: 'axe', height: 'bad' }], [])).toBe('mur : hauteur positive attendue');
    // Suppression d'un objet d'un calque verrouillé : refusée, seule ou dans une liste.
    const LK = [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }];
    expect(validateCommand('removeObject', ['K'], [line, onLocked], LK)).toBe('suppression : K sur le calque LAY-0002 verrouillé');
    expect(validateCommand('removeObjects', [['OBJ-0001', 'K']], [line, onLocked], LK)).toBe('suppression : K sur le calque LAY-0002 verrouillé');
    expect(validateCommand('removeObjects', [['OBJ-0001']], [line, onLocked], LK)).toBeNull();
    // Fond de plan verrouillé : ni déplacé ni modifié ; seul son déverrouillage passe.
    const under = { ...line, id: 'U', kind: 'underlay', assetId: 'A', x: 0, y: 0, w: 10, h: 10, opacity: 0.5, locked: true } as unknown as CadObject;
    expect(validateCommand('updateObject', ['U', { x: 50 }], [under], LK)).toBe('modification : fond de plan U verrouillé');
    expect(validateCommand('updateObject', ['U', { locked: false, x: 50 }], [under], LK)).toBe('modification : fond de plan U verrouillé');
    expect(validateCommand('updateObject', ['U', { locked: false }], [under], LK)).toBeNull();
    expect(validateCommand('updateObject', ['U', { x: 50 }], [{ ...under, locked: false } as CadObject], LK)).toBeNull();
    // Cote : cible cotable et style pris en charge par la cible.
    const dim = { classification: 'non-classifie', layerId: 'LAY-0001', kind: 'dimension', offset: 5, style: 'aligned', targetId: 'OBJ-0001' };
    const circ = { ...line, id: 'C', kind: 'circle', cx: 0, cy: 0, r: 10 } as unknown as CadObject;
    const wallD = { ...line, id: 'W', kind: 'wall', thickness: 200, justification: 'axe' } as unknown as CadObject;
    expect(validateCommand('addObject', [dim], [line], LK)).toBeNull();
    expect(validateCommand('addObject', [{ ...dim, targetId: 'C' }], [circ], LK)).toBe('cote : style aligned non pris en charge par C (radial)');
    expect(validateCommand('addObject', [{ ...dim, targetId: 'C', style: 'radial' }], [circ], LK)).toBeNull();
    expect(validateCommand('addObject', [{ ...dim, targetId: 'W' }], [wallD], LK)).toBe('cote : W ne se cote pas');
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

describe('transformation demandée par un script ou l’assistant (lot 18.2)', () => {
  const L = [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }];
  const r = { ...line, id: 'R', kind: 'rect', x: 0, y: 0, w: 10, h: 5 } as unknown as CadObject;
  it('chaque objet doit être modifiable et accepter l’opération', () => {
    expect(transformTargetsError(['OBJ-0001', 'R'], { kind: 'rotate', cx: 0, cy: 0, deg: 90 }, [line, r], L)).toBeNull();
    expect(transformTargetsError(['OBJ-0001', 'R'], { kind: 'rotate', cx: 0, cy: 0, deg: 45 }, [line, r], L)).toBe('R non transformable (opération impossible pour ce type d’objet)');
    expect(transformTargetsError(['K'], { kind: 'move', dx: 1, dy: 0 }, [{ ...line, id: 'K', layerId: 'LAY-0002' } as CadObject], L)).toBe('K non transformable (calque verrouillé)');
    const u = { ...line, id: 'U', kind: 'underlay', assetId: 'A', x: 0, y: 0, w: 1, h: 1, opacity: 1, locked: true } as unknown as CadObject;
    expect(transformTargetsError(['U'], { kind: 'move', dx: 1, dy: 0 }, [u], L)).toBe('U non transformable (fond de plan verrouillé)');
  });
});

describe('relecture 24e passe : solides constructibles, duplication, retour à une version', () => {
  const solid = (profile: number[][]) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'extrude', profile, height: 10 } }], []);
  it('contour d’extrusion : aire non nulle, sans recoupement', () => {
    expect(solid([[0, 0], [10, 0], [10, 10]])).toBeNull();
    expect(solid([[0, 0], [1, 0], [2, 0]])).toBe('solide : extrusion : contour d’aire nulle (sommets alignés)');
    expect(solid([[0, 0], [10, 10], [10, 0], [0, 5]])).toBe('solide : extrusion : contour qui se recoupe');
    expect(solid([[0, 0], [0, 0], [5, 5]])).toBe('solide : extrusion : contour de moins de trois sommets distincts');
    // Contour fermé explicitement (dernier sommet = premier) : admis.
    expect(solid([[0, 0], [10, 0], [10, 10], [0, 0]])).toBeNull();
    // Dans une opération booléenne aussi.
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'union', a: { op: 'box', x: 1, y: 1, z: 1 }, b: { op: 'revolve', profile: [[0, 0], [1, 0], [2, 0]], angle: 360 } } }], [])).toBe('solide : révolution : contour d’aire nulle (sommets alignés)');
  });
  it('duplication d’un objet d’un calque verrouillé : refusée', () => {
    const K = { ...line, id: 'K', layerId: 'LAY-0002' } as CadObject;
    const LK = [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }];
    expect(validateCommand('duplicateObjects', [['OBJ-0001', 'K'], 10, 0], [line, K], LK)).toBe('duplication : K sur le calque LAY-0002 verrouillé');
    expect(validateCommand('duplicateObjects', [['OBJ-0001'], 10, 0], [line, K], LK)).toBeNull();
  });
  it('retour à une version : rang dans l’historique', () => {
    expect(validateCommand('goTo', [2], [], [], { versions: 3 })).toBeNull();
    expect(validateCommand('goTo', [3], [], [], { versions: 3 })).toBe('version 3 absente (3 versions)');
  });
});

describe('relecture 25e passe : dalle, nom, suppression en cascade', () => {
  const LK = [{ id: 'LAY-0001' }, { id: 'LAY-0002', locked: true }];
  it('dalle : contour d’aire non nulle', () => {
    const slab = (points: number[]) => validateCommand('addObject', [{ classification: 'structure', kind: 'slab', thickness: 200, points }], []);
    expect(slab([0, 0, 1000, 0, 1000, 1000])).toBeNull();
    expect(slab([0, 0, 1000, 0, 2000, 0])).toBe('dalle : contour d’aire nulle (au moins trois sommets non alignés)');
  });
  it('nom : texte attendu, à la création comme en modification', () => {
    expect(validateCommand('updateObject', ['OBJ-0001', { name: 1 }], [line])).toBe('line : nom (texte) attendu');
    expect(validateCommand('updateObject', ['OBJ-0001', { name: 'Axe' }], [line])).toBeNull();
  });
  it('suppression : un objet associatif d’un calque verrouillé emporté avec son parent fait refuser', () => {
    const wall = { ...line, id: 'W', kind: 'wall', x2: 2000, thickness: 200, justification: 'axe' } as unknown as CadObject;
    const door = { ...line, id: 'D', layerId: 'LAY-0002', kind: 'opening', hostId: 'W', type: 'fenetre', position: 1000, width: 900 } as unknown as CadObject;
    expect(validateCommand('removeObject', ['W'], [wall, door], LK)).toBe('suppression : D (emporté avec son parent) sur le calque LAY-0002 verrouillé');
    expect(validateCommand('removeObjects', [['W']], [wall, door], LK)).toBe('suppression : D (emporté avec son parent) sur le calque LAY-0002 verrouillé');
    expect(validateCommand('removeObject', ['W'], [wall, { ...door, layerId: 'LAY-0001' } as CadObject], LK)).toBeNull();
  });
});

describe('relecture 27e passe : trajet de balayage, repères de pièce, pièce dont dépendent des occurrences', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const sweep = (path: unknown[]) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'sweep', profile: sq, path } }], []);
  it('balayage : segments de longueur non nulle, arcs non dégénérés', () => {
    expect(sweep([{ kind: 'line', from: [0, 0], to: [0, 100] }])).toBeNull();
    expect(sweep([{ kind: 'line', from: [0, 0], to: [0, 0] }])).toBe('solide : balayage : segment de trajet de longueur nulle');
    expect(sweep([{ kind: 'line', from: [0, 0], to: [0, 100] }, { kind: 'line', from: [0, 100], to: [0, 100] }])).toBe('solide : balayage : segment de trajet de longueur nulle');
    expect(sweep([{ kind: 'arc', from: [0, 0], via: [50, 0], to: [100, 0] }])).toBe('solide : balayage : arc de trajet aux trois points alignés');
    expect(sweep([{ kind: 'arc', from: [0, 0], via: [50, 50], to: [100, 0] }])).toBeNull();
  });
  const part = (id: string, no: number) => ({ ...line, id, kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no, origin: [0, 0, 0], angle: 0 } }) as unknown as CadObject;
  it('repère de pièce unique (projet actif ou toutes variantes)', () => {
    const add = (no: number, objects: CadObject[], marks?: Map<number, string[]>) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no, origin: [0, 0, 0], angle: 0 } }], objects, undefined, marks && { partMarks: marks });
    expect(add(1, [part('P', 1)])).toBe('solide : repère de pièce 1 déjà pris par P');
    expect(add(2, [part('P', 1)])).toBeNull();
    // Repère pris dans une autre variante : refusé aussi.
    expect(add(2, [part('P', 1)], new Map([[1, ['P']], [2, ['Q']]]))).toBe('solide : repère de pièce 2 déjà pris par Q');
    // Modification : son propre repère reste permis, celui d'une autre pièce non.
    expect(validateCommand('updateObject', ['P', { partDef: { no: 1, origin: [0, 0, 0], angle: 90 } }], [part('P', 1), part('Q', 2)])).toBeNull();
    expect(validateCommand('updateObject', ['P', { partDef: { no: 2, origin: [0, 0, 0], angle: 0 } }], [part('P', 1), part('Q', 2)])).toBe('solide : repère de pièce 2 déjà pris par Q');
  });
  it('création : un identifiant fourni ne fait pas passer l’objet pour le détenteur du repère', () => {
    expect(validateCommand('addObject', [{ id: 'P', classification: 'non-classifie', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } }], [part('P', 1)])).toBe('solide : repère de pièce 1 déjà pris par P');
  });
  it('une pièce dont dépendent des occurrences reste une pièce', () => {
    const occ = { ...line, id: 'O', kind: 'occurrence', sourceId: 'P', x: 0, y: 0, z: 0, angle: 0 } as unknown as CadObject;
    expect(validateCommand('updateObject', ['P', { partDef: undefined }], [part('P', 1), occ])).toBe('modification : P reste une pièce, O en dépend');
    expect(validateCommand('updateObject', ['P', { partDef: undefined }], [part('P', 1)])).toBeNull();
  });
});

describe('relecture 29e passe : échelle de bloc, cotes de lissage', () => {
  it('occurrence de bloc : échelle strictement positive', () => {
    const ref = (scale: number) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'blockRef', blockId: 'BLK-0001', x: 0, y: 0, scale }], [], undefined, { blocks: [{ id: 'BLK-0001' }] });
    expect(ref(1)).toBeNull();
    expect(ref(0)).toBe('blockRef : scale positif attendu');
    expect(ref(-1)).toBe('blockRef : scale positif attendu');
  });
  it('lissage : cotes strictement monotones', () => {
    const sec = (z: number) => ({ z, points: [[0, 0], [10, 0], [10, 10], [0, 10]] });
    const loft = (zs: number[]) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'loft', ruled: true, sections: zs.map(sec) } }], []);
    expect(loft([0, 500, 1000])).toBeNull();
    expect(loft([1000, 500, 0])).toBeNull();
    expect(loft([0, 1000, 500])).toBe('solide : lissage : les cotes des sections doivent croître (ou décroître) strictement');
    expect(loft([0, 0])).toBe('solide : lissage : les cotes des sections doivent croître (ou décroître) strictement');
  });
});

describe('relecture 30e passe : faces désignées, liaisons réalisables', () => {
  const box = { op: 'box', x: 100, y: 100, z: 100, name: 'B' };
  const solid = (recipe: unknown) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe }], []);
  it('pousser / tirer, coque, congé : faces nommées dans la recette d’entrée', () => {
    expect(solid({ op: 'pushpull', of: box, face: { feature: 'B', role: 'zmax' }, distance: 10 })).toBeNull();
    expect(solid({ op: 'pushpull', of: box, face: { feature: 'X', role: 'zmax' }, distance: 10 })).toBe('solide : pousser / tirer : face X.zmax introuvable (fonction « X » absente de la recette)');
    expect(solid({ op: 'shell', of: box, thickness: 5, open: { feature: 'B', role: 'haut' } })).toBe('solide : coque : face B.haut introuvable (rôle « haut » absent de la fonction « B »)');
    expect(solid({ op: 'fillet', of: box, r: 5, edges: [{ faces: [{ feature: 'B', role: 'zmax' }, { feature: 'B', role: 'q' }] }] })).toBe('solide : congé : face B.q introuvable (rôle « q » absent de la fonction « B »)');
    expect(solid({ op: 'fillet', of: box, r: 5 })).toBeNull();
  });
  it('liaison coaxiale ou d’appui : faces existantes et compatibles', () => {
    const part = { ...line, id: 'P', kind: 'solid', recipe: { op: 'cylinder', r: 10, h: 50, name: 'C' }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    const occ = { kind: 'occurrence', classification: 'non-classifie', sourceId: 'P', x: 100, y: 0, z: 0, angle: 0 };
    const add = (mate: unknown) => validateCommand('addObject', [{ ...occ, mate }], [part]);
    expect(add({ type: 'coaxiale', to: 'P', face: { feature: 'C', role: 'wall' }, toFace: { feature: 'C', role: 'wall' } })).toBeNull();
    expect(add({ type: 'coaxiale', to: 'P', face: { feature: 'Z', role: 'wall' }, toFace: { feature: 'C', role: 'wall' } })).toMatch(/^occurrence : liaison impossible \(/);
    expect(add({ type: 'coaxiale', to: 'P', face: { feature: 'C', role: 'base' }, toFace: { feature: 'C', role: 'wall' } })).toBe('occurrence : liaison impossible (liaison coaxiale : deux faces cylindriques attendues)');
  });
});

describe('relecture 31e passe : mur hôte, pousser / tirer plan, trajet continu, liaisons en boucle', () => {
  it('mur raccourci sous son ouverture : refusé', () => {
    const w = { ...line, id: 'W', kind: 'wall', x2: 3000, thickness: 200, justification: 'axe' } as unknown as CadObject;
    const op = { ...line, id: 'O', kind: 'opening', hostId: 'W', type: 'fenetre', position: 2000, width: 900 } as unknown as CadObject;
    expect(validateCommand('updateObject', ['W', { x2: 2200 }], [w, op])).toBe('modification : O ne tiendrait plus dans W (L’ouverture (900 mm) dépasse du mur (2200 mm).)');
    expect(validateCommand('updateObject', ['W', { x2: 2500 }], [w, op])).toBeNull();
  });
  it('pousser / tirer : face plane exigée', () => {
    const cyl = { op: 'cylinder', r: 10, h: 50, name: 'C' };
    const solid = (face: unknown) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'pushpull', of: cyl, face, distance: 5 } }], []);
    expect(solid({ feature: 'C', role: 'wall' })).toBe('solide : pousser / tirer : face C.wall non plane');
  });
  it('balayage : trajet d’un seul tenant', () => {
    const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const sweep = (path: unknown[]) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'sweep', profile: sq, path } }], []);
    expect(sweep([{ kind: 'line', from: [0, 0], to: [0, 100] }, { kind: 'line', from: [0, 100], to: [100, 100] }])).toBeNull();
    expect(sweep([{ kind: 'line', from: [0, 0], to: [0, 100] }, { kind: 'line', from: [50, 100], to: [100, 100] }])).toBe('solide : balayage : trajet discontinu (segment 2)');
  });
  it('liaison sur soi-même ou en boucle : refusée', () => {
    const part = { ...line, id: 'P', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    const occ = (id: string, mate?: unknown) => ({ ...line, id, kind: 'occurrence', sourceId: 'P', x: 0, y: 0, z: 0, angle: 0, ...(mate ? { mate } : {}) }) as unknown as CadObject;
    const fixe = (to: string) => ({ type: 'fixe', to, rel: [0, 0, 0, 0] });
    expect(validateCommand('updateObject', ['A', { mate: fixe('A') }], [part, occ('A')])).toBe('occurrence : liaison en boucle (A dépend de lui-même)');
    expect(validateCommand('updateObject', ['A', { mate: fixe('B') }], [part, occ('A'), occ('B', fixe('A'))])).toBe('occurrence : liaison en boucle (A dépend de lui-même)');
    expect(validateCommand('updateObject', ['A', { mate: fixe('B') }], [part, occ('A'), occ('B', fixe('P'))])).toBeNull();
  });
});

describe('relecture 32e passe : murs transformés, liaisons après modification d’une pièce', () => {
  it('mur mis à l’échelle sans son ouverture : refusé si elle n’y tient plus', () => {
    const w = { ...line, id: 'W', kind: 'wall', x2: 10000, thickness: 200, justification: 'axe' } as unknown as CadObject;
    const op = { ...line, id: 'O', kind: 'opening', hostId: 'W', type: 'fenetre', position: 8000, width: 900 } as unknown as CadObject;
    expect(transformTargetsError(['W'], { kind: 'scale', cx: 0, cy: 0, factor: 0.5 }, [w, op], [])).toBe('O ne tiendrait plus dans W (L’ouverture (900 mm) dépasse du mur (5000 mm).)');
    expect(transformTargetsError(['W'], { kind: 'move', dx: 100, dy: 0 }, [w, op], [])).toBeNull();
  });
  it('recette d’une pièce changée : la liaison qui vise une de ses faces doit rester réalisable', () => {
    const part = { ...line, id: 'P', kind: 'solid', recipe: { op: 'cylinder', r: 10, h: 50, name: 'C' }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    const occ = { ...line, id: 'O', kind: 'occurrence', sourceId: 'P', x: 100, y: 0, z: 0, angle: 0, mate: { type: 'coaxiale', to: 'P', face: { feature: 'C', role: 'wall' }, toFace: { feature: 'C', role: 'wall' } } } as unknown as CadObject;
    expect(validateCommand('updateObject', ['P', { recipe: { op: 'box', x: 10, y: 10, z: 10 } }], [part, occ])).toMatch(/^modification : la liaison de O deviendrait impossible \(/);
    expect(validateCommand('updateObject', ['P', { recipe: { op: 'cylinder', r: 20, h: 50, name: 'C' } }], [part, occ])).toBeNull();
  });
});

describe('relecture 33e passe : objet transformé complet', () => {
  it('échelle infime qui arrondit les dimensions à zéro : refusée', () => {
    const r = { ...line, id: 'R', kind: 'rect', x: 0, y: 0, w: 1, h: 1 } as unknown as CadObject;
    expect(transformTargetsError(['R'], { kind: 'scale', cx: 0, cy: 0, factor: 0.0001 }, [r], [])).toMatch(/^R non transformable \(rect : /);
    expect(transformTargetsError(['R'], { kind: 'scale', cx: 0, cy: 0, factor: 2 }, [r], [])).toBeNull();
  });
});

describe('relecture 34e passe : recettes STEP, références revalidées à la fusion', () => {
  it('recette STEP : réservée à l’import ; un solide importé reste modifiable', () => {
    const step = { op: 'step', data: 'ISO-10303-21;', bounds: { min: [0, 0, 0], max: [1, 1, 1] }, trace: [] };
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: step }], [])).toBe('solide : recette STEP réservée à l’import (Fichier › Importer STEP)');
    expect(validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'translate', of: step, by: [1, 0, 0] } }], [])).toBe('solide : recette STEP réservée à l’import (Fichier › Importer STEP)');
    const imported = { ...line, id: 'S', kind: 'solid', recipe: step } as unknown as CadObject;
    expect(validateCommand('updateObject', ['S', { name: 'Pièce importée', recipe: step }], [imported])).toBeNull();
    expect(validateCommand('updateObject', ['S', { recipe: { ...step, data: 'ISO-10303-21; autre' } }], [imported])).toBe('modification : recette STEP réservée à l’import (Fichier › Importer STEP)');
  });
  it('fusion : pièce retirée d’un côté, occurrence ajoutée de l’autre → refus', () => {
    const part = { ...line, id: 'P', kind: 'solid', recipe: { op: 'box', x: 1, y: 1, z: 1 }, partDef: { no: 1, origin: [0, 0, 0], angle: 0 } } as unknown as CadObject;
    const plain = { ...part, partDef: undefined } as unknown as CadObject;
    const occ = { ...line, id: 'O', kind: 'occurrence', sourceId: 'P', x: 0, y: 0, z: 0, angle: 0 } as unknown as CadObject;
    expect(mergedReferenceError({ objects: [plain, occ] }, { objects: [plain] }, { objects: [part, occ] })).toBe('Fusion refusée : occurrence : P n’est pas une pièce (définir la pièce d’abord).');
    expect(mergedReferenceError({ objects: [part, occ] }, { objects: [part] }, { objects: [part, occ] })).toBeNull();
  });
});

describe('relecture 35e passe : révolution d’un seul côté de l’axe', () => {
  const rev = (profile: number[][], axis?: unknown) => validateCommand('addObject', [{ classification: 'non-classifie', kind: 'solid', recipe: { op: 'revolve', profile, angle: 360, ...(axis ? { axis } : {}) } }], []);
  it('axe donné ou axe par défaut (Z) : contour qui traverse l’axe refusé', () => {
    expect(rev([[10, 0], [20, 0], [20, 10], [10, 10]])).toBeNull();
    expect(rev([[-10, 0], [20, 0], [20, 10], [-10, 10]])).toBe('solide : révolution : le contour traverse l’axe ; il doit rester d’un seul côté');
    const axis = { origin: [0, 0], dir: [1, 0] };
    expect(rev([[0, 10], [20, 10], [20, 20], [0, 20]], axis)).toBeNull();
    expect(rev([[0, -10], [20, -10], [20, 20], [0, 20]], axis)).toBe('solide : révolution : le contour traverse l’axe ; il doit rester d’un seul côté');
  });
});

describe('relecture 36e passe : niveau de l’ouverture, îlots et modifications vides après transformation', () => {
  const w = (lvl?: string) => ({ ...line, id: 'W', kind: 'wall', x2: 3000, thickness: 200, justification: 'axe', ...(lvl ? { levelId: lvl } : {}) }) as unknown as CadObject;
  const op = { classification: 'non-classifie', layerId: 'LAY-0001', kind: 'opening', hostId: 'W', type: 'fenetre', position: 1000, width: 900 };
  const P2 = { levels: [{ id: 'NIV-0001' }, { id: 'NIV-0002' }] };
  it('ouverture sur le niveau de son mur (niveau donné, ou niveau actif à la création)', () => {
    expect(validateCommand('addObject', [{ ...op, levelId: 'NIV-0002' }], [w('NIV-0002')], undefined, P2)).toBeNull();
    expect(validateCommand('addObject', [{ ...op, levelId: 'NIV-0001' }], [w('NIV-0002')], undefined, P2)).toBe('ouverture : niveau NIV-0001 différent de celui du mur W (NIV-0002)');
    expect(validateCommand('addObject', [op], [w('NIV-0002')], undefined, { ...P2, activeLevelId: 'NIV-0002' })).toBeNull();
    expect(validateCommand('addObject', [op], [w('NIV-0002')], undefined, { ...P2, activeLevelId: 'NIV-0001' })).toBe('ouverture : niveau NIV-0001 différent de celui du mur W (NIV-0002)');
  });
  it('transformation : îlot laissé hors du contour, modification vide d’un objet qui suit son parent', () => {
    const rect = { ...line, id: 'R', kind: 'rect', x: 0, y: 0, w: 100, h: 100, holes: ['D'] } as unknown as CadObject;
    const disc = { ...line, id: 'D', kind: 'circle', cx: 50, cy: 50, r: 10 } as unknown as CadObject;
    expect(transformTargetsError(['R'], { kind: 'move', dx: 500, dy: 0 }, [rect, disc], [])).toBe('D ne serait plus un îlot de R (hors du contour)');
    expect(transformTargetsError(['R', 'D'], { kind: 'move', dx: 500, dy: 0 }, [rect, disc], [])).toBeNull();
    expect(transformTargetsError(['R'], { kind: 'move', dx: 5, dy: 0 }, [rect, disc], [])).toBeNull();
    const opening = { ...line, ...op, id: 'O' } as unknown as CadObject;
    expect(transformTargetsError(['O'], { kind: 'move', dx: 10, dy: 0 }, [w(), opening], [])).toBe('O non transformable (il suit son parent ; transformer aussi W)');
    expect(transformTargetsError(['W', 'O'], { kind: 'move', dx: 10, dy: 0 }, [w(), opening], [])).toBeNull();
  });
});

