// Noyau OCCT (lot 11.2, décision D1) : Open CASCADE compilé en WebAssembly (paquet
// replicad-opencascadejs, LGPL-2.1) piloté par replicad (MIT). Le module WebAssembly est un fichier
// séparé, chargé à la demande et remplaçable (décision de licence du maître d'ouvrage, feuille de
// route §7). Ce fichier n'est importé que par le Worker du noyau et par les tests.
import opencascade from 'replicad-opencascadejs';
import { draw, makeBaseBox, makeCylinder, measureVolume, setOC, type Shape3D } from 'replicad';
import type { MeshResult, SolidRecipe } from './recipe';

export interface Kernel {
  volume(recipe: SolidRecipe): number;
  mesh(recipe: SolidRecipe, tolerance?: number): MeshResult;
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

function build(r: SolidRecipe): Shape3D {
  switch (r.op) {
    case 'box': {
      // makeBaseBox est centré en X et Y, posé sur Z = 0 : replacé au coin demandé.
      const at = r.at ?? [0, 0, 0];
      return makeBaseBox(r.x, r.y, r.z).translate([at[0] + r.x / 2, at[1] + r.y / 2, at[2]]);
    }
    case 'cylinder': return makeCylinder(r.r, r.h, r.at ?? [0, 0, 0], r.dir ?? [0, 0, 1]);
    case 'extrude': return polygon(r.profile).sketchOnPlane('XY').extrude(r.height) as Shape3D;
    case 'revolve': return polygon(r.profile).sketchOnPlane('XZ').revolve([0, 0, 1], { angle: r.angle }) as Shape3D;
    case 'union': return combine(r.a, r.b, (a, b) => a.fuse(b));
    case 'cut': return combine(r.a, r.b, (a, b) => a.cut(b));
    case 'intersect': return combine(r.a, r.b, (a, b) => a.intersect(b));
    case 'fillet': return derive(r.of, s => s.fillet(r.r));
    case 'shell': return derive(r.of, s => s.shell(r.thickness, f => f.inPlane('XY', topOf(r.of))));
  }
}

/** Les formes intermédiaires sont libérées (la mémoire WebAssembly n'est pas ramassée). */
function combine(ra: SolidRecipe, rb: SolidRecipe, op: (a: Shape3D, b: Shape3D) => Shape3D): Shape3D {
  const a = build(ra), b = build(rb);
  try { return op(a, b); } finally { a.delete(); b.delete(); }
}
function derive(r: SolidRecipe, op: (s: Shape3D) => Shape3D): Shape3D {
  const s = build(r);
  try { return op(s); } finally { s.delete(); }
}

/** Cote du dessus d'une recette simple (pour désigner la face ouverte d'une coque). */
function topOf(r: SolidRecipe): number {
  switch (r.op) {
    case 'box': return (r.at?.[2] ?? 0) + r.z;
    case 'extrude': return r.height;
    case 'cylinder': return (r.at?.[2] ?? 0) + r.h;
    default: throw new Error('Coque : face du dessus indéterminée pour cette recette.');
  }
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
  };
}
