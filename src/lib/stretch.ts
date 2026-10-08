// Étirer (lot 10.3) : les sommets compris dans une fenêtre de capture se déplacent d'un vecteur,
// les autres restent. Fonctions pures ; repère modèle (Y vers le bas).
import type { CadObject } from '@/types/cad';
import { moveObject } from '@/lib/geometry';

export interface Window { minX: number; minY: number; maxX: number; maxY: number }

export const windowOf = (a: { x: number; y: number }, b: { x: number; y: number }): Window =>
  ({ minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) });

const inside = (w: Window, x: number, y: number) => x >= w.minX && x <= w.maxX && y >= w.minY && y <= w.maxY;

/** Déplace les couples (x, y) intérieurs ; null si aucun n'est capturé. */
function stretchPoints(points: number[], w: Window, dx: number, dy: number): number[] | null {
  let hit = false;
  const out = points.slice();
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (inside(w, points[i], points[i + 1])) { out[i] += dx; out[i + 1] += dy; hit = true; }
  }
  return hit ? out : null;
}

/**
 * Modification d'un objet par l'étirement, ou null s'il n'est pas touché.
 * - Ligne, mur, repère de coupe : extrémités capturées déplacées.
 * - Polyligne, spline, cote par points : sommets (points de contrôle) capturés déplacés.
 * - Rectangle (reste aligné sur les axes) : un côté dont les deux coins sont capturés se déplace
 *   selon sa normale ; un coin capturé seul entraîne ses deux côtés (comme une poignée de coin).
 * - Cercle, arc, ellipse : déplacés entiers si leur centre est capturé.
 * - Objets ponctuels (texte, bloc, symboles, pièce, note libre) : déplacés si leur point l'est.
 * - Objets associés (cote, ouverture, vues, coupe) : ils suivent leur objet hôte, rien à faire ici.
 */
export function stretchObject(o: CadObject, w: Window, dx: number, dy: number): Partial<CadObject> | null {
  switch (o.kind) {
    case 'line':
    case 'wall':
    case 'section': {
      const p = stretchPoints([o.x1, o.y1, o.x2, o.y2], w, dx, dy);
      return p && { x1: p[0], y1: p[1], x2: p[2], y2: p[3] };
    }
    case 'polyline':
    case 'slab':
    case 'spline':
    case 'pdim': {
      const p = stretchPoints(o.points, w, dx, dy);
      return p && { points: p };
    }
    case 'rect': {
      const x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      const c = { tl: inside(w, x0, y0), tr: inside(w, x1, y0), br: inside(w, x1, y1), bl: inside(w, x0, y1) };
      const n = Object.values(c).filter(Boolean).length;
      if (n === 0) return null;
      if (n === 4) return { x: x0 + dx, y: y0 + dy };
      let left = c.tl && c.bl, right = c.tr && c.br, top = c.tl && c.tr, bottom = c.bl && c.br;
      if (!left && !right && !top && !bottom) {
        // Un coin seul (ou deux coins opposés) : chaque coin capturé entraîne ses deux côtés.
        if (c.tl) { left = true; top = true; }
        if (c.tr) { right = true; top = true; }
        if (c.br) { right = true; bottom = true; }
        if (c.bl) { left = true; bottom = true; }
      }
      const nx0 = x0 + (left ? dx : 0), nx1 = x1 + (right ? dx : 0), ny0 = y0 + (top ? dy : 0), ny1 = y1 + (bottom ? dy : 0);
      if (Math.abs(nx1 - nx0) < 1e-9 || Math.abs(ny1 - ny0) < 1e-9) return null; // rectangle aplati : refusé
      return { x: Math.min(nx0, nx1), y: Math.min(ny0, ny1), w: Math.abs(nx1 - nx0), h: Math.abs(ny1 - ny0) };
    }
    case 'circle':
    case 'arc':
    case 'ellipse':
      return inside(w, o.cx, o.cy) ? { cx: o.cx + dx, cy: o.cy + dy } : null;
    case 'text':
    case 'blockRef':
    case 'north':
    case 'roughness':
    case 'levelMark':
    case 'bom':
    case 'balloon':
    case 'room':
      return inside(w, o.x, o.y) ? moveObject(o, dx, dy) : null;
    case 'note':
      return !o.targetId && inside(w, o.x, o.y) ? moveObject(o, dx, dy) : null;
    case 'underlay':
      return !o.locked && inside(w, o.x, o.y) && inside(w, o.x + o.w, o.y + o.h) ? moveObject(o, dx, dy) : null;
    case 'dimension':
    case 'opening':
    case 'views':
    case 'cut':
      return null;
  }
}

/** Modifications de tous les objets touchés (ordre conservé). */
export function stretchAll(objects: CadObject[], w: Window, dx: number, dy: number): { id: string; patch: Partial<CadObject> }[] {
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return [];
  return objects.flatMap(o => { const patch = stretchObject(o, w, dx, dy); return patch ? [{ id: o.id, patch }] : []; });
}

/** Sommets d'un objet dans un ordre stable (coins du rectangle : haut gauche, haut droit, bas droit, bas gauche). */
function vertices(o: CadObject): { x: number; y: number }[] {
  switch (o.kind) {
    case 'line': case 'wall': case 'section': return [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }];
    case 'polyline': case 'slab': case 'spline': case 'pdim': {
      const out: { x: number; y: number }[] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) out.push({ x: o.points[i], y: o.points[i + 1] });
      return out;
    }
    case 'rect': return [{ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }];
    case 'circle': case 'arc': case 'ellipse': return [{ x: o.cx, y: o.cy }];
    default: return 'x' in o && 'y' in o && typeof o.x === 'number' && typeof o.y === 'number' ? [{ x: o.x, y: o.y }] : [];
  }
}

/** Sommets capturés (pour les signaler pendant l'étirement). */
export function capturedVertices(objects: CadObject[], w: Window): { x: number; y: number }[] {
  return objects.flatMap(o => vertices(o).filter(p => inside(w, p.x, p.y)));
}

/**
 * Aperçu : position que prendra chaque sommet capturé, calculée par l'étirement lui-même (un côté
 * de rectangle ne garde que la composante normale du déplacement). Un objet que l'étirement
 * refuse (rectangle aplati) garde ses sommets en place.
 */
export function stretchPreview(objects: CadObject[], w: Window, dx: number, dy: number): { x: number; y: number }[] {
  return objects.flatMap(o => {
    const before = vertices(o);
    const caught = before.map(p => inside(w, p.x, p.y));
    if (!caught.some(Boolean)) return [];
    const patch = dx === 0 && dy === 0 ? null : stretchObject(o, w, dx, dy);
    if (!patch) return before.filter((_, i) => caught[i]);
    const after = vertices({ ...o, ...patch } as CadObject);
    // Rectangle retourné : ses coins sont réordonnés ; on associe chaque sommet capturé au plus proche déplacé.
    return before.flatMap((p, i) => {
      if (!caught[i]) return [];
      if (o.kind !== 'rect') return [after[i] ?? p];
      const target = { x: p.x + dx, y: p.y + dy };
      return [after.reduce((best, q) => (Math.hypot(q.x - target.x, q.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y) ? q : best), after[0])];
    });
  });
}
