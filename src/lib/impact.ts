// Analyse d'impact (lot 14.3) : avant de supprimer ou de modifier des objets, ce qu'ils emportent ou
// touchent. Graphe de dépendances : objets associés (cotes, ouvertures, vues, coupes, notes, repères),
// pièces délimitées par un mur, tableaux et nomenclature calculés, contraintes, et feuilles dont une
// fenêtre montre un élément touché (feuilles « à recalculer »). Fonctions pures.
import type { BlockDef, CadObject, GeoConstraint, Level, Sheet, WallObj } from '@/types/cad';
import { KIND_LABEL, parentsOf } from '@/types/cad';
import { constraintObjects } from './constraints/model';
import { objectBounds } from './geometry';
import { levelIdOf, onLevel, viewportLevelId } from './levels';
import { roomPolygons } from './rooms';

export interface ImpactItem { id: string; name: string; kind: string; reason: string }
export interface SheetImpact { id: string; name: string; viewports: string[] }
export interface Impact {
  /** Suppression : objets associés supprimés avec la cible. */
  removedWith: ImpactItem[];
  /** Objets dont le contenu ou la géométrie dérivée change. */
  affected: ImpactItem[];
  /** Contraintes qui visent un élément touché (supprimées avec lui, ou re-résolues). */
  constraints: string[];
  /** Feuilles à recalculer : une de leurs fenêtres montre un élément touché. */
  sheets: SheetImpact[];
}

export interface ImpactContext { objects: CadObject[]; blocks: BlockDef[]; sheets: Sheet[]; constraints?: GeoConstraint[]; levels?: Level[] }

const item = (o: CadObject, reason: string): ImpactItem => ({ id: o.id, name: o.name, kind: KIND_LABEL[o.kind], reason });

/** Distance d'un point au segment [a, b]. */
const segDist = (p: { x: number; y: number }, w: WallObj) => {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - w.x1) * dx + (p.y - w.y1) * dy) / l2));
  return Math.hypot(p.x - w.x1 - t * dx, p.y - w.y1 - t * dy);
};

export function impactOf(ids: string[], mode: 'suppression' | 'modification', ctx: ImpactContext): Impact {
  const { objects } = ctx;
  const byId = new Map(objects.map(o => [o.id, o]));
  const targets = ids.map(id => byId.get(id)).filter((o): o is CadObject => !!o);
  const targetIds = new Set(targets.map(o => o.id));

  // Objets associés, de proche en proche (une cote d'une ouverture d'un mur…).
  const associated: ImpactItem[] = [];
  const seen = new Set(targetIds);
  for (let changed = true; changed;) {
    changed = false;
    for (const o of objects) {
      // Tous les parents, comme la suppression (une coupe dépend aussi de son repère).
      const p = parentsOf(o).find(x => seen.has(x));
      if (p && !seen.has(o.id)) { seen.add(o.id); associated.push(item(o, `associé à ${p}`)); changed = true; }
    }
  }
  const touched = [...targets, ...associated.map(a => byId.get(a.id)!)];
  const affected: ImpactItem[] = mode === 'modification' ? associated.map(a => ({ ...a, reason: `suit ${a.reason.replace('associé à ', '')}` })) : [];
  const add = (o: CadObject, reason: string) => { if (!seen.has(o.id)) { seen.add(o.id); affected.push(item(o, reason)); } };

  // Contours dont un îlot (trou de hachure) est touché : leur hachure change.
  const touchedIds = new Set(touched.map(o => o.id));
  for (const o of objects) {
    const h = o.holes?.find(x => touchedIds.has(x));
    if (h) add(o, `hachure autour de l’îlot ${h}`);
  }
  // Pièces dont le contour s'appuie sur un mur touché (même niveau).
  const walls = touched.filter((o): o is WallObj => o.kind === 'wall');
  if (walls.length) {
    // Contours calculés niveau par niveau : les murs d'un autre étage ne délimitent pas cette pièce.
    const byLevel = new Map<string, ReturnType<typeof roomPolygons>>();
    const polysOf = (lvl: string) => { const m = byLevel.get(lvl) ?? roomPolygons(onLevel(objects, lvl)); byLevel.set(lvl, m); return m; };
    for (const o of objects) {
      if (o.kind !== 'room') continue;
      const poly = polysOf(levelIdOf(o)).get(o.id);
      const w = walls.find(w => levelIdOf(w) === levelIdOf(o) && poly?.some(p => segDist(p, w) <= w.thickness / 2 + 1));
      if (w) add(o, `contour délimité par ${w.id}`);
    }
  }
  // Tableaux de quantités et nomenclature recalculés (même niveau).
  const kinds = new Set(touched.map(o => o.kind));
  const parts = touched.some(o => o.kind === 'blockRef' || o.kind === 'occurrence' || (o.kind === 'solid' && !!o.partDef) || !!o.part?.trim());
  for (const o of objects) {
    if (o.kind !== 'bom' || !touched.some(t => levelIdOf(t) === levelIdOf(o))) continue;
    const hit = o.table === 'murs' ? kinds.has('wall')
      : o.table === 'pieces' ? kinds.has('wall') || kinds.has('room') || affected.some(a => byId.get(a.id)?.kind === 'room')
      : o.table === 'ouvertures' ? kinds.has('opening')
      : parts;
    if (hit) add(o, o.table ? 'tableau recalculé' : 'nomenclature recalculée');
  }

  // Liaisons d'assemblage : une occurrence liée à un objet touché est repositionnée par sa liaison
  // (de proche en proche) ; si l'objet est supprimé, elle garde sa place et perd sa liaison.
  const moved = new Set(touched.map(o => o.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const o of objects) {
      if (o.kind !== 'occurrence' || !o.mate || !moved.has(o.mate.to) || seen.has(o.id)) continue;
      add(o, mode === 'suppression' ? `perd sa liaison à ${o.mate.to}` : `repositionné par sa liaison à ${o.mate.to}`);
      if (mode === 'modification') { moved.add(o.id); grew = true; }
    }
  }

  // Façades et coupes : recalculées sur tout le bâtiment (tous niveaux), dès qu'un élément en volume
  // (mur, dalle, poteau, poutre, toiture, solide, occurrence) est touché ou repositionné.
  const VOLUME = new Set<CadObject['kind']>(['wall', 'slab', 'column', 'beam', 'roof', 'solid', 'occurrence']);
  const volume = [...touched, ...affected.map(a => byId.get(a.id)!)].find(o => VOLUME.has(o.kind));
  if (volume) for (const o of objects) if (o.kind === 'elevation') add(o, `${o.view === 'coupe' ? 'coupe' : 'façade'} recalculée (${volume.id})`);

  // Contraintes.
  const all = new Set([...touched.map(o => o.id), ...affected.map(a => a.id)]);
  const constraints = (ctx.constraints ?? []).filter(k => constraintObjects(k).some(id => all.has(id))).map(k => k.id);

  // Feuilles : fenêtres du même niveau dont la vue recouvre un élément touché, sur un calque montré.
  const shown = [...touched, ...affected.map(a => byId.get(a.id)!)];
  const sheets: SheetImpact[] = [];
  for (const sh of ctx.sheets) {
    const vps = sh.viewports.filter(vp => {
      const k = vp.scale.model / vp.scale.paper, hw = (vp.w * k) / 2, hh = (vp.h * k) / 2;
      const lvl = viewportLevelId(vp, ctx.levels);
      return shown.some(o => {
        if (levelIdOf(o) !== lvl || vp.hiddenLayerIds.includes(o.layerId)) return false;
        const b = objectBounds(o, ctx.blocks, objects);
        return !!b && b.maxX >= vp.center.x - hw && b.minX <= vp.center.x + hw && b.maxY >= vp.center.y - hh && b.minY <= vp.center.y + hh;
      });
    });
    if (vps.length) sheets.push({ id: sh.id, name: sh.name, viewports: vps.map(v => v.id) });
  }
  return { removedWith: mode === 'suppression' ? associated : [], affected, constraints, sheets };
}

/** Résumé en une phrase (message après une suppression). */
export function impactSummary(i: Impact): string {
  const parts: string[] = [];
  if (i.removedWith.length) parts.push(`${i.removedWith.length} objet(s) associé(s) supprimé(s) avec : ${i.removedWith.map(x => x.id).join(', ')}`);
  if (i.affected.length) parts.push(`${i.affected.length} objet(s) recalculé(s) : ${i.affected.map(x => x.id).join(', ')}`);
  if (i.constraints.length) parts.push(`contrainte(s) ${i.constraints.join(', ')}`);
  if (i.sheets.length) parts.push(`feuille(s) à recalculer : ${i.sheets.map(s => s.name).join(', ')}`);
  return parts.join(' ; ');
}
