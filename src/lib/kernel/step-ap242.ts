// En-tête STEP AP242 édition 3 (lot 17.2, décision D5). Le noyau OCCT écrit l'AP242 sous son
// identifiant d'édition 1 ; DrawAll n'y écrit que le sous-ensemble B-rep et produit (produit, forme,
// représentation B-rep avancée, unités), commun aux éditions 1 à 3, et déclare l'édition 3 :
// identifiant de schéma { 1 0 10303 442 3 1 4 } et protocole d'application de 2022. Fonctions pures.

export const AP242_ED3 = 'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 3 1 4 }';

/** Entités du sous-ensemble écrit par DrawAll (contrôle : rien d'autre n'est accepté dans l'export). */
export const AP242_SUBSET = new Set([
  'APPLICATION_PROTOCOL_DEFINITION', 'APPLICATION_CONTEXT', 'SHAPE_DEFINITION_REPRESENTATION', 'PRODUCT_DEFINITION_SHAPE',
  'PRODUCT_DEFINITION', 'PRODUCT_DEFINITION_FORMATION', 'PRODUCT', 'PRODUCT_CONTEXT', 'PRODUCT_DEFINITION_CONTEXT',
  'PRODUCT_RELATED_PRODUCT_CATEGORY', 'ADVANCED_BREP_SHAPE_REPRESENTATION', 'SHAPE_REPRESENTATION', 'SHAPE_REPRESENTATION_RELATIONSHIP',
  'NEXT_ASSEMBLY_USAGE_OCCURRENCE', 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION', 'REPRESENTATION_RELATIONSHIP', 'ITEM_DEFINED_TRANSFORMATION',
  'AXIS2_PLACEMENT_3D', 'AXIS2_PLACEMENT_2D', 'PARAMETRIC_REPRESENTATION_CONTEXT', 'CARTESIAN_POINT', 'DIRECTION', 'VECTOR', 'LINE', 'CIRCLE', 'ELLIPSE', 'PLANE', 'CYLINDRICAL_SURFACE',
  'CONICAL_SURFACE', 'SPHERICAL_SURFACE', 'TOROIDAL_SURFACE', 'SURFACE_OF_LINEAR_EXTRUSION', 'SURFACE_OF_REVOLUTION',
  'B_SPLINE_CURVE_WITH_KNOTS', 'B_SPLINE_SURFACE_WITH_KNOTS', 'RATIONAL_B_SPLINE_CURVE', 'RATIONAL_B_SPLINE_SURFACE',
  'BOUNDED_CURVE', 'BOUNDED_SURFACE', 'B_SPLINE_CURVE', 'B_SPLINE_SURFACE', 'CURVE', 'SURFACE', 'GEOMETRIC_REPRESENTATION_ITEM',
  'REPRESENTATION_ITEM', 'SURFACE_CURVE', 'SEAM_CURVE', 'PCURVE', 'DEFINITIONAL_REPRESENTATION', 'TRIMMED_CURVE', 'POLYLINE',
  'MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'ORIENTED_CLOSED_SHELL', 'CLOSED_SHELL', 'OPEN_SHELL', 'ADVANCED_FACE', 'FACE_BOUND',
  'FACE_OUTER_BOUND', 'EDGE_LOOP', 'ORIENTED_EDGE', 'EDGE_CURVE', 'VERTEX_POINT', 'VERTEX_LOOP',
  'GEOMETRIC_REPRESENTATION_CONTEXT', 'GLOBAL_UNIT_ASSIGNED_CONTEXT', 'GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT', 'REPRESENTATION_CONTEXT',
  'UNCERTAINTY_MEASURE_WITH_UNIT', 'LENGTH_MEASURE_WITH_UNIT', 'LENGTH_UNIT', 'NAMED_UNIT', 'SI_UNIT', 'PLANE_ANGLE_UNIT',
  'SOLID_ANGLE_UNIT', 'CONVERSION_BASED_UNIT', 'DIMENSIONAL_EXPONENTS', 'PLANE_ANGLE_MEASURE_WITH_UNIT',
  'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION', 'PRESENTATION_STYLE_ASSIGNMENT', 'STYLED_ITEM', 'SURFACE_STYLE_USAGE',
  'SURFACE_SIDE_STYLE', 'SURFACE_STYLE_FILL_AREA', 'FILL_AREA_STYLE', 'FILL_AREA_STYLE_COLOUR', 'COLOUR_RGB', 'CURVE_STYLE',
  'DRAUGHTING_PRE_DEFINED_CURVE_FONT', 'DRAUGHTING_PRE_DEFINED_COLOUR', 'PRESENTATION_LAYER_ASSIGNMENT',
]);

/** Types d'entités d'un fichier STEP (y compris ceux des entités complexes « ( A() B() ) »). */
export function entityTypes(text: string): Set<string> {
  const data = text.slice(text.indexOf('DATA;'));
  const out = new Set<string>();
  for (const m of data.matchAll(/#\d+\s*=\s*([A-Z_0-9]+)?\s*\(/g)) {
    if (m[1]) { out.add(m[1]); continue; }
    // Entité complexe : liste de types entre parenthèses.
    const start = (m.index ?? 0) + m[0].length;
    let depth = 1, i = start;
    while (i < data.length && depth > 0) { if (data[i] === '(') depth++; else if (data[i] === ')') depth--; i++; }
    for (const t of data.slice(start, i).matchAll(/(?:^|\)|\s)([A-Z_][A-Z_0-9]*)\s*\(/g)) out.add(t[1]);
  }
  return out;
}

/**
 * Caractères hors ASCII imprimable d'un contenu de chaîne (ISO 10303-21) : plan multilingue de base
 * en \X2\…\X0\ (quatre chiffres), au-delà (émoji…) en \X4\…\X0\ (huit chiffres, point de code entier).
 */
const encodeText = (s: string) => s.replace(/[^\x20-\x7e]+/gu, run => [...run].map(c => c.codePointAt(0)!)
  .reduce<{ wide: boolean; codes: string[] }[]>((acc, cp) => {
    const wide = cp > 0xffff, last = acc[acc.length - 1];
    const hex = cp.toString(16).toUpperCase().padStart(wide ? 8 : 4, '0');
    if (last && last.wide === wide) last.codes.push(hex); else acc.push({ wide, codes: [hex] });
    return acc;
  }, [])
  .map(g => `\\${g.wide ? 'X4' : 'X2'}\\${g.codes.join('')}\\X0\\`).join(''));
// Chaîne d'en-tête : barre oblique inverse doublée (elle ouvre une directive \X2\…), apostrophe doublée.
const q = (s: string) => `'${encodeText(s.replace(/\\/g, '\\\\').replace(/'/g, "''"))}'`;

/**
 * En-tête et protocole d'application de l'édition 3. Refuse (renvoie l'erreur) un fichier qui
 * contiendrait une entité hors du sous-ensemble B-rep : rien n'est déclaré sans être vérifié.
 */
export function toAp242Ed3(text: string, fileName: string, date: Date): { content: string } | { error: string } {
  const outside = [...entityTypes(text)].filter(t => !AP242_SUBSET.has(t)).sort();
  if (outside.length) return { error: `entités hors du sous-ensemble AP242 retenu : ${outside.join(', ')}` };
  const data = text.slice(text.indexOf('DATA;'));
  const header = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('DrawAll : solides'),'2;1');",
    `FILE_NAME(${q(fileName)},'${date.toISOString().slice(0, 19)}',(''),(''),'DrawAll','DrawAll (noyau Open CASCADE)','');`,
    `FILE_SCHEMA(('${AP242_ED3}'));`, 'ENDSEC;',
  ].join('\n');
  // Chaînes du noyau écrites en UTF-8 brut : réencodées (seul l'ASCII imprimable est admis).
  const body = data.replace(/'((?:[^']|'')*)'/g, (_m, inner: string) => `'${encodeText(inner)}'`).replace(/APPLICATION_PROTOCOL_DEFINITION\('international standard',\s*'ap242_managed_model_based_3d_engineering',\s*\d+,/, "APPLICATION_PROTOCOL_DEFINITION('international standard','ap242_managed_model_based_3d_engineering',2022,");
  return { content: `${header}\n${body}` };
}

/** Schéma déclaré par un fichier STEP (contenu de FILE_SCHEMA), ou null. */
export function declaredSchema(text: string): string | null {
  const m = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}
