// Nomenclature (lot 5.4) : repères et tableau des pièces (ISO 7573 pour le tableau, ISO 6433 pour les
// repères), calculés à partir des objets. Une pièce est une occurrence de bloc ou un objet qui porte une
// désignation (`part`) ; les pièces de même désignation et de même matériau forment une ligne, dont la
// quantité est le nombre d'occurrences. Les repères sont numérotés dans l'ordre d'apparition des
// lignes : ajouter une pièce n'en renumérote aucune. Taille fixe sur le papier, comme les symboles.
import type { BalloonObj, BlockDef, BomObj, CadObject } from '@/types/cad';
import { materialById } from '@/lib/materials';
import { objectBounds } from '@/lib/geometry';
import { isSymbol, symbolGeometry, type Pt, type SymbolGeometry, type SymbolObject } from '@/lib/symbols';

export interface BomRow { item: number; designation: string; material: string; quantity: number; ids: string[] }

/** Désignation d'une pièce, ou null si l'objet n'en est pas une. */
export function partDesignation(o: CadObject, blocks: BlockDef[]): string | null {
  if (o.part?.trim()) return o.part.trim();
  if (o.kind === 'blockRef') return blocks.find(b => b.id === o.blockId)?.name ?? null;
  return null;
}

const idNumber = (id: string) => Number(id.match(/(\d+)$/)?.[1] ?? 0);

/** Lignes de la nomenclature, dans l'ordre d'apparition des pièces (création, puis identifiant). */
export function bomRows(objects: CadObject[], blocks: BlockDef[]): BomRow[] {
  const parts = objects
    .map(o => ({ o, designation: partDesignation(o, blocks) }))
    .filter((p): p is { o: CadObject; designation: string } => !!p.designation)
    .sort((a, b) => a.o.createdSeq - b.o.createdSeq || idNumber(a.o.id) - idNumber(b.o.id));
  const rows: BomRow[] = [];
  for (const { o, designation } of parts) {
    const material = materialById(o.materialId)?.name ?? '—';
    const row = rows.find(r => r.designation === designation && r.material === material);
    if (row) { row.quantity++; row.ids.push(o.id); }
    else rows.push({ item: rows.length + 1, designation, material, quantity: 1, ids: [o.id] });
  }
  return rows;
}

/** Repère (numéro de ligne) d'une pièce, ou null. */
export const itemOf = (rows: BomRow[], id: string) => rows.find(r => r.ids.includes(id))?.item ?? null;

/** Dimensions papier du tableau et des repères (mm papier). */
export const BOM_PAPER = { cols: [14, 60, 40, 14], row: 7, text: 3.5, pad: 1.5, balloon: 5, dot: 0.75 } as const;
export const BOM_HEADER = ['Rep.', 'Désignation', 'Matériau', 'Qté'];

/** Tableau de nomenclature, coin supérieur gauche en (x, y), `u` mm du modèle par mm papier. */
export function bomGeometry(o: Pick<BomObj, 'x' | 'y'>, rows: BomRow[], u: number): SymbolGeometry {
  const g: SymbolGeometry = { lines: [], fills: [], circles: [], texts: [] };
  const P = BOM_PAPER;
  const W = P.cols.reduce((a, b) => a + b, 0) * u, rh = P.row * u;
  const n = rows.length + 1;
  const at = (dx: number, dy: number): Pt => ({ x: o.x + dx, y: o.y + dy });
  for (let i = 0; i <= n; i++) g.lines.push({ a: at(0, i * rh), b: at(W, i * rh), weight: i === 0 || i === n || i === 1 ? 'fort' : 'fin' });
  let x = 0;
  for (let c = 0; c <= P.cols.length; c++) {
    g.lines.push({ a: at(x, 0), b: at(x, n * rh), weight: c === 0 || c === P.cols.length ? 'fort' : 'fin' });
    if (c < P.cols.length) x += P.cols[c] * u;
  }
  const cells = [BOM_HEADER, ...rows.map(r => [String(r.item), r.designation, r.material, String(r.quantity)])];
  cells.forEach((cells, i) => {
    let cx = 0;
    cells.forEach((text, c) => {
      const w = P.cols[c] * u;
      const centered = c === 0 || c === 3;
      g.texts.push({ at: at(centered ? cx + w / 2 : cx + P.pad * u, i * rh + rh / 2 + (P.text * u) / 2), text, height: P.text * u, anchor: centered ? 'middle' : 'start' });
      cx += w;
    });
  });
  return g;
}

/** Point d'attache d'un repère : centre de l'emprise de la pièce. */
export function anchorOf(target: CadObject | undefined, objects: CadObject[], blocks: BlockDef[]): Pt | null {
  if (!target) return null;
  const b = objectBounds(target, blocks, objects);
  return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : null;
}

/** Repère : bulle numérotée en (x, y), ligne de repère jusqu'à la pièce, terminée par un point. */
export function balloonGeometry(o: Pick<BalloonObj, 'x' | 'y'>, item: number | null, anchor: Pt | null, u: number): SymbolGeometry {
  const g: SymbolGeometry = { lines: [], fills: [], circles: [], texts: [] };
  const R = BOM_PAPER.balloon * u;
  g.circles.push({ c: { x: o.x, y: o.y }, r: R });
  g.texts.push({ at: { x: o.x, y: o.y + (BOM_PAPER.text * u) / 2 }, text: item === null ? '?' : String(item), height: BOM_PAPER.text * u, anchor: 'middle' });
  if (anchor) {
    const dx = anchor.x - o.x, dy = anchor.y - o.y, L = Math.hypot(dx, dy);
    if (L > R) {
      g.lines.push({ a: { x: o.x + (dx / L) * R, y: o.y + (dy / L) * R }, b: anchor, weight: 'fin' });
      const r = BOM_PAPER.dot * u, k = 8;
      g.fills.push(Array.from({ length: k }, (_, i) => ({ x: anchor.x + r * Math.cos((2 * Math.PI * i) / k), y: anchor.y + r * Math.sin((2 * Math.PI * i) / k) })));
    }
  }
  return g;
}

/** Géométrie d'un tableau ou d'un repère de nomenclature. */
export function bomAnnotation(o: BomObj | BalloonObj, u: number, objects: CadObject[], blocks: BlockDef[]): SymbolGeometry {
  const rows = bomRows(objects, blocks);
  if (o.kind === 'bom') return bomGeometry(o, rows, u);
  return balloonGeometry(o, itemOf(rows, o.targetId), anchorOf(objects.find(t => t.id === o.targetId), objects, blocks), u);
}

export type AnnotationObject = SymbolObject | BomObj | BalloonObj;
/** Annotation dessinée à taille papier fixe : symbole, tableau de nomenclature ou repère. */
export const isAnnotation = (o: CadObject): o is AnnotationObject => isSymbol(o) || o.kind === 'bom' || o.kind === 'balloon';

export function annotationGeometry(o: AnnotationObject, u: number, objects: CadObject[], blocks: BlockDef[]): SymbolGeometry | null {
  return o.kind === 'bom' || o.kind === 'balloon' ? bomAnnotation(o, u, objects, blocks) : symbolGeometry(o, u);
}
