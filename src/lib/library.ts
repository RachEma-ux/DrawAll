// Bibliothèque de blocs bâtiment (lot 4.5) : gabarits d'équipements en plan, ajoutés au projet comme
// blocs ordinaires. Dimensions courantes indicatives, non normatives : à remplacer par celles du
// fabricant retenu. Repère local : coin haut-gauche à (0, 0), Y vers le bas, mm.
import type { BlockDef, PrimitiveObject } from '@/types/cad';

export interface LibraryItem {
  key: string;
  name: string;
  /** Encombrement en plan (mm), rappelé dans le nom du bloc. */
  size: string;
  primitives: (layerId: string, blockId: string) => PrimitiveObject[];
}

export const LIBRARY_SOURCE = 'Gabarits indicatifs courants, non normatifs — à vérifier selon le fabricant.';

type Shape = { kind: 'rect'; x: number; y: number; w: number; h: number } | { kind: 'circle'; cx: number; cy: number; r: number } | { kind: 'line'; x1: number; y1: number; x2: number; y2: number };
const R = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'rect', x, y, w, h });
const C = (cx: number, cy: number, r: number): Shape => ({ kind: 'circle', cx, cy, r });
const L = (x1: number, y1: number, x2: number, y2: number): Shape => ({ kind: 'line', x1, y1, x2, y2 });

function item(key: string, name: string, size: string, shapes: Shape[]): LibraryItem {
  return {
    key, name, size,
    primitives: (layerId, blockId) => shapes.map((s, i) => ({
      ...s, id: `${blockId}-P${i + 1}`, name: `${name} — trait ${i + 1}`, classification: 'architecture', layerId, hatch: 'none', createdSeq: 0,
    }) as PrimitiveObject),
  };
}

export const BUILDING_LIBRARY: LibraryItem[] = [
  item('lit-140', 'Lit double', '140 × 190', [R(0, 0, 1400, 1900), R(100, 80, 550, 300), R(750, 80, 550, 300), L(0, 600, 1400, 600)]),
  item('lit-90', 'Lit simple', '90 × 190', [R(0, 0, 900, 1900), R(150, 80, 600, 300), L(0, 600, 900, 600)]),
  item('table-4', 'Table quatre places', '120 × 80', [R(0, 0, 1200, 800)]),
  item('wc', 'WC', '37 × 60', [R(0, 0, 370, 180), C(185, 400, 170)]),
  item('lavabo', 'Lavabo', '60 × 45', [R(0, 0, 600, 450), C(300, 250, 150)]),
  item('evier', 'Évier deux bacs', '120 × 60', [R(0, 0, 1200, 600), R(60, 80, 500, 440), R(640, 80, 500, 440)]),
  item('douche', 'Douche', '90 × 90', [R(0, 0, 900, 900), L(0, 0, 900, 900), L(900, 0, 0, 900), C(450, 450, 50)]),
  item('baignoire', 'Baignoire', '170 × 70', [R(0, 0, 1700, 700), R(80, 80, 1540, 540), C(1500, 350, 40)]),
];

export const libraryItem = (key: string) => BUILDING_LIBRARY.find(i => i.key === key);

/** Définition de bloc tirée d'un gabarit de la bibliothèque. */
export function libraryBlock(it: LibraryItem, blockId: string, layerId: string): BlockDef {
  return { id: blockId, name: `${it.name} ${it.size}`, description: LIBRARY_SOURCE, libraryKey: it.key, primitives: it.primitives(layerId, blockId) };
}
