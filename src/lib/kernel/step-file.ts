// Lecture du texte d'un fichier STEP (ISO 10303-21) — lot 11.4, essai P0.
// Le noyau (OCCT) transfère la géométrie mais ne rend, dans ce module, ni l'arbre d'assemblage,
// ni les noms de produits, ni les couleurs, calques ou annotations. Cette lecture du texte les relève
// pour que l'import puisse dire ce qu'il a gardé et ce qu'il a perdu. Fonctions pures.

export interface StepEntity {
  /** Type, ou types d'une entité complexe « ( A(…) B(…) ) », en majuscules. */
  types: string[];
  /** Arguments bruts de chaque type (texte entre les parenthèses). */
  args: string[];
}

export interface StepFile {
  schemas: string[];
  /** Système d'origine déclaré dans l'en-tête (FILE_NAME). */
  originatingSystem: string;
  entities: Map<number, StepEntity>;
}

/** Découpe en arguments de premier niveau (virgules hors parenthèses et hors chaînes). */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '', inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else inStr = false; }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

/** Valeur d'une chaîne STEP ('…', apostrophes doublées). */
export const stepString = (a: string | undefined) => (a && a.startsWith("'") ? a.slice(1, -1).replace(/''/g, "'") : '');
/** Référence #n, ou null. */
export const stepRef = (a: string | undefined) => { const m = /^#(\d+)$/.exec(a?.trim() ?? ''); return m ? Number(m[1]) : null; };
/** Références contenues dans une liste « (#1,#2) ». */
export const stepRefs = (a: string | undefined) => [...(a ?? '').replace(/'(?:[^']|'')*'/g, "''").matchAll(/#(\d+)/g)].map(m => Number(m[1]));

/** Instructions « …; » d'une section, chaînes et commentaires respectés. */
function statements(section: string): string[] {
  const out: string[] = [];
  let cur = '', inStr = false;
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (!inStr && ch === '/' && section[i + 1] === '*') { const end = section.indexOf('*/', i + 2); i = end < 0 ? section.length : end + 1; continue; }
    if (ch === "'") inStr = !inStr; // '' (apostrophe doublée) referme puis rouvre : sans effet
    if (!inStr && ch === ';') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Simple : « TYPE(args) » ; complexe : « (A(args) B(args)) ». */
function parseInstance(body: string): StepEntity | null {
  const simple = /^([A-Z0-9_]+)\s*\(([\s\S]*)\)$/i.exec(body);
  if (simple) return { types: [simple[1].toUpperCase()], args: [simple[2]] };
  if (!body.startsWith('(') || !body.endsWith(')')) return null;
  const inner = body.slice(1, -1);
  const types: string[] = [], args: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const m = /^\s*([A-Z0-9_]+)\s*\(/i.exec(inner.slice(i));
    if (!m) break;
    let j = i + m[0].length, depth = 1, inStr = false;
    for (; j < inner.length && depth > 0; j++) {
      const ch = inner[j];
      if (ch === "'") inStr = !inStr;
      else if (!inStr && ch === '(') depth++;
      else if (!inStr && ch === ')') depth--;
    }
    types.push(m[1].toUpperCase());
    args.push(inner.slice(i + m[0].length, j - 1));
    i = j;
  }
  return types.length ? { types, args } : null;
}

/** Lit l'en-tête et la section DATA ; lève une erreur si le fichier n'est pas un STEP Part 21 complet. */
export function parseStepFile(text: string): StepFile {
  if (!/^\s*ISO-10303-21\s*;/.test(text)) throw new Error('Fichier STEP invalide : en-tête ISO-10303-21 absent.');
  if (!/END-ISO-10303-21\s*;\s*$/.test(text)) throw new Error('Fichier STEP incomplet : marque de fin END-ISO-10303-21 absente (fichier tronqué ?).');
  const head = /HEADER\s*;([\s\S]*?)ENDSEC\s*;/.exec(text);
  const header = head?.[1] ?? '';
  // Sections DATA : une ou plusieurs (édition 3 de la Part 21), éventuellement paramétrées
  // « DATA('nom', ('schéma')); » ; toutes sont lues, après l'en-tête.
  const body = head ? text.slice(head.index + head[0].length) : text;
  const sections = [...body.matchAll(/\bDATA\s*(?:\((?:[^()']|'(?:[^']|'')*'|\((?:[^()']|'(?:[^']|'')*')*\))*\))?\s*;([\s\S]*?)ENDSEC\s*;/g)].map(m => m[1]);
  if (!sections.length) throw new Error('Fichier STEP invalide : section DATA absente.');
  let schemas: string[] = [], originatingSystem = '';
  for (const st of statements(header)) {
    const e = parseInstance(st);
    if (!e) continue;
    const a = splitArgs(e.args[0]);
    if (e.types[0] === 'FILE_SCHEMA') schemas = [...(a[0] ?? '').matchAll(/'((?:[^']|'')*)'/g)].map(m => m[1]);
    if (e.types[0] === 'FILE_NAME') originatingSystem = stepString(a[5]);
  }
  const entities = new Map<number, StepEntity>();
  for (const st of sections.flatMap(statements)) {
    const m = /^#(\d+)\s*=\s*([\s\S]+)$/.exec(st);
    if (!m) continue;
    const e = parseInstance(m[2].trim());
    if (e) entities.set(Number(m[1]), e);
  }
  return { schemas, originatingSystem, entities };
}

const argsOf = (f: StepFile, id: number | null, type: string) => {
  if (id === null) return null;
  const e = f.entities.get(id);
  const k = e?.types.indexOf(type) ?? -1;
  return k >= 0 ? splitArgs(e!.args[k]) : null;
};
const ofType = (f: StepFile, type: string) => [...f.entities].filter(([, e]) => e.types.includes(type));

export interface AssemblyNode { product: string; children: AssemblyNode[] }

export interface LengthUnit { name: string; mm: number }

export interface StepInventory {
  schemas: string[];
  originatingSystem: string;
  entityCount: number;
  /** Unités de longueur des contextes géométriques (facteur vers le millimètre). */
  lengthUnits: LengthUnit[];
  /** Noms des produits (pièces et sous-ensembles). */
  products: string[];
  /** Arbre d'assemblage à partir des produits racines (occurrences dépliées). */
  tree: AssemblyNode[];
  /** Occurrences de pièces (feuilles de l'arbre déplié). */
  leafOccurrences: number;
  /** Corps solides décrits dans le fichier (avant transfert). */
  solidBodies: number;
  /** Contenus que la lecture géométrique ne transfère pas, par catégorie (nombre d'entités). */
  notTransferred: Record<string, number>;
  /** Références vers des entités absentes du fichier. */
  danglingRefs: { from: number; to: number }[];
}

const SI_PREFIX: Record<string, number> = { '': 1, MILLI: 1e-3, CENTI: 1e-2, DECI: 1e-1, KILO: 1e3, MICRO: 1e-6, NANO: 1e-9 };

/** Unité de longueur d'une entité unité, en millimètres. */
function lengthUnit(f: StepFile, id: number, depth = 0): LengthUnit | null {
  const e = f.entities.get(id);
  if (!e || !e.types.includes('LENGTH_UNIT') || depth > 4) return null;
  const si = argsOf(f, id, 'SI_UNIT');
  if (si) {
    const prefix = (si[0] ?? '$').replace(/\./g, '').replace('$', '');
    const factor = SI_PREFIX[prefix];
    return factor === undefined ? null : { name: `${prefix ? prefix.toLowerCase() : ''}mètre`, mm: factor * 1000 };
  }
  const conv = argsOf(f, id, 'CONVERSION_BASED_UNIT');
  if (conv) {
    const measure = argsOf(f, stepRef(conv[1]), 'LENGTH_MEASURE_WITH_UNIT');
    // Valeur typée « LENGTH_MEASURE(25.4) » ou nue « 25.4 » : les deux formes se rencontrent.
    const value = Number(/^(?:LENGTH_MEASURE\s*\(\s*)?([-+0-9.Ee]+)/.exec(measure?.[0]?.trim() ?? '')?.[1]);
    const base = lengthUnit(f, stepRef(measure?.[1]) ?? -1, depth + 1);
    return base && Number.isFinite(value) ? { name: stepString(conv[0]).toLowerCase(), mm: value * base.mm } : null;
  }
  return null;
}

/**
 * Catégories de contenu que STEPControl_Reader ne transfère pas (types d'entités). DIMENSIONAL_EXPONENTS
 * (dimension d'une unité) n'est pas une cote : exclu des annotations.
 */
const NOT_TRANSFERRED: [string, (t: string) => boolean][] = [
  ['couleurs et styles', t => t === 'STYLED_ITEM' || t === 'OVER_RIDING_STYLED_ITEM' || t === 'COLOUR_RGB' || t === 'DRAUGHTING_PRE_DEFINED_COLOUR'],
  ['calques', t => t === 'PRESENTATION_LAYER_ASSIGNMENT'],
  ['annotations et tolérancement (PMI)', t => /^(DIMENSIONAL_(SIZE|LOCATION|CHARACTERISTIC)|GEOMETRIC_TOLERANCE|DATUM|ANNOTATION_|DRAUGHTING_CALLOUT|TESSELLATED_ANNOTATION)/.test(t)],
  ['propriétés de validation et attributs', t => t === 'PROPERTY_DEFINITION' || t === 'GENERAL_PROPERTY'],
];

export function inventory(f: StepFile): StepInventory {
  // Produits : PRODUCT ← PRODUCT_DEFINITION_FORMATION ← PRODUCT_DEFINITION.
  const productName = new Map<number, string>();
  for (const [id, e] of ofType(f, 'PRODUCT')) productName.set(id, stepString(splitArgs(e.args[e.types.indexOf('PRODUCT')])[1]) || stepString(splitArgs(e.args[0])[0]));
  const formationProduct = new Map<number, number>();
  for (const type of ['PRODUCT_DEFINITION_FORMATION', 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE']) {
    for (const [id] of ofType(f, type)) { const p = stepRef(argsOf(f, id, type)?.[2]); if (p !== null) formationProduct.set(id, p); }
  }
  const pdName = new Map<number, string>();
  for (const [id] of ofType(f, 'PRODUCT_DEFINITION')) {
    const formation = stepRef(argsOf(f, id, 'PRODUCT_DEFINITION')?.[2]);
    pdName.set(id, productName.get(formationProduct.get(formation ?? -1) ?? -1) ?? `#${id}`);
  }
  // Assemblage : NEXT_ASSEMBLY_USAGE_OCCURRENCE(id, nom, description, parent, enfant, …).
  const children = new Map<number, number[]>();
  const isChild = new Set<number>();
  for (const [id] of ofType(f, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE')) {
    const a = argsOf(f, id, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE')!;
    const parent = stepRef(a[3]), child = stepRef(a[4]);
    if (parent === null || child === null) continue;
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(child);
    isChild.add(child);
  }
  let leafOccurrences = 0;
  const expand = (pd: number, depth: number): AssemblyNode => {
    const kids = depth < 32 ? children.get(pd) ?? [] : [];
    if (!kids.length) leafOccurrences++;
    return { product: pdName.get(pd) ?? `#${pd}`, children: kids.map(k => expand(k, depth + 1)) };
  };
  const tree = [...pdName.keys()].filter(pd => !isChild.has(pd)).map(pd => expand(pd, 0));

  // Unités : contextes géométriques à unités globales.
  const units = new Map<string, LengthUnit>();
  for (const [, e] of ofType(f, 'GLOBAL_UNIT_ASSIGNED_CONTEXT')) {
    for (const u of stepRefs(e.args[e.types.indexOf('GLOBAL_UNIT_ASSIGNED_CONTEXT')])) {
      const l = lengthUnit(f, u);
      if (l) units.set(`${l.name}:${l.mm}`, l);
    }
  }

  const notTransferred: Record<string, number> = {};
  const danglingRefs: { from: number; to: number }[] = [];
  let solidBodies = 0;
  for (const [id, e] of f.entities) {
    for (const t of e.types) {
      if (t === 'MANIFOLD_SOLID_BREP' || t === 'BREP_WITH_VOIDS' || t === 'FACETED_BREP') solidBodies++;
      const cat = NOT_TRANSFERRED.find(([, test]) => test(t));
      if (cat) notTransferred[cat[0]] = (notTransferred[cat[0]] ?? 0) + 1;
    }
    for (const a of e.args) for (const r of stepRefs(a)) if (!f.entities.has(r)) danglingRefs.push({ from: id, to: r });
  }
  return {
    schemas: f.schemas, originatingSystem: f.originatingSystem, entityCount: f.entities.size,
    lengthUnits: [...units.values()], products: [...new Set(productName.values())], tree, leafOccurrences, solidBodies, notTransferred, danglingRefs,
  };
}
