// Adaptateur du solveur planegcs (FreeCAD, WebAssembly, LGPL) — candidat B de l'essai P0 (lot 11.1).
// Utilisé seulement par l'essai : il n'entre pas dans l'application livrée tant que la note de
// décision P0 (lot 11.5) ne l'a pas retenu (licence comprise).
import { Algorithm, GcsWrapper, init_planegcs_module, SolveStatus } from '@salusoft89/planegcs';
import { cloneSketch, type Sketch, type SolveReport } from './sketch';

type Prim = Record<string, unknown> & { id: string; type: string };

/** Primitives planegcs de l'esquisse : identifiants préfixés par leur nature (ordre imposé : géométrie d'abord). */
function primitives(s: Sketch): Prim[] {
  const out: Prim[] = [];
  for (const p of s.points) out.push({ id: `p:${p.id}`, type: 'point', x: p.x, y: p.y, fixed: !!p.fixed });
  for (const l of s.lines) out.push({ id: `l:${l.id}`, type: 'line', p1_id: `p:${l.p1}`, p2_id: `p:${l.p2}` });
  for (const c of s.circles) out.push({ id: `c:${c.id}`, type: 'circle', c_id: `p:${c.c}`, radius: c.r });
  for (const k of s.constraints) {
    const id = `k:${k.id}`;
    switch (k.type) {
      case 'coincident': out.push({ id, type: 'p2p_coincident', p1_id: `p:${k.a}`, p2_id: `p:${k.b}` }); break;
      case 'horizontal': out.push({ id, type: 'horizontal_l', l_id: `l:${k.line}` }); break;
      case 'vertical': out.push({ id, type: 'vertical_l', l_id: `l:${k.line}` }); break;
      case 'parallel': out.push({ id, type: 'parallel', l1_id: `l:${k.l1}`, l2_id: `l:${k.l2}` }); break;
      case 'perpendicular': out.push({ id, type: 'perpendicular_ll', l1_id: `l:${k.l1}`, l2_id: `l:${k.l2}` }); break;
      case 'equal': out.push({ id, type: 'equal_length', l1_id: `l:${k.l1}`, l2_id: `l:${k.l2}` }); break;
      case 'distance': out.push({ id, type: 'p2p_distance', p1_id: `p:${k.a}`, p2_id: `p:${k.b}`, distance: k.value }); break;
      case 'length': {
        const l = s.lines.find(q => q.id === k.line)!;
        out.push({ id, type: 'p2p_distance', p1_id: `p:${l.p1}`, p2_id: `p:${l.p2}`, distance: k.value });
        break;
      }
      case 'radius': out.push({ id, type: 'circle_radius', c_id: `c:${k.circle}`, radius: k.value }); break;
      // planegcs : angle en radians, sens trigonométrique du repère Y vers le haut ; le modèle a Y vers le bas.
      case 'angle': out.push({ id, type: 'l2l_angle_ll', l1_id: `l:${k.l1}`, l2_id: `l:${k.l2}`, angle: (k.value * Math.PI) / 180 }); break;
      case 'tangent': out.push({ id, type: 'tangent_lc', l_id: `l:${k.line}`, c_id: `c:${k.circle}` }); break;
      case 'pointOnLine': out.push({ id, type: 'point_on_line_pl', p_id: `p:${k.point}`, l_id: `l:${k.line}` }); break;
      case 'pointOnCircle': out.push({ id, type: 'point_on_circle', p_id: `p:${k.point}`, c_id: `c:${k.circle}` }); break;
    }
  }
  return out;
}

export async function createPlanegcs() {
  const mod = await init_planegcs_module();
  return {
    /** Réglages : algorithme (DogLeg par défaut, celui de FreeCAD) et nombre maximal d'itérations (100 par défaut). */
    solve(input: Sketch, options: { algorithm?: 'DogLeg' | 'LevenbergMarquardt' | 'BFGS'; maxIterations?: number } = {}): SolveReport {
      const gcs = new GcsWrapper(new mod.GcsSystem());
      try {
        gcs.push_primitives_and_params(primitives(input) as never);
        if (options.maxIterations) gcs.set_max_iterations(options.maxIterations);
        const status = gcs.solve(Algorithm[options.algorithm ?? 'DogLeg']);
        gcs.apply_solution();
        const prims = gcs.sketch_index.get_primitives() as unknown as Prim[];
        const out = cloneSketch(input);
        for (const p of out.points) { const q = prims.find(o => o.id === `p:${p.id}`); if (q) { p.x = q.x as number; p.y = q.y as number; } }
        for (const c of out.circles) { const q = prims.find(o => o.id === `c:${c.id}`); if (q) c.r = q.radius as number; }
        const strip = (ids: string[]) => ids.map(id => String(id).replace(/^k:/, ''));
        return {
          solved: status === SolveStatus.Success || status === SolveStatus.Converged,
          residual: Number.NaN, // planegcs ne publie pas l'écart : mesuré par l'essai sur l'esquisse rendue
          dof: gcs.gcs.dof(),
          redundant: strip(gcs.get_gcs_redundant_constraints()),
          conflicting: strip(gcs.get_gcs_conflicting_constraints()),
          sketch: out,
        };
      } finally {
        gcs.destroy_gcs_module();
      }
    },
  };
}
