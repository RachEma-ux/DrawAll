// Esquisse contrainte (lot 11.1, essai P0) : modèle neutre commun aux solveurs comparés.
// Points, segments (deux points) et cercles (centre, rayon) ; contraintes géométriques usuelles.
// Unités : millimètres, angles en degrés (repère modèle, Y vers le bas).

export interface SketchPoint { id: string; x: number; y: number; fixed?: boolean }
export interface SketchLine { id: string; p1: string; p2: string }
export interface SketchCircle { id: string; c: string; r: number }

export type Constraint =
  | { id: string; type: 'coincident'; a: string; b: string }
  | { id: string; type: 'horizontal' | 'vertical'; line: string }
  | { id: string; type: 'parallel' | 'perpendicular' | 'equal'; l1: string; l2: string }
  | { id: string; type: 'distance'; a: string; b: string; value: number }
  | { id: string; type: 'length'; line: string; value: number }
  | { id: string; type: 'radius'; circle: string; value: number }
  | { id: string; type: 'angle'; l1: string; l2: string; value: number }
  | { id: string; type: 'tangent'; line: string; circle: string }
  | { id: string; type: 'pointOnLine'; point: string; line: string }
  | { id: string; type: 'pointOnCircle'; point: string; circle: string };

export interface Sketch {
  points: SketchPoint[];
  lines: SketchLine[];
  circles: SketchCircle[];
  constraints: Constraint[];
}

/** Diagnostic d'un solveur sur une esquisse. */
export interface SolveReport {
  /** Toutes les contraintes satisfaites à la tolérance. */
  solved: boolean;
  /** Plus grand écart résiduel (mm, ou mm équivalent pour les angles). */
  residual: number;
  /** Degrés de liberté restants (0 : esquisse entièrement contrainte). */
  dof: number;
  /** Contraintes redondantes (n'ajoutent rien) et en conflit (empêchent la solution). */
  redundant: string[];
  conflicting: string[];
  iterations?: number;
  /** Esquisse résolue (positions et rayons mis à jour). */
  sketch: Sketch;
}

export const cloneSketch = (s: Sketch): Sketch => ({
  points: s.points.map(p => ({ ...p })), lines: s.lines.map(l => ({ ...l })), circles: s.circles.map(c => ({ ...c })), constraints: s.constraints.map(c => ({ ...c })),
});
