// Noyau OCCT (lot 11.2, décision D1) : Open CASCADE compilé en WebAssembly (paquet
// replicad-opencascadejs, LGPL-2.1) piloté par replicad (MIT). Le module WebAssembly est un fichier
// séparé, chargé à la demande et remplaçable (décision de licence du maître d'ouvrage, feuille de
// route §7). Ce fichier n'est importé que par le Worker du noyau et par les tests.
import opencascade from 'replicad-opencascadejs';
import { FaceFinder, ProjectionCamera, createAssembly, makeCompound, makePolygon, assembleWire, basicFaceExtrusion, cast, makeProjectedEdges, draw, genericSweep, getOC, iterTopo, loft, makeBSplineApproximation, makeBaseBox, makeCircle, makeCylinder, makeLine, makeVertex, measureDistanceBetween, makeThreePointArc, measureVolume, setOC, type Edge, type Face, type Shape3D } from 'replicad';
import { PROJ_CAMERAS, type Camera, type Clip, type EdgeRef, type FaceRef, type LoftSection, type MeshResult, type PathSeg, type ProjLines, type ProjView, type SolidRecipe, type SweepProfile, type Vec3 } from './recipe';
import { inventory, parseStepFile, type StepInventory } from './step-file';
import { cleanProjection } from './hlr-clean';
import { toAp242Ed3 } from './step-ap242';
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
  /**
   * Import d'un fichier STEP : solides transférés (en mm) et compte rendu des pertes (lot 11.4) ;
   * avec `withParts`, chaque solide est aussi rendu en recette réutilisable (lot 17.2).
   */
  importStep(text: string, withParts?: boolean): StepImportReport;
  /**
   * Plus grand écart (mm) entre les points donnés et le bord du solide (sa face la plus proche) :
   * contrôle qu'un lissage passe bien par ses sections (lot 15.4).
   */
  boundaryDeviation(recipe: SolidRecipe, points: Vec3[]): number;
  /** Vue projetée du solide, arêtes cachées séparées (lot 16.1). */
  project(recipe: SolidRecipe, view: ProjView): ProjLines;
  /** Export STEP AP242 éd. 3 de solides nommés (lot 17.2). */
  exportStep(parts: { name: string; recipe: SolidRecipe }[], fileName: string, date: Date): { content: string } | { error: string };
  /** Projection par une caméra quelconque, éventuellement après coupe (lot 16.2). */
  projectCamera(recipe: SolidRecipe, camera: Camera, clip?: Clip): ProjLines;
  /** Durée du chargement du module (ms). */
  loadMs: number;
}

export interface StepSolid { volume: number; valid: boolean; center: Vec3; size: Vec3; recipe?: Extract<SolidRecipe, { op: 'step' }> }

export interface StepImportReport {
  status: 'importé' | 'importé avec pertes' | 'échec';
  error?: string;
  /** Lecture du texte (produits, assemblage, unités, contenus non transférés) ; absente si illisible. */
  inventory?: StepInventory;
  roots: number;
  rootsTransferred: number;
  /** Solides transférés, en millimètres, placements d'assemblage appliqués. */
  solids: StepSolid[];
  totalVolume: number;
  /** Pertes signalées, en clair. */
  losses: string[];
  ms: number;
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
    case 'extrude': return polygon(r.profile).sketchOnPlane('XY', r.z ?? 0).extrude(r.height) as Shape3D;
    case 'revolve': return r.axis
      ? polygon(r.profile).sketchOnPlane('XY').revolve([r.axis.dir[0], r.axis.dir[1], 0], { origin: [r.axis.origin[0], r.axis.origin[1], 0], angle: r.angle }) as Shape3D
      : polygon(r.profile).sketchOnPlane('XZ').revolve([0, 0, 1], { angle: r.angle }) as Shape3D;
    case 'sweep': return sweep(r.profile, r.path, r.z ?? 0);
    case 'loft': return lofted(r.sections, r.ruled);
    case 'step': return readStepShape(r.data);
    case 'compound': {
      const parts = r.parts.map(p => build(p, report));
      try { return makeCompound(parts) as Shape3D; } finally { for (const p of parts) p.delete(); }
    }
    case 'polyhedron': {
      const faces = r.faces.map(f => makePolygon(f));
      try { return makeCompound(faces) as Shape3D; } finally { for (const f of faces) f.delete(); }
    }
    case 'pushpull': return derive(r.of, report, s => {
      const found = [resolveFace(s, featureSupports(r.of), r.face, 'pousser / tirer')];
      return applyResolved(found, report, s, ([f]) => {
        if (f.geomType !== 'PLANE') throw new Error('Pousser / tirer : face plane attendue.');
        const c = f.center, n = f.normalAt(c), v = n.multiply(r.distance);
        const prism = basicFaceExtrusion(f, v);
        try { return r.distance > 0 ? s.fuse(prism) : s.cut(prism); } finally { prism.delete(); v.delete(); n.delete(); c.delete(); }
      });
    });
    case 'translate': return derive(r.of, report, s => s.translate(r.by));
    case 'rotate': return derive(r.of, report, s => s.rotate(r.angle, [r.about[0], r.about[1], 0], [0, 0, 1]));
    case 'mirror': return derive(r.of, report, s => s.mirror(r.axis === 'x' ? 'YZ' : 'XZ', r.axis === 'x' ? [r.value, 0, 0] : [0, r.value, 0]));
    case 'scale': return derive(r.of, report, s => s.scale(r.factor, r.about));
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
      // Une ou plusieurs faces ouvertes désignées (lot 15.5) : toutes doivent être résolues.
      const opens = Array.isArray(open) ? open : [open];
      return derive(r.of, report, s => {
        const sup = featureSupports(r.of);
        const found = opens.map(o => resolveFace(s, sup, o));
        return applyResolved(found, report, s, ts => s.shell(r.thickness, f => f.when(({ element }) => ts.some(t => element.isSame(t)))));
      });
    }
  }
}

/** Arêtes d'un trajet du plan à la cote z. */
function pathEdges(path: PathSeg[], z: number): Edge[] {
  const P = (p: [number, number]): Vec3 => [p[0], p[1], z];
  return path.map(s => (s.kind === 'line' ? makeLine(P(s.from), P(s.to))
    : s.kind === 'arc' ? makeThreePointArc(P(s.from), P(s.via), P(s.to))
    : makeBSplineApproximation(s.points.map(P), { tolerance: 1e-3, smoothing: null, degMax: 5 })));
}

function sweep(profile: SweepProfile, path: PathSeg[], z: number): Shape3D {
  const edges = pathEdges(path, z);
  const spine = assembleWire(edges);
  const t = edges[0].tangentAt(0), o = edges[0].startPoint;
  const [tx, ty] = [t.x, t.y], l = Math.hypot(tx, ty);
  const n: Vec3 = [-ty / l, tx / l, 0], o3: Vec3 = [o.x, o.y, o.z];
  t.delete(); o.delete();
  const at = ([u, v]: [number, number]): Vec3 => [o3[0] + n[0] * u, o3[1] + n[1] * u, o3[2] + v];
  let sides: Edge[];
  if (Array.isArray(profile)) {
    const pts = profile.map(at);
    sides = pts.map((p, i) => makeLine(p, pts[(i + 1) % pts.length]));
  } else sides = [makeCircle(profile.r, at(profile.c), [tx / l, ty / l, 0])];
  const wire = assembleWire(sides);
  try {
    return genericSweep(wire, spine, { transitionMode: 'right' });
  } finally {
    for (const e of [...edges, ...sides]) e.delete();
    spine.delete(); wire.delete();
  }
}

function sectionWire(s: LoftSection) {
  if ('circle' in s) {
    const e = makeCircle(s.circle.r, [s.circle.cx, s.circle.cy, s.z], [0, 0, 1]);
    try { return assembleWire([e]); } finally { e.delete(); }
  }
  const pts = s.points.map((p): Vec3 => [p[0], p[1], s.z]);
  const sides = pts.map((p, i) => makeLine(p, pts[(i + 1) % pts.length]));
  try { return assembleWire(sides); } finally { for (const e of sides) e.delete(); }
}

function lofted(sections: LoftSection[], ruled: boolean): Shape3D {
  const wires = sections.map(sectionWire);
  try { return loft(wires, { ruled }); } finally { for (const w of wires) w.delete(); }
}

/** Arêtes vues et cachées d'une forme par une caméra (la forme est libérée). */
function projectWith(s: Shape3D, camera: Camera) {
  const cam = new ProjectionCamera([0, 0, 0], camera.dir, camera.xAxis);
  try {
    const { visible, hidden } = makeProjectedEdges(s, cam);
    // Droites : deux points ; courbes : 48 segments (arcs, cercles, courbes de contour).
    const lines = (edges: Edge[]) => edges.map(e => {
      const n = e.geomType === 'LINE' ? 1 : 48, pts: number[] = [];
      for (let i = 0; i <= n; i++) { const p = e.pointAt(i / n); pts.push(r9(p.x), r9(p.y)); p.delete(); }
      e.delete();
      return pts;
    });
    return cleanProjection({ visible: lines(visible), hidden: lines(hidden) });
  } finally { cam.delete(); s.delete(); }
}

/** Demi-espace gardé par une coupe, borné à l'encombrement de la forme (null si vide). */
function clipBox(s: Shape3D, clip: Clip): Shape3D | null {
  const bb = s.boundingBox;
  const [[x0, y0, z0], [x1, y1, z1]] = bb.bounds;
  bb.delete();
  const m = 1;
  let poly: [number, number][] = [[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m]];
  // Sutherland-Hodgman sur le demi-plan dot(p − point, look) ≥ 0.
  const f = (p: [number, number]) => (p[0] - clip.point[0]) * clip.look[0] + (p[1] - clip.point[1]) * clip.look[1];
  const out: [number, number][] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  });
  poly = out;
  if (poly.length < 3) return null;
  return polygon(poly).sketchOnPlane('XY', z0 - m).extrude(z1 - z0 + 2 * m) as Shape3D;
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

function resolveFace(shape: Shape3D, sup: Supports, ref: FaceRef, op: RefReport['op'] = 'coque'): Found<Face> {
  const base = { op, ref: faceLabel(ref) };
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
    importStep: (text, withParts) => importStep(text, withParts),
    exportStep: (parts, fileName, date) => {
      const shapes = parts.map(p => ({ name: p.name, shape: build(p.recipe) }));
      try { return toAp242Ed3(writeStep(shapes), fileName, date); } finally { for (const s of shapes) s.shape.delete(); }
    },
    project: (r, view) => projectWith(build(r), PROJ_CAMERAS[view]),
    projectCamera: (r, camera, clip) => {
      const s = build(r);
      if (!clip) return projectWith(s, camera);
      const box = clipBox(s, clip);
      if (!box) { s.delete(); throw new Error('Coupe : le plan ne traverse pas le bâtiment.'); }
      try { return projectWith(s.intersect(box), camera); } finally { s.delete(); box.delete(); }
    },
    boundaryDeviation: (r, points) => {
      const s = build(r);
      const faces = s.faces;
      try {
        let worst = 0;
        for (const p of points) {
          const v = makeVertex(p);
          let best = Infinity;
          for (const f of faces) best = Math.min(best, measureDistanceBetween(f, v));
          v.delete();
          worst = Math.max(worst, best);
        }
        return worst;
      } finally { for (const f of faces) f.delete(); s.delete(); }
    },
    references: r => {
      const report: RefReport[] = [];
      build(r, report).delete();
      return report;
    },
  };
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const r9 = (v: number) => { const x = Math.round(v * 1e9) / 1e9; return x === 0 ? 0 : x; };

/** Lit un fichier STEP par le noyau ; la lecture du texte complète ce que le noyau ne rend pas. */
/** Écrit des solides nommés en STEP AP242 (en-tête du noyau, édition 1 ; réécrit ensuite). */
function writeStep(parts: { name: string; shape: Shape3D }[]): string {
  const oc = getOC();
  const doc = createAssembly(parts as never);
  const session = new oc.XSControl_WorkSession();
  const writer = new oc.STEPCAFControl_Writer(session, false);
  const progress = new oc.Message_ProgressRange();
  const file = `export-${Math.random().toString(36).slice(2)}.step`;
  try {
    writer.SetNameMode(true);
    // Ni couleurs ni calques : DrawAll n'en attribue pas aux solides (rien d'écrit qui ne soit relu).
    writer.SetColorMode(false);
    writer.SetLayerMode(false);
    oc.Interface_Static.SetIVal('write.step.schema', 5);
    oc.Interface_Static.SetCVal('write.step.unit', 'MM');
    oc.Interface_Static.SetIVal('write.step.assembly', 2);
    if (!writer.Perform(doc.wrapped, file, progress)) throw new Error('Export STEP refusé par le noyau.');
    return oc.FS.readFile(`/${file}`, { encoding: 'utf8' }) as string;
  } finally {
    try { oc.FS.unlink(`/${file}`); } catch { /* fichier non écrit */ }
    progress.delete(); writer.delete(); session.delete(); doc.delete();
  }
}

const stepCache = new Map<string, Shape3D>();
/** Forme d'un fichier STEP d'un seul solide (mise en cache : la recette est relue à chaque calcul). */
function readStepShape(data: string): Shape3D {
  let s = stepCache.get(data);
  if (!s) {
    const oc = getOC();
    const file = `recette-${Math.random().toString(36).slice(2)}.step`;
    oc.FS.writeFile(`/${file}`, new TextEncoder().encode(data));
    const reader = new oc.STEPControl_Reader();
    try {
      if (reader.ReadFile(file) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) throw new Error('Solide STEP illisible.');
      reader.TransferRoots(new oc.Message_ProgressRange());
      s = cast(reader.OneShape()) as Shape3D;
    } finally { reader.delete(); oc.FS.unlink(`/${file}`); }
    stepCache.set(data, s);
  }
  return s.clone() as Shape3D;
}

function importStep(text: string, withParts = false): StepImportReport {
  const t0 = performance.now();
  const losses: string[] = [];
  let inv: StepInventory | undefined, parseError: string | undefined;
  try { inv = inventory(parseStepFile(text)); } catch (e) { parseError = e instanceof Error ? e.message : String(e); }
  const oc = getOC();
  const file = `import-${Math.random().toString(36).slice(2)}.step`;
  oc.FS.writeFile(`/${file}`, new TextEncoder().encode(text));
  const reader = new oc.STEPControl_Reader();
  const solids: StepSolid[] = [];
  let roots = 0, rootsTransferred = 0;
  const done = (status: StepImportReport['status'], error?: string): StepImportReport => ({
    status, ...(error ? { error } : {}), ...(inv ? { inventory: inv } : {}), roots, rootsTransferred, solids,
    totalVolume: r6(solids.reduce((s, x) => s + x.volume, 0)), losses, ms: Math.round((performance.now() - t0) * 10) / 10,
  });
  try {
    const status = reader.ReadFile(file);
    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) return done('échec', parseError ?? `lecture refusée par le noyau (${String(status)})`);
    if (parseError) losses.push(`structure du fichier illisible : ${parseError}`);
    roots = reader.NbRootsForTransfer();
    for (let i = 1; i <= roots; i++) {
      const progress = new oc.Message_ProgressRange();
      if (reader.TransferRoot(i, progress)) rootsTransferred++;
      progress.delete();
    }
    if (reader.NbShapes() > 0) {
      const shape = reader.OneShape();
      for (const s of iterTopo(shape, 'solid')) {
        const solid = cast(s) as Shape3D;
        const check = new oc.BRepCheck_Analyzer(s, true, false, false);
        const bb = solid.boundingBox;
        const entry: StepSolid = { volume: r6(measureVolume(solid)), valid: check.IsValid(), center: bb.center.map(r6) as Vec3, size: [r6(bb.width), r6(bb.height), r6(bb.depth)] };
        if (withParts) {
          // Recette réutilisable : le solide seul, réécrit en AP242, son encombrement et sa trace de dessus.
          const name = `Solide importé ${solids.length + 1}`;
          const one = toAp242Ed3(writeStep([{ name, shape: solid }]), `${name}.step`, new Date(0));
          if ('content' in one) {
            const top = projectWith(solid.clone() as Shape3D, PROJ_CAMERAS.dessus);
            const [[x0, y0, z0], [x1, y1, z1]] = bb.bounds;
            entry.recipe = { op: 'step', data: one.content, name, bounds: { min: [x0, y0, z0], max: [x1, y1, z1] }, trace: top.visible };
          }
        }
        solids.push(entry);
        check.delete(); bb.delete(); solid.delete();
      }
      shape.delete();
    }
  } finally {
    reader.delete();
    oc.FS.unlink(`/${file}`);
  }
  if (rootsTransferred < roots) losses.push(`${roots - rootsTransferred} racine(s) sur ${roots} non transférée(s)`);
  if (inv) {
    for (const [cat, n] of Object.entries(inv.notTransferred)) losses.push(`${cat} : ${n} entité(s) non importée(s)`);
    if (inv.danglingRefs.length) {
      const d = inv.danglingRefs[0];
      losses.push(`${inv.danglingRefs.length} référence(s) vers des entités absentes du fichier (ex. #${d.to}, citée par #${d.from})`);
    }
    if (solids.length < inv.leafOccurrences) losses.push(`${inv.leafOccurrences - solids.length} occurrence(s) de pièce sur ${inv.leafOccurrences} sans solide transféré`);
  }
  const invalid = solids.filter(s => !s.valid).length;
  if (invalid) losses.push(`${invalid} solide(s) invalide(s) au contrôle du noyau`);
  if (!solids.length) return done('échec', 'aucun solide transféré');
  return done(losses.length ? 'importé avec pertes' : 'importé');
}
