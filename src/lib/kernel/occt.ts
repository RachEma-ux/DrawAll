// Noyau OCCT (lot 11.2, décision D1) : Open CASCADE compilé en WebAssembly (paquet
// replicad-opencascadejs, LGPL-2.1) piloté par replicad (MIT). Le module WebAssembly est un fichier
// séparé, chargé à la demande et remplaçable (décision de licence du maître d'ouvrage, feuille de
// route §7). Ce fichier n'est importé que par le Worker du noyau et par les tests.
import opencascade from 'replicad-opencascadejs';
import { FaceFinder, draw, makeBaseBox, makeCylinder, measureVolume, setOC, type Edge, type Face, type Shape3D } from 'replicad';
import type { EdgeRef, FaceRef, MeshResult, SolidRecipe, Vec3 } from './recipe';
import { edgeLabel, faceLabel, featureSupports, pointOnSupport, supportOf, surfaceTypeOf, type RefReport, type Support, type Supports } from './references';

/** Référence non résolue : l'opération n'est pas appliquée, la référence est à réparer (lot 11.3). */
export class UnresolvedReferenceError extends Error {
  readonly reports: RefReport[];
  constructor(reports: RefReport[]) {
    super(`Référence à réparer : ${reports.filter(r => r.status === 'à réparer').map(r => `${r.ref} (${r.reason})`).join(' ; ')}`);
    this.reports = reports;
  }
}

export interface Kernel {
  /** Volume du solide ; lève UnresolvedReferenceError si une référence est à réparer. */
  volume(recipe: SolidRecipe): number;
  mesh(recipe: SolidRecipe, tolerance?: number): MeshResult;
  /**
   * Résout chaque référence topologique de la recette sur le solide qu'elle vise. Une opération dont
   * une référence est à réparer est sautée (son solide d'entrée passe tel quel) ; rien n'est réattribué.
   */
  references(recipe: SolidRecipe): RefReport[];
  /** Durée du chargement du module (ms). */
  loadMs: number;
}

let loading: Promise<Kernel> | null = null;

/** Charge OCCT une seule fois ; `locateFile` donne l'adresse du fichier WebAssembly (navigateur). */
export function loadKernel(locateFile?: (file: string) => string): Promise<Kernel> {
  loading ??= (async () => {
    const t0 = performance.now();
    const oc = await opencascade(locateFile ? { locateFile } : {});
    setOC(oc as never);
    return makeKernel(performance.now() - t0);
  })();
  return loading;
}

function polygon(profile: [number, number][]) {
  let pen = draw(profile[0]);
  for (const p of profile.slice(1)) pen = pen.lineTo(p);
  return pen.close();
}

/** `report` absent : mode strict (une référence à réparer lève une erreur). */
function build(r: SolidRecipe, report?: RefReport[]): Shape3D {
  switch (r.op) {
    case 'box': {
      // makeBaseBox est centré en X et Y, posé sur Z = 0 : replacé au coin demandé.
      const at = r.at ?? [0, 0, 0];
      return makeBaseBox(r.x, r.y, r.z).translate([at[0] + r.x / 2, at[1] + r.y / 2, at[2]]);
    }
    case 'cylinder': return makeCylinder(r.r, r.h, r.at ?? [0, 0, 0], r.dir ?? [0, 0, 1]);
    case 'extrude': return polygon(r.profile).sketchOnPlane('XY').extrude(r.height) as Shape3D;
    case 'revolve': return polygon(r.profile).sketchOnPlane('XZ').revolve([0, 0, 1], { angle: r.angle }) as Shape3D;
    case 'union': return combine(r.a, r.b, report, (a, b) => a.fuse(b));
    case 'cut': return combine(r.a, r.b, report, (a, b) => a.cut(b));
    case 'intersect': return combine(r.a, r.b, report, (a, b) => a.intersect(b));
    case 'fillet': {
      const edges = r.edges;
      if (!edges) return derive(r.of, report, s => s.fillet(r.r));
      return derive(r.of, report, s => {
        const sup = featureSupports(r.of);
        const found = edges.map(e => resolveEdge(s, sup, e));
        return applyResolved(found, report, s, targets => s.fillet(e => (targets.some(t => t.isSame(e)) ? r.r : null)));
      });
    }
    case 'shell': {
      const open = r.open;
      if (!open) return derive(r.of, report, s => s.shell(r.thickness, f => f.inPlane('XY', topOf(s))));
      return derive(r.of, report, s => {
        const found = [resolveFace(s, featureSupports(r.of), open)];
        return applyResolved(found, report, s, ([t]) => s.shell(r.thickness, f => f.when(({ element }) => element.isSame(t))));
      });
    }
  }
}

/** Les formes intermédiaires sont libérées (la mémoire WebAssembly n'est pas ramassée). */
function combine(ra: SolidRecipe, rb: SolidRecipe, report: RefReport[] | undefined, op: (a: Shape3D, b: Shape3D) => Shape3D): Shape3D {
  const a = build(ra, report), b = build(rb, report);
  try { return op(a, b); } finally { a.delete(); b.delete(); }
}
function derive(r: SolidRecipe, report: RefReport[] | undefined, op: (s: Shape3D) => Shape3D): Shape3D {
  const s = build(r, report);
  try { return op(s); } finally { s.delete(); }
}

type Found<T extends Edge | Face> = { report: RefReport; items: T[] };

/** Applique l'opération si chaque référence a exactement un élément ; sinon erreur (strict) ou saut (compte rendu). */
function applyResolved<T extends Edge | Face>(found: Found<T>[], report: RefReport[] | undefined, s: Shape3D, op: (targets: T[]) => Shape3D): Shape3D {
  try {
    report?.push(...found.map(f => f.report));
    if (found.some(f => f.report.status !== 'conservée')) {
      if (!report) throw new UnresolvedReferenceError(found.map(f => f.report));
      return s.clone();
    }
    return op(found.map(f => f.items[0]));
  } finally {
    for (const f of found) for (const i of f.items) i.delete();
  }
}

const tuple = (v: { toTuple(): Vec3; delete(): void }): Vec3 => { const t = v.toTuple(); v.delete(); return t; };

/** La face est-elle sur le support : même type de surface, et tout son bord (extrémités et milieux des arêtes) dedans ? */
function faceOnSupport(f: Face, s: Support): boolean {
  if (f.geomType !== surfaceTypeOf(s)) return false;
  const edges = f.edges;
  try {
    return edges.every(e => [tuple(e.startPoint), tuple(e.endPoint), tuple(e.pointAt(0.5))].every(p => pointOnSupport(s, p)));
  } finally { for (const e of edges) e.delete(); }
}

/** Faces du solide portées par le support d'une face nommée. */
function facesOf(shape: Shape3D, sup: Supports, ref: FaceRef): { faces: Face[] } | { reason: string } {
  const s = supportOf(sup, ref);
  if ('reason' in s) return s;
  const faces: Face[] = [];
  for (const f of shape.faces) { if (faceOnSupport(f, s.support)) faces.push(f); else f.delete(); }
  return { faces };
}

function indexIn<T extends Edge | Face>(list: T[], x: T): number {
  const i = list.findIndex(y => y.isSame(x));
  for (const y of list) y.delete();
  return i;
}

function resolveFace(shape: Shape3D, sup: Supports, ref: FaceRef): Found<Face> {
  const base = { op: 'coque' as const, ref: faceLabel(ref) };
  const r = facesOf(shape, sup, ref);
  if ('reason' in r) return { report: { ...base, status: 'à réparer', reason: r.reason, candidates: 0 }, items: [] };
  const n = r.faces.length;
  if (n !== 1) return { report: { ...base, status: 'à réparer', reason: n === 0 ? 'face disparue' : `face partagée en ${n} morceaux`, candidates: n }, items: r.faces };
  const f = r.faces[0];
  return { report: { ...base, status: 'conservée', candidates: 1, at: tuple(f.center), index: indexIn(shape.faces, f) }, items: r.faces };
}

/** Arêtes communes à une face candidate de chaque côté. */
function resolveEdge(shape: Shape3D, sup: Supports, ref: EdgeRef): Found<Edge> {
  const base = { op: 'congé' as const, ref: edgeLabel(ref) };
  const a = facesOf(shape, sup, ref.faces[0]), b = facesOf(shape, sup, ref.faces[1]);
  const fail = (reason: string, items: Edge[] = []): Found<Edge> => ({ report: { ...base, status: 'à réparer', reason, candidates: items.length }, items });
  try {
    if ('reason' in a) return fail(a.reason);
    if ('reason' in b) return fail(b.reason);
    if (!a.faces.length || !b.faces.length) return fail(`face disparue (${faceLabel(ref.faces[a.faces.length ? 1 : 0])})`);
    const bEdges = b.faces.flatMap(f => f.edges);
    const edges: Edge[] = [];
    for (const fa of a.faces) {
      for (const e of fa.edges) {
        if (bEdges.some(x => x.isSame(e)) && !edges.some(x => x.isSame(e))) edges.push(e); else e.delete();
      }
    }
    for (const e of bEdges) e.delete();
    if (edges.length !== 1) return fail(edges.length === 0 ? 'les deux faces ne se touchent plus' : `arête partagée en ${edges.length} morceaux`, edges);
    const e = edges[0];
    return { report: { ...base, status: 'conservée', candidates: 1, at: tuple(e.pointAt(0.5)), index: indexIn(shape.edges, e) }, items: edges };
  } finally {
    for (const r of [a, b]) if ('faces' in r) for (const f of r.faces) f.delete();
  }
}

/**
 * Cote du dessus du solide construit (pour désigner la face ouverte d'une coque), quelle que soit sa
 * recette. Sans face plane horizontale à cette cote (sommet courbe), la coque est refusée en clair.
 */
function topOf(s: Shape3D): number {
  const bb = s.boundingBox;
  const z = bb.bounds[1][2];
  bb.delete();
  const finder = new FaceFinder().inPlane('XY', z);
  const faces = finder.find(s);
  finder.delete();
  const n = faces.length;
  for (const f of faces) f.delete();
  if (!n) throw new Error('Coque : aucune face plane horizontale au sommet du solide à ouvrir.');
  return z;
}

function makeKernel(loadMs: number): Kernel {
  return {
    loadMs,
    volume: r => {
      const s = build(r);
      try { return measureVolume(s); } finally { s.delete(); }
    },
    mesh: (r, tolerance = 0.01) => {
      const s = build(r);
      try {
        const m = s.mesh({ tolerance, angularTolerance: 0.1 });
        return { vertices: Array.from(m.vertices), triangles: Array.from(m.triangles) };
      } finally { s.delete(); }
    },
    references: r => {
      const report: RefReport[] = [];
      build(r, report).delete();
      return report;
    },
  };
}
