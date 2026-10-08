// Contrat du noyau 3D (lot 11.2, essai P0) : un solide est décrit par une recette sérialisable
// (données seules), évaluée par le noyau hors du fil principal. Unités : millimètres, degrés.
// Repère 3D : X, Y du plan, Z vers le haut.

export type Vec3 = [number, number, number];

/**
 * Référence topologique (lot 11.3) : une face est désignée par la fonction qui l'engendre (`feature`,
 * le `name` d'une primitive) et par son rôle dans cette fonction, jamais par son rang dans le
 * solide. Rôles : pavé `xmin` `xmax` `ymin` `ymax` `zmin` `zmax` ; cylindre `wall` `base` `cap` ;
 * extrusion `bottom` `top` `side:<identifiant du segment>`.
 */
export interface FaceRef { feature: string; role: string }
/** Arête désignée par les deux faces qu'elle sépare. */
export interface EdgeRef { faces: [FaceRef, FaceRef] }

/**
 * Segment d'un trajet du plan (lot 15.3) : droite, arc par trois points, courbe lisse (B-spline
 * approchée à 10⁻³ mm près par ses points, dans l'ordre).
 */
export type PathSeg =
  | { kind: 'line'; from: [number, number]; to: [number, number] }
  | { kind: 'arc'; from: [number, number]; via: [number, number]; to: [number, number] }
  | { kind: 'curve'; points: [number, number][] };

/** Profil d'un balayage, dans son repère (u, v) : polygone fermé, ou cercle de rayon r centré en c. */
export type SweepProfile = [number, number][] | { r: number; c: [number, number] };

/** Section d'un lissage : polygone fermé du plan ou cercle, à la cote z. */
export type LoftSection = { z: number } & ({ points: [number, number][] } | { circle: { cx: number; cy: number; r: number } });

export type SolidRecipe =
  /** Pavé de dimensions x, y, z, coin minimal en `at` (origine par défaut). */
  | { op: 'box'; x: number; y: number; z: number; at?: Vec3; name?: string }
  /** Cylindre de rayon r, hauteur h, base centrée en `at`, axe `dir` (Z par défaut). */
  | { op: 'cylinder'; r: number; h: number; at?: Vec3; dir?: Vec3; name?: string }
  /**
   * Contour fermé du plan XY (sommets) extrudé de `height` selon Z. `segmentIds[i]` nomme le
   * segment du sommet i au suivant (par défaut `s<i>`) : il suit le segment si l'on insère,
   * retire ou fait tourner des sommets ailleurs dans le contour. `z` : cote de la base (0 par défaut).
   */
  | { op: 'extrude'; profile: [number, number][]; height: number; name?: string; segmentIds?: string[]; z?: number }
  /**
   * Contour fermé tourné de `angle` degrés. Sans `axis` : contour du plan XZ (x ≥ 0 : rayon, z :
   * hauteur) autour de l'axe Z. Avec `axis` (lot 15.2) : contour du plan XY tourné autour de la droite
   * du plan XY passant par `origin`, de direction `dir`.
   */
  | { op: 'revolve'; profile: [number, number][]; angle: number; axis?: { origin: [number, number]; dir: [number, number] } }
  /**
   * Balayage (lot 15.3) : profil fermé (u, v) mené le long d'un trajet du plan posé à la cote `z`.
   * Au départ du trajet, le profil est dans le plan vertical perpendiculaire : u le long de
   * (−t_y, t_x) (t : tangente de départ), v vers le haut. Angles vifs aux sommets du trajet.
   */
  | { op: 'sweep'; profile: SweepProfile; path: PathSeg[]; z?: number; name?: string }
  /**
   * Lissage (lot 15.4) : solide passant par des sections horizontales (contour du plan à la cote z),
   * dans l'ordre ; surfaces réglées (droites d'une section à la suivante) ou lisses.
   */
  | { op: 'loft'; sections: LoftSection[]; ruled: boolean }
  /**
   * Pousser / tirer (lot 15.6) : la face plane désignée avance de `distance` mm selon sa normale
   * sortante (positif : matière ajoutée ; négatif : matière retirée).
   */
  | { op: 'pushpull'; of: SolidRecipe; face: FaceRef; distance: number }
  /** Déplacement (lot 15.2). */
  | { op: 'translate'; of: SolidRecipe; by: Vec3 }
  /** Rotation de `angle` degrés autour de la verticale passant par `about` (lot 15.2). */
  | { op: 'rotate'; of: SolidRecipe; angle: number; about: [number, number] }
  /** Symétrie par le plan vertical x = value (axe 'x') ou y = value (axe 'y') (lot 15.2). */
  | { op: 'mirror'; of: SolidRecipe; axis: 'x' | 'y'; value: number }
  /** Homothétie de rapport `factor` (> 0) et de centre `about` (lot 15.2). */
  | { op: 'scale'; of: SolidRecipe; factor: number; about: Vec3 }
  | { op: 'union' | 'cut' | 'intersect'; a: SolidRecipe; b: SolidRecipe }
  /** Congé de rayon r sur les arêtes désignées (`edges`), sinon sur toutes. */
  | { op: 'fillet'; of: SolidRecipe; r: number; edges?: EdgeRef[] }
  /** Coque : évidement d'épaisseur `thickness`, face(s) `open` ouverte(s) (par défaut celle du dessus, Z max). */
  | { op: 'shell'; of: SolidRecipe; thickness: number; open?: FaceRef | FaceRef[] };

export interface MeshResult { vertices: number[]; triangles: number[] }

/**
 * Vue projetée (lot 16.1) : dessus (regard vers −Z), face (depuis +Y, vers le nord du plan) ou côté
 * (depuis +X). Coordonnées 2D dans le sens du plan (Y vers le bas à l'écran) : dessus (X, Y) ;
 * face (X, −Z) ; côté (−Y, −Z).
 */
export type ProjView = 'dessus' | 'face' | 'cote';
/** Arêtes vues et cachées, en polylignes (x, y alternés). */
export interface ProjLines { visible: number[][]; hidden: number[][] }
export const PROJ_CAMERAS: Record<ProjView, { dir: Vec3; xAxis: Vec3 }> = {
  dessus: { dir: [0, 0, 1], xAxis: [1, 0, 0] },
  face: { dir: [0, 1, 0], xAxis: [1, 0, 0] },
  cote: { dir: [1, 0, 0], xAxis: [0, -1, 0] },
};

/** Volume d'un maillage fermé (théorème de la divergence) : contrôle indépendant du noyau. */
export function meshVolume(m: MeshResult): number {
  let v = 0;
  const p = (i: number) => [m.vertices[3 * i], m.vertices[3 * i + 1], m.vertices[3 * i + 2]];
  for (let t = 0; t + 2 < m.triangles.length; t += 3) {
    const [a, b, c] = [p(m.triangles[t]), p(m.triangles[t + 1]), p(m.triangles[t + 2])];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
}
