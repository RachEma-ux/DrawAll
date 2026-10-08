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

/** Sommets capturés (pour les signaler pendant l'étirement). */
export function capturedVertices(objects: CadObject[], w: Window): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const push = (x: number, y: number) => { if (inside(w, x, y)) out.push({ x, y }); };
  for (const o of objects) {
    switch (o.kind) {
      case 'line': case 'wall': case 'section': push(o.x1, o.y1); push(o.x2, o.y2); break;
      case 'polyline': case 'spline': case 'pdim': for (let i = 0; i + 1 < o.points.length; i += 2) push(o.points[i], o.points[i + 1]); break;
      case 'rect': push(o.x, o.y); push(o.x + o.w, o.y); push(o.x + o.w, o.y + o.h); push(o.x, o.y + o.h); break;
      case 'circle': case 'arc': case 'ellipse': push(o.cx, o.cy); break;
      default: if ('x' in o && 'y' in o && typeof o.x === 'number' && typeof o.y === 'number') push(o.x, o.y);
    }
  }
  return out;
}
