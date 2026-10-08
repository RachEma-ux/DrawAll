// Dalles et planchers (lot 13.1) : surface et volume d'un contour fermé, contour repris d'une pièce.
// Fonctions pures ; repère modèle en millimètres.

/** Aire du contour (mm², formule du lacet, sens de parcours indifférent). */
export function polygonArea(points: number[]): number {
  let s = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += points[2 * i] * points[2 * j + 1] - points[2 * j] * points[2 * i + 1];
  }
  return Math.abs(s) / 2;
}

/** Surface (m²) et volume (m³) d'une dalle. */
export function slabQuantities(o: { points: number[]; thickness: number }): { areaM2: number; volumeM3: number } {
  const a = polygonArea(o.points);
  return { areaM2: a / 1e6, volumeM3: (a * o.thickness) / 1e9 };
}

/**
 * Contour de dalle valide : au moins trois sommets distincts, aire non nulle ; le dernier point est
 * retiré s'il répète le premier (contour tracé jusqu'au point de départ).
 */
export function slabContour(points: number[]): number[] | null {
  const pts = points.slice();
  const n = pts.length / 2;
  if (n >= 2 && Math.hypot(pts[0] - pts[2 * n - 2], pts[1] - pts[2 * n - 1]) < 1e-6) pts.splice(-2, 2);
  return pts.length >= 6 && polygonArea(pts) > 1e-6 ? pts : null;
}

/** Représentation 2D d'une dalle : polyligne fermée (tracé, hachure, export DXF et PDF). */
export function slabAsPolyline<T extends { points: number[] }>(o: T): Omit<T, 'kind'> & { kind: 'polyline' } {
  return { ...o, kind: 'polyline', points: [...o.points, o.points[0], o.points[1]] };
}

/** Le point est-il à l'intérieur du polygone (règle pair-impair) ? */
export function pointInPolygon(poly: { x: number; y: number }[], p: { x: number; y: number }): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
  }
  return inside;
}
