// Tableaux de quantités (lot 13.5) : pièces, ouvertures et murs, calculés depuis le modèle à chaque
// affichage (un mur modifié met le tableau à jour). Une valeur qui ne peut pas être calculée est
// « non évaluée » et n'entre pas dans les totaux. Fonctions pures.
import type { CadObject } from '@/types/cad';
import { areaM2, formatM2, roomPolygons } from './rooms';

export type ScheduleKind = 'pieces' | 'ouvertures' | 'murs';

export interface Table {
  header: string[];
  /** Largeurs des colonnes (mm papier) et colonnes centrées. */
  cols: number[];
  centered: boolean[];
  rows: string[][];
  /** Ligne de total (absente si le tableau n'en a pas). */
  total?: string[];
}

export const SCHEDULE_TITLE: Record<ScheduleKind, string> = { pieces: 'Tableau des pièces', ouvertures: 'Tableau des ouvertures', murs: 'Tableau des murs' };

const idNumber = (id: string) => Number(id.match(/(\d+)$/)?.[1] ?? 0);
const ordered = (objects: CadObject[]) => [...objects].sort((a, b) => a.createdSeq - b.createdSeq || idNumber(a.id) - idNumber(b.id));
const fr = (v: number, d: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function scheduleTable(kind: ScheduleKind, objects: CadObject[]): Table {
  if (kind === 'pieces') {
    const polys = roomPolygons(objects);
    let total = 0, missing = 0;
    const rows = ordered(objects.filter(o => o.kind === 'room')).map(o => {
      const p = polys.get(o.id);
      if (!p) { missing++; return [o.name, 'non évaluée']; }
      const a = areaM2(p);
      total += a;
      return [o.name, formatM2(a)];
    });
    return { header: ['Pièce', 'Surface'], cols: [60, 34], centered: [false, false], rows, total: ['Total', `${missing ? 'au moins ' : ''}${formatM2(total)}`] };
  }
  if (kind === 'ouvertures') {
    // Regroupées par type et largeur, dans l'ordre d'apparition.
    const groups: { type: string; width: number; n: number }[] = [];
    for (const o of ordered(objects)) {
      if (o.kind !== 'opening') continue;
      const type = o.type === 'porte' ? 'Porte' : 'Fenêtre';
      const g = groups.find(x => x.type === type && x.width === o.width);
      if (g) g.n++; else groups.push({ type, width: o.width, n: 1 });
    }
    return {
      header: ['Type', 'Largeur (mm)', 'Qté'], cols: [36, 30, 16], centered: [false, true, true],
      rows: groups.map(g => [g.type, fr(g.width, 0), String(g.n)]),
      total: ['Total', '', String(groups.reduce((s, g) => s + g.n, 0))],
    };
  }
  let total = 0;
  const rows = ordered(objects.filter(o => o.kind === 'wall')).map(o => {
    const w = o as Extract<CadObject, { kind: 'wall' }>;
    const l = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 1000;
    total += l;
    return [w.name, fr(w.thickness, 0), fr(l, 2)];
  });
  return { header: ['Mur', 'Épaisseur (mm)', 'Longueur (m)'], cols: [36, 30, 30], centered: [false, true, true], rows, total: ['Total', '', fr(total, 2)] };
}
