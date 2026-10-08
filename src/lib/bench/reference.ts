// Projet de référence du banc de mesure (lot 19.2, Concept §11) : déterministe et déclaré. Chaque
// niveau est une trame de `cells` × `cells` pièces de `pitch` mm d'axe en axe : murs de refend sur
// toutes les lignes de la trame, un poteau à chaque nœud, une porte par pièce (dans le mur du bas)
// et une pièce nommée au centre de chaque cellule. Fonctions pures.
import type { CadObject, Level } from '@/types/cad';

export interface ReferenceSpec {
  levels: number;
  cells: number;
  /** Entraxe de la trame (mm). */
  pitch: number;
}

/** Banc déclaré : 2 niveaux, trame de 10 × 10 pièces de 4 m. */
export const REFERENCE_SPEC: ReferenceSpec = { levels: 2, cells: 10, pitch: 4000 };

export interface ReferenceProject {
  objects: CadObject[];
  levels: Level[];
  /** Comptes par type d'objet (déclarés dans le rapport). */
  counts: Record<string, number>;
}

export function referenceProject(spec: ReferenceSpec = REFERENCE_SPEC): ReferenceProject {
  const { cells, pitch } = spec;
  const objects: CadObject[] = [];
  let n = 0;
  const id = () => `OBJ-${String(++n).padStart(4, '0')}`;
  const base = (levelId: string, classification: CadObject['classification']) => ({ layerId: 'LAY-0004', hatch: 'none' as const, createdSeq: 0, classification, levelId });
  const levels: Level[] = Array.from({ length: spec.levels }, (_, i) => ({ id: `NIV-${String(i + 1).padStart(4, '0')}`, name: i === 0 ? 'Rez-de-chaussée' : `Étage ${i}`, elevation: i * 3000 }));
  for (const l of levels) {
    const walls: string[][] = [];
    // Murs : une ligne de trame découpée en segments d'une cellule (jonctions en T et en croix).
    for (let k = 0; k <= cells; k++) {
      const row: string[] = [];
      for (let c = 0; c < cells; c++) {
        const h = id();
        row.push(h);
        objects.push({ ...base(l.id, 'architecture'), id: h, name: h, kind: 'wall', x1: c * pitch, y1: k * pitch, x2: (c + 1) * pitch, y2: k * pitch, thickness: 200, justification: 'axe' } as CadObject);
        const v = id();
        objects.push({ ...base(l.id, 'architecture'), id: v, name: v, kind: 'wall', x1: k * pitch, y1: c * pitch, x2: k * pitch, y2: (c + 1) * pitch, thickness: 200, justification: 'axe' } as CadObject);
      }
      walls.push(row);
    }
    for (let k = 0; k <= cells; k++) for (let c = 0; c <= cells; c++) {
      const p = id();
      objects.push({ ...base(l.id, 'structure'), id: p, name: p, kind: 'column', x: c * pitch, y: k * pitch, section: 'rect', b: 250, h: 250 } as CadObject);
    }
    for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
      const d = id();
      objects.push({ ...base(l.id, 'architecture'), id: d, name: d, kind: 'opening', hostId: walls[r][c], type: 'porte', position: pitch / 2, width: 900, hinge: 'debut', side: 'gauche', height: 2100 } as CadObject);
      const room = id();
      objects.push({ ...base(l.id, 'architecture'), id: room, name: `Pièce ${l.name} ${r + 1}.${c + 1}`, kind: 'room', x: c * pitch + pitch / 2, y: r * pitch + pitch / 2 } as CadObject);
    }
  }
  const counts: Record<string, number> = {};
  for (const o of objects) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  return { objects, levels, counts };
}
