// Contrat du noyau 3D (lot 11.2, essai P0) : un solide est décrit par une recette sérialisable
// (données seules), évaluée par le noyau hors du fil principal. Unités : millimètres, degrés.
// Repère 3D : X, Y du plan, Z vers le haut.

export type Vec3 = [number, number, number];

export type SolidRecipe =
  /** Pavé de dimensions x, y, z, coin minimal en `at` (origine par défaut). */
  | { op: 'box'; x: number; y: number; z: number; at?: Vec3 }
  /** Cylindre de rayon r, hauteur h, base centrée en `at`, axe `dir` (Z par défaut). */
  | { op: 'cylinder'; r: number; h: number; at?: Vec3; dir?: Vec3 }
  /** Contour fermé du plan XY (sommets) extrudé de `height` selon Z. */
  | { op: 'extrude'; profile: [number, number][]; height: number }
  /** Contour fermé du plan XZ (x ≥ 0 : rayon, z : hauteur) tourné autour de l'axe Z. */
  | { op: 'revolve'; profile: [number, number][]; angle: number }
  | { op: 'union' | 'cut' | 'intersect'; a: SolidRecipe; b: SolidRecipe }
  /** Congé de rayon r sur toutes les arêtes. */
  | { op: 'fillet'; of: SolidRecipe; r: number }
  /** Coque : évidement d'épaisseur `thickness`, face du dessus (Z max) ouverte. */
  | { op: 'shell'; of: SolidRecipe; thickness: number };

export interface MeshResult { vertices: number[]; triangles: number[] }

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
