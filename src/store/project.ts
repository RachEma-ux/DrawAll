// État du projet : microversions Git-like, calques, blocs, cotes associatives,
// annulation, versions nommées, persistance locale (brouillon explicite — Concept §8).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createDefaultLayers,
  type BlockDef,
  type CadObject,
  type DimensionStyle,
  type Layer,
  type Level,
  type MicroVersion,
  type NewCadObject,
  type PrimitiveObject,
  type ProjectState,
  type Sheet,
  type Viewport,
  type PaperFormat,
  type Orientation,
  KIND_LABEL,
  polylineExtents,
  supportedDimensionStyles,
} from '@/types/cad';
import { arcBounds } from '@/lib/arc';
import { cloneAll, translation, withDependencies, type Placement } from '@/lib/array';
import { LINE_TYPES } from '@/lib/linestyle';
import { profileById } from '@/lib/materials';
import { libraryBlock, libraryItem } from '@/lib/library';
import { DEFAULT_LEVEL, copyLevelObjects, levelIdOf, levelsOf, onLevel } from '@/lib/levels';
import { DEFAULT_MARGINS, PAPER_FORMATS, STANDARD_SCALES, printableArea } from '@/lib/sheet';
import { nextIndexLetter } from '@/lib/titleblock';

const STORAGE_KEY = 'drawall-projet-v1';
/** Tolérance de calcul : en deçà, une longueur est considérée comme nulle (mm). */
const GEOMETRY_EPSILON = 1e-6;
const LAYER_COLORS = ['#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185'];

function seedProject(): ProjectState {
  const layers = createDefaultLayers();
  const blocks: BlockDef[] = [
    {
      id: 'BLQ-0001',
      name: 'Support machine type',
      description: 'Bloc de démonstration : semelle + perçage',
      primitives: [
        { id: 'BLQ-0001-P1', name: 'Semelle', kind: 'rect', classification: 'mecanique', layerId: 'LAY-0002', hatch: 'diagonal', createdSeq: 0, x: 0, y: 0, w: 90, h: 52 },
        { id: 'BLQ-0001-P1b', name: 'Perçage', kind: 'circle', classification: 'mecanique', layerId: 'LAY-0002', createdSeq: 0, cx: 45, cy: 26, r: 12 },
      ],
    },
  ];
  const objects: CadObject[] = [
    { id: 'OBJ-0001', name: 'Mur porteur A', kind: 'rect', classification: 'architecture', layerId: 'LAY-0001', hatch: 'cross', createdSeq: 0, x: 80, y: 80, w: 460, h: 24 },
    { id: 'OBJ-0002', name: 'Mur porteur B', kind: 'rect', classification: 'architecture', layerId: 'LAY-0001', hatch: 'cross', createdSeq: 0, x: 80, y: 80, w: 24, h: 320 },
    { id: 'OBJ-0003', name: 'Support machine', kind: 'rect', classification: 'mecanique', layerId: 'LAY-0002', hatch: 'diagonal', createdSeq: 0, x: 200, y: 200, w: 120, h: 90 },
    { id: 'OBJ-0004', name: 'Axe de référence', kind: 'line', classification: 'structure', layerId: 'LAY-0003', createdSeq: 0, x1: 140, y1: 360, x2: 520, y2: 360 },
    { id: 'OBJ-0005', name: 'Armoire électrique', kind: 'circle', classification: 'electrique', layerId: 'LAY-0002', createdSeq: 0, cx: 460, cy: 180, r: 42 },
    { id: 'OBJ-0006', name: 'Support type — occurrence', kind: 'blockRef', classification: 'mecanique', layerId: 'LAY-0002', createdSeq: 0, blockId: 'BLQ-0001', x: 580, y: 260, scale: 1 },
  ];
  return {
    versions: [{ seq: 0, label: 'Projet initial — démonstrateur atelier', time: Date.now(), objects, layers, blocks }],
    pointer: 0,
    counter: 6,
    layerCounter: 4,
    blockCounter: 1,
    activeLayerId: 'LAY-0004',
  };
}

function numericSuffix(id: string, prefix: string): number {
  const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number(match[1]) : 0;
}

function normalizeLayers(raw: unknown): Layer[] {
  if (!Array.isArray(raw)) return createDefaultLayers();
  const layers = raw
    .filter((l): l is Partial<Layer> => !!l && typeof l === 'object')
    .map((l, i) => ({
      id: typeof l.id === 'string' ? l.id : `LAY-${String(i + 1).padStart(4, '0')}`,
      name: typeof l.name === 'string' ? l.name : `Calque ${i + 1}`,
      color: typeof l.color === 'string' ? l.color : LAYER_COLORS[i % LAYER_COLORS.length],
      visible: l.visible !== false,
      locked: l.locked === true,
      ...(LINE_TYPES.some(t => t.key === l.lineType) ? { lineType: l.lineType } : {}),
      ...(typeof l.lineWeight === 'number' && l.lineWeight > 0 ? { lineWeight: l.lineWeight } : {}),
    }));
  return layers.length > 0 ? layers : createDefaultLayers();
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Feuilles d'une version : valeurs manquantes complétées, calques masqués limités aux calques existants. */
export function normalizeSheets(raw: unknown, layers: Layer[]): Sheet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((sh): sh is Partial<Sheet> => !!sh && typeof sh === 'object' && typeof (sh as Sheet).id === 'string')
    .map(sh => ({
      id: sh.id!,
      name: typeof sh.name === 'string' ? sh.name : sh.id!,
      format: PAPER_FORMATS.includes(sh.format as PaperFormat) ? sh.format! : 'A3',
      orientation: sh.orientation === 'portrait' ? 'portrait' : 'paysage',
      margins: {
        top: num(sh.margins?.top, DEFAULT_MARGINS.top), right: num(sh.margins?.right, DEFAULT_MARGINS.right),
        bottom: num(sh.margins?.bottom, DEFAULT_MARGINS.bottom), left: num(sh.margins?.left, DEFAULT_MARGINS.left),
      },
      viewports: (Array.isArray(sh.viewports) ? sh.viewports : [])
        .filter((v): v is Viewport => !!v && typeof v === 'object' && typeof v.id === 'string')
        .map(v => ({
          id: v.id,
          name: typeof v.name === 'string' ? v.name : v.id,
          x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 100), h: num(v.h, 100),
          scale: { paper: num(v.scale?.paper, 1) > 0 ? num(v.scale?.paper, 1) : 1, model: num(v.scale?.model, 1) > 0 ? num(v.scale?.model, 1) : 1 },
          center: { x: num(v.center?.x, 0), y: num(v.center?.y, 0) },
          hiddenLayerIds: Array.isArray(v.hiddenLayerIds) ? v.hiddenLayerIds.filter(id => layers.some(l => l.id === id)) : [],
          ...(v.context === 'vue' || v.context === 'coupe' ? { context: v.context } : {}),
          ...(typeof v.levelId === 'string' ? { levelId: v.levelId } : {}),
        })),
      ...(sh.titleBlock && typeof sh.titleBlock === 'object' ? {
        titleBlock: {
          project: typeof sh.titleBlock.project === 'string' ? sh.titleBlock.project : '',
          title: typeof sh.titleBlock.title === 'string' ? sh.titleBlock.title : '',
          author: typeof sh.titleBlock.author === 'string' ? sh.titleBlock.author : '',
          projection: sh.titleBlock.projection === 'troisieme-diedre' ? 'troisieme-diedre' as const : 'premier-diedre' as const,
        },
      } : {}),
    }));
}

/** Prochain identifiant libre pour un préfixe, d'après tous les identifiants déjà vus. */
function nextId(prefix: string, ids: string[]): string {
  let max = 0;
  for (const id of ids) max = Math.max(max, numericSuffix(id, prefix));
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function normalizeObject(raw: unknown, layers: Layer[]): CadObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as CadObject & { layer?: string };
  if (typeof o.id !== 'string' || typeof o.kind !== 'string') return null;
  const legacyLayerId = typeof o.layer === 'string'
    ? layers.find(l => l.name === o.layer)?.id
    : undefined;
  const layerId = layers.some(l => l.id === o.layerId)
    ? o.layerId
    : legacyLayerId ?? layers[0].id;
  const base = { ...o, layerId, hatch: o.hatch ?? 'none' } as CadObject;
  return base;
}

function normalizeBlocks(raw: unknown, layers: Layer[]): BlockDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is Partial<BlockDef> => !!b && typeof b === 'object')
    .map((b, i) => ({
      id: typeof b.id === 'string' ? b.id : `BLQ-${String(i + 1).padStart(4, '0')}`,
      name: typeof b.name === 'string' ? b.name : `Bloc ${i + 1}`,
      description: typeof b.description === 'string' ? b.description : undefined,
      ...(typeof b.libraryKey === 'string' ? { libraryKey: b.libraryKey } : {}),
      primitives: Array.isArray(b.primitives)
        ? b.primitives.map(p => normalizeObject(p, layers)).filter((p): p is PrimitiveObject =>
            !!p && (p.kind === 'line' || p.kind === 'rect' || p.kind === 'circle' || p.kind === 'arc' || p.kind === 'polyline'),
          )
        : [],
    }));
}

export function normalizeProjectState(raw: unknown): ProjectState {
  const p = raw as Partial<ProjectState> | null;
  if (p && Array.isArray(p.versions) && p.versions.length > 0) {
    const fallbackLayers = normalizeLayers((p.versions[0] as Partial<MicroVersion>).layers);
    const versions = p.versions
      .filter((v): v is MicroVersion => !!v && typeof v.seq === 'number' && typeof v.label === 'string' && Array.isArray(v.objects))
      .map(v => {
        const layers = normalizeLayers(v.layers ?? fallbackLayers);
        const levels = normalizeLevels(v.levels);
        const known = levelsOf(levels);
        // Un objet rattaché à un niveau inconnu va sur le premier niveau (jamais invisible).
        const onKnown = (o: CadObject): CadObject => {
          if (known.some(l => l.id === levelIdOf(o))) return o;
          const rest = { ...o };
          delete rest.levelId;
          return known[0].id === DEFAULT_LEVEL.id ? rest : { ...rest, levelId: known[0].id };
        };
        const vRest: MicroVersion = { ...v };
        delete vRest.levels;
        return {
          ...vRest,
          ...(levels ? { levels } : {}),
          time: typeof v.time === 'number' ? v.time : Date.now(),
          objects: v.objects.map(o => normalizeObject(o, layers)).filter((o): o is CadObject => !!o).map(onKnown),
          layers,
          blocks: normalizeBlocks(v.blocks, layers),
          // Une fenêtre sur un niveau inconnu montre le premier niveau.
          sheets: normalizeSheets(v.sheets, layers).map(sh => ({
            ...sh,
            viewports: sh.viewports.map(vp => (known.some(l => l.id === levelIdOf(vp)) ? vp : { ...vp, levelId: known[0].id })),
          })),
          ...(typeof v.profileId === 'string' ? { profileId: v.profileId } : {}),
          ...(v.surfaceRule === 'carrez' || v.surfaceRule === 'sia-416' ? { surfaceRule: v.surfaceRule } : {}),
        };
      });
    if (versions.length > 0) {
      const pointer = Math.max(0, Math.min(versions.length - 1, Number(p.pointer ?? versions.length - 1)));
      const allObjects = versions.flatMap(v => v.objects);
      const allLayers = versions.flatMap(v => v.layers);
      const allBlocks = versions.flatMap(v => v.blocks);
      const currentLayers = versions[pointer].layers;
      const activeLayerId = currentLayers.some(l => l.id === p.activeLayerId)
        ? p.activeLayerId!
        : currentLayers[0].id;
      return {
        versions,
        pointer,
        counter: Math.max(Number(p.counter ?? 0), ...allObjects.map(o => numericSuffix(o.id, 'OBJ')), 0),
        layerCounter: Math.max(Number(p.layerCounter ?? 0), ...allLayers.map(l => numericSuffix(l.id, 'LAY')), currentLayers.length),
        blockCounter: Math.max(Number(p.blockCounter ?? 0), ...allBlocks.map(b => numericSuffix(b.id, 'BLQ')), 0),
        activeLayerId,
        ...(typeof p.activeLevelId === 'string' ? { activeLevelId: p.activeLevelId } : {}),
      };
    }
  }
  return seedProject();
}

/** Niveaux d'une version : identifiant, nom et altitude valides ; aucun doublon. */
export function normalizeLevels(raw: unknown): Level[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Level[] = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object' || typeof (l as Level).id !== 'string' || out.some(x => x.id === (l as Level).id)) continue;
    out.push({ id: (l as Level).id, name: typeof (l as Level).name === 'string' ? (l as Level).name : (l as Level).id, elevation: num((l as Level).elevation, 0) });
  }
  return out.length ? out : undefined;
}

function load(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeProjectState(JSON.parse(raw));
  } catch { /* cache illisible : réinitialisation */ }
  return seedProject();
}

interface SnapshotPatch {
  sheets?: Sheet[];
  profileId?: string;
  surfaceRule?: 'sia-416' | 'carrez';
  levels?: Level[];
  activeLevelId?: string;
  objects?: CadObject[];
  layers?: Layer[];
  blocks?: BlockDef[];
  counter?: number;
  layerCounter?: number;
  blockCounter?: number;
  activeLayerId?: string;
}

function primitiveOrigin(obj: PrimitiveObject): { x: number; y: number } {
  switch (obj.kind) {
    case 'line': return { x: Math.min(obj.x1, obj.x2), y: Math.min(obj.y1, obj.y2) };
    case 'rect': return { x: obj.x, y: obj.y };
    case 'circle': return { x: obj.cx - obj.r, y: obj.cy - obj.r };
    case 'arc': { const b = arcBounds(obj); return { x: b.minX, y: b.minY }; }
    case 'polyline': {
      const e = polylineExtents(obj.points);
      return { x: e.minX, y: e.minY };
    }
  }
}

function localizePrimitive(obj: PrimitiveObject, origin: { x: number; y: number }, blockId: string): PrimitiveObject {
  const local = { ...obj, id: `${blockId}-P1`, name: obj.name, createdSeq: 0 } as PrimitiveObject;
  switch (local.kind) {
    case 'line': return { ...local, x1: local.x1 - origin.x, y1: local.y1 - origin.y, x2: local.x2 - origin.x, y2: local.y2 - origin.y };
    case 'rect': return { ...local, x: 0, y: 0 };
    case 'circle': return { ...local, cx: local.cx - origin.x, cy: local.cy - origin.y };
    case 'arc': return { ...local, cx: local.cx - origin.x, cy: local.cy - origin.y };
    case 'polyline': return { ...local, points: local.points.map((v, i) => v - (i % 2 === 0 ? origin.x : origin.y)) };
  }
}

export function useProject() {
  const [state, setState] = useState<ProjectState>(load);
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [selectedIds, setSelectedIdsRaw] = useState<string[]>([]);

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdRaw(id);
    setSelectedIdsRaw(id ? [id] : []);
  }, []);

  const setSelectedIds = useCallback((ids: string[]) => {
    setSelectedIdsRaw(ids);
    setSelectedIdRaw(ids[ids.length - 1] ?? null);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota : état visible, non bloquant */ }
  }, [state]);

  const current = state.versions[state.pointer];
  const allObjects = current.objects;
  // Niveaux (lot 4.4) : l'interface ne voit et n'édite que les objets du niveau actif.
  const levels = useMemo(() => levelsOf(current.levels), [current.levels]);
  const activeLevelId = levels.some(l => l.id === state.activeLevelId) ? state.activeLevelId! : levels[0].id;
  const objects = useMemo(() => onLevel(allObjects, activeLevelId), [allObjects, activeLevelId]);
  /** Rattache un nouvel objet au niveau actif (aucune marque pour le niveau par défaut). */
  const stampLevel = useCallback(<T extends { levelId?: string }>(o: T): T => {
    if (activeLevelId === DEFAULT_LEVEL.id) { const rest = { ...o }; delete rest.levelId; return rest; }
    return { ...o, levelId: activeLevelId };
  }, [activeLevelId]);
  const layers = current.layers;
  const blocks = current.blocks;
  const sheets = useMemo(() => current.sheets ?? [], [current.sheets]);
  const activeLayerId = layers.some(l => l.id === state.activeLayerId) ? state.activeLayerId : layers[0].id;

  const commit = useCallback((label: string, patch: SnapshotPatch) => {
    setState(s => {
      const cur = s.versions[s.pointer];
      const seq = s.versions[s.versions.length - 1].seq + 1;
      const mv: MicroVersion = {
        seq,
        label,
        time: Date.now(),
        objects: patch.objects ?? cur.objects,
        layers: patch.layers ?? cur.layers,
        blocks: patch.blocks ?? cur.blocks,
        sheets: patch.sheets ?? cur.sheets ?? [],
        ...((patch.profileId ?? cur.profileId) ? { profileId: patch.profileId ?? cur.profileId } : {}),
        ...((patch.surfaceRule ?? cur.surfaceRule) ? { surfaceRule: patch.surfaceRule ?? cur.surfaceRule } : {}),
        ...((patch.levels ?? cur.levels) ? { levels: patch.levels ?? cur.levels } : {}),
      };
      return {
        versions: [...s.versions.slice(0, s.pointer + 1), mv],
        pointer: s.pointer + 1,
        counter: patch.counter ?? s.counter,
        layerCounter: patch.layerCounter ?? s.layerCounter,
        blockCounter: patch.blockCounter ?? s.blockCounter,
        activeLayerId: patch.activeLayerId ?? s.activeLayerId,
        ...((patch.activeLevelId ?? s.activeLevelId) ? { activeLevelId: patch.activeLevelId ?? s.activeLevelId } : {}),
      };
    });
  }, []);

  const addObject = useCallback((partial: NewCadObject, name?: string) => {
    const id = `OBJ-${String(state.counter + 1).padStart(4, '0')}`;
    const obj = stampLevel({ ...partial, id, createdSeq: current.seq, name: name ?? id } as CadObject);
    commit(`Créer ${KIND_LABEL[obj.kind].toLowerCase()} ${id}`, {
      objects: [...allObjects, obj],
      counter: state.counter + 1,
    });
    setSelectedId(id);
    return id;
  }, [state.counter, current.seq, allObjects, commit, setSelectedId, stampLevel]);

  const updateObject = useCallback((id: string, patch: Partial<CadObject>, label = 'Modifier') => {
    commit(`${label} ${id}`, { objects: allObjects.map(o => (o.id === id ? ({ ...o, ...patch } as CadObject) : o)) });
  }, [allObjects, commit]);

  const removeObjects = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const removed = new Set(ids);
    // Les cotes associatives dont la cible disparaît partent avec elle.
    // Les ouvertures d'un mur supprimé partent avec lui.
    for (const o of allObjects) {
      if (o.kind === 'opening' && removed.has(o.hostId)) removed.add(o.id);
    }
    for (const o of allObjects) {
      if (o.kind === 'dimension' && removed.has(o.targetId)) removed.add(o.id);
    }
    commit(ids.length === 1 ? `Supprimer ${ids[0]}` : `Supprimer ${ids.length} objets`, {
      objects: allObjects.filter(o => !removed.has(o.id)),
    });
    setSelectedIds([]);
  }, [allObjects, commit, setSelectedIds]);

  /** Applique une transformation géométrique pure à chaque objet de la sélection. */
  const transformObjects = useCallback((ids: string[], fn: (o: CadObject) => Partial<CadObject> | null, label: string) => {
    const editable = ids
      .map(id => allObjects.find(o => o.id === id))
      .filter((o): o is CadObject => !!o && !layers.find(l => l.id === o.layerId)?.locked && o.kind !== 'dimension');
    if (editable.length === 0) return 0;
    const patches = new Map<string, Partial<CadObject>>();
    for (const o of editable) {
      const patch = fn(o);
      if (patch) patches.set(o.id, patch);
    }
    if (patches.size === 0) return 0;
    commit(`${label} (${patches.size} objet${patches.size > 1 ? 's' : ''})`, {
      objects: allObjects.map(o => (patches.has(o.id) ? ({ ...o, ...patches.get(o.id) } as CadObject) : o)),
    });
    return patches.size;
  }, [allObjects, layers, commit]);

  /**
   * Ajoute des copies de `sources` (objets du projet ou contenu du presse-papiers) pour chaque
   * pose, en une seule version, avec des identifiants neufs. Une copie dont le calque n'existe
   * plus va sur le calque actif ; rien n'est copié vers un calque verrouillé.
   */
  const addCopies = useCallback((sources: CadObject[], placements: Placement[], label: string) => {
    const active = layers.find(l => l.id === activeLayerId);
    const usable = sources
      .map(o => (layers.some(l => l.id === o.layerId) || !active ? o : ({ ...o, layerId: active.id } as CadObject)))
      .filter(o => !layers.find(l => l.id === o.layerId)?.locked);
    if (usable.length === 0 || placements.length === 0) return [];
    const { objects: cloned, counter } = cloneAll(usable, placements, state.counter, current.seq);
    const clones = cloned.map(stampLevel);
    if (clones.length === 0) return [];
    commit(`${label} — ${clones.length} objet${clones.length > 1 ? 's' : ''}`, {
      objects: [...allObjects, ...clones],
      counter,
    });
    setSelectedIds(clones.map(c => c.id));
    return clones.map(c => c.id);
  }, [allObjects, layers, activeLayerId, state.counter, current.seq, commit, setSelectedIds, stampLevel]);

  /** Duplique la sélection avec de nouveaux identifiants, décalée de (dx, dy). */
  const duplicateObjects = useCallback((ids: string[], dx = 20, dy = 20) => {
    return addCopies(withDependencies(allObjects, ids), [translation(dx, dy)], 'Dupliquer');
  }, [allObjects, addCopies]);

  /**
   * Applique une édition (ajuster / prolonger) en une seule version : modification de l'objet,
   * suppression éventuelle et morceaux ajoutés, qui héritent du calque et de la classification.
   */
  const applyEdit = useCallback((id: string, edit: { patch: Partial<CadObject> | null; remove: boolean; added: Partial<CadObject>[] }, label: string) => {
    const source = allObjects.find(o => o.id === id);
    if (!source) return false;
    let counter = state.counter;
    const added = edit.added.map(partial => {
      counter += 1;
      const newId = `OBJ-${String(counter).padStart(4, '0')}`;
      return { ...source, ...partial, id: newId, name: `${source.name} (${newId})`, createdSeq: current.seq } as CadObject;
    });
    const removed = new Set<string>();
    if (edit.remove) {
      removed.add(id);
      for (const o of allObjects) if (o.kind === 'dimension' && o.targetId === id) removed.add(o.id);
    }
    const next = allObjects
      .filter(o => !removed.has(o.id))
      .map(o => (o.id === id && edit.patch ? ({ ...o, ...edit.patch } as CadObject) : o));
    commit(`${label} ${id}`, { objects: [...next, ...added], counter });
    if (edit.remove) setSelectedIds(added.map(o => o.id));
    return true;
  }, [allObjects, state.counter, current.seq, commit, setSelectedIds]);

  /**
   * Modifie plusieurs objets et en ajoute d'autres en une seule version (congé, chanfrein).
   * Chaque objet ajouté hérite du calque et de la classification de son objet source.
   */
  const applyPatches = useCallback((patches: { id: string; patch: Partial<CadObject> }[], added: { from: string; partial: Partial<CadObject> }[], label: string) => {
    if (patches.some(p => !allObjects.some(o => o.id === p.id))) return false;
    let counter = state.counter;
    const created = added.map(({ from, partial }) => {
      const source = allObjects.find(o => o.id === from)!;
      counter += 1;
      const newId = `OBJ-${String(counter).padStart(4, '0')}`;
      const inherited = { classification: source.classification, layerId: source.layerId, hatch: 'none' as const, ...(source.levelId ? { levelId: source.levelId } : {}) };
      return { ...inherited, ...partial, id: newId, name: `${source.name} (${newId})`, createdSeq: current.seq } as CadObject;
    });
    const byId = new Map(patches.map(p => [p.id, p.patch]));
    const next = allObjects.map(o => (byId.has(o.id) ? ({ ...o, ...byId.get(o.id) } as CadObject) : o));
    commit(`${label} ${patches.map(p => p.id).join(' + ')}`, { objects: [...next, ...created], counter });
    setSelectedIds(created.map(o => o.id));
    return true;
  }, [allObjects, state.counter, current.seq, commit, setSelectedIds]);

  const removeObject = useCallback((id: string) => {
    removeObjects([id]);
  }, [removeObjects]);

  const addLayer = useCallback((name: string) => {
    const id = `LAY-${String(state.layerCounter + 1).padStart(4, '0')}`;
    const layer: Layer = {
      id,
      name,
      color: LAYER_COLORS[state.layerCounter % LAYER_COLORS.length],
      visible: true,
      locked: false,
    };
    commit(`Créer calque ${name}`, {
      layers: [...layers, layer],
      layerCounter: state.layerCounter + 1,
      activeLayerId: id,
    });
    return id;
  }, [state.layerCounter, layers, commit]);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>, label = 'Modifier calque') => {
    const nextLayers = layers.map(l => (l.id === id ? { ...l, ...patch } : l));
    const stillActiveLocked = id === activeLayerId && nextLayers.find(l => l.id === id)?.locked;
    commit(`${label} ${id}`, {
      layers: nextLayers,
      activeLayerId: stillActiveLocked ? nextLayers.find(l => !l.locked)?.id ?? activeLayerId : undefined,
    });
  }, [layers, activeLayerId, commit]);

  const removeLayer = useCallback((id: string) => {
    if (layers.length <= 1 || allObjects.some(o => o.layerId === id)) return false;
    const nextLayers = layers.filter(l => l.id !== id);
    commit(`Supprimer calque ${id}`, {
      layers: nextLayers,
      activeLayerId: activeLayerId === id ? nextLayers[0].id : undefined,
    });
    return true;
  }, [layers, allObjects, activeLayerId, commit]);

  const setActiveLayerId = useCallback((id: string) => {
    const layer = layers.find(l => l.id === id);
    if (!layer || layer.locked) return;
    setState(s => ({ ...s, activeLayerId: id }));
  }, [layers]);

  const addDimension = useCallback((targetId: string) => {
    const target = allObjects.find(o => o.id === targetId);
    if (!target) return null;
    const style: DimensionStyle | undefined = supportedDimensionStyles(target)[0];
    if (!style) return null;
    const id = `OBJ-${String(state.counter + 1).padStart(4, '0')}`;
    const dim: CadObject = {
      id,
      name: `Cote ${target.name}`,
      kind: 'dimension',
      classification: target.classification,
      layerId: target.layerId,
      hatch: 'none',
      createdSeq: current.seq,
      ...(target.levelId ? { levelId: target.levelId } : {}),
      targetId,
      style,
      offset: 40,
    };
    commit(`Coter ${targetId}`, { objects: [...allObjects, dim], counter: state.counter + 1 });
    setSelectedId(id);
    return id;
  }, [allObjects, state.counter, current.seq, commit, setSelectedId]);

  const createBlockFromObject = useCallback((objectId: string) => {
    const source = allObjects.find(o => o.id === objectId);
    if (!source || (source.kind !== 'line' && source.kind !== 'rect' && source.kind !== 'circle' && source.kind !== 'arc' && source.kind !== 'polyline')) return null;
    const blockId = `BLQ-${String(state.blockCounter + 1).padStart(4, '0')}`;
    const origin = primitiveOrigin(source);
    const primitive = localizePrimitive(source, origin, blockId);
    const block: BlockDef = { id: blockId, name: `${source.name} — définition`, primitives: [primitive] };
    const refId = `OBJ-${String(state.counter + 1).padStart(4, '0')}`;
    const ref: CadObject = {
      ...source,
      id: refId,
      name: `${source.name} — occurrence`,
      kind: 'blockRef',
      blockId,
      x: origin.x,
      y: origin.y,
      scale: 1,
      hatch: 'none',
      createdSeq: current.seq,
    };
    commit(`Créer bloc ${blockId}`, {
      objects: allObjects.map(o => (o.id === objectId ? ref : o)),
      blocks: [...blocks, block],
      counter: state.counter + 1,
      blockCounter: state.blockCounter + 1,
    });
    setSelectedId(refId);
    return blockId;
  }, [allObjects, blocks, state.blockCounter, state.counter, current.seq, commit, setSelectedId]);

  const insertBlock = useCallback((blockId: string, x: number, y: number) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return null;
    const id = `OBJ-${String(state.counter + 1).padStart(4, '0')}`;
    const ref: CadObject = stampLevel({
      id,
      name: `${block.name} — occurrence`,
      kind: 'blockRef',
      classification: 'non-classifie',
      layerId: activeLayerId,
      hatch: 'none',
      createdSeq: current.seq,
      blockId,
      x,
      y,
      scale: 1,
    } as CadObject);
    commit(`Insérer bloc ${blockId}`, { objects: [...allObjects, ref], counter: state.counter + 1 });
    setSelectedId(id);
    return id;
  }, [blocks, state.counter, activeLayerId, current.seq, allObjects, commit, setSelectedId, stampLevel]);

  const importObjects = useCallback((importedObjects: CadObject[], importedLayers: Layer[], label = 'Importer DXF') => {
    if (importedObjects.length === 0) return 0;
    const mergedLayers = [...layers];
    for (const layer of importedLayers) {
      if (!mergedLayers.some(l => l.id === layer.id || l.name.toLocaleLowerCase('fr-FR') === layer.name.toLocaleLowerCase('fr-FR'))) {
        mergedLayers.push(layer);
      }
    }
    const layerIdAlias = new Map<string, string>();
    for (const layer of importedLayers) {
      const existing = layers.find(l => l.name.toLocaleLowerCase('fr-FR') === layer.name.toLocaleLowerCase('fr-FR'));
      layerIdAlias.set(layer.id, existing?.id ?? layer.id);
    }
    const stamped = importedObjects.map(o => stampLevel({
      ...o,
      layerId: layerIdAlias.get(o.layerId) ?? o.layerId,
      createdSeq: current.seq,
    } as CadObject));
    commit(label, {
      objects: [...allObjects, ...stamped],
      layers: mergedLayers,
      counter: Math.max(state.counter, ...stamped.map(o => numericSuffix(o.id, 'OBJ'))),
      layerCounter: Math.max(state.layerCounter, ...mergedLayers.map(l => numericSuffix(l.id, 'LAY'))),
    });
    setSelectedId(stamped[stamped.length - 1]?.id ?? null);
    return stamped.length;
  }, [layers, allObjects, state.counter, state.layerCounter, current.seq, commit, setSelectedId, stampLevel]);

  /** Bloc de la bibliothèque bâtiment : ajouté au projet s'il n'y est pas encore ; son identifiant. */
  const addLibraryBlock = useCallback((key: string) => {
    const it = libraryItem(key);
    if (!it) return null;
    const existing = blocks.find(b => b.libraryKey === key);
    if (existing) return existing.id;
    const blockId = `BLQ-${String(state.blockCounter + 1).padStart(4, '0')}`;
    commit(`Ajouter ${it.name} (bibliothèque) ${blockId}`, {
      blocks: [...blocks, libraryBlock(it, blockId, activeLayerId)],
      blockCounter: state.blockCounter + 1,
    });
    return blockId;
  }, [blocks, state.blockCounter, activeLayerId, commit]);

  const removeBlock = useCallback((blockId: string) => {
    commit(`Supprimer bloc ${blockId}`, {
      blocks: blocks.filter(b => b.id !== blockId),
      objects: allObjects.filter(o => !(o.kind === 'blockRef' && o.blockId === blockId)),
    });
    const selected = allObjects.find(o => selectedIds.includes(o.id));
    if (selected?.kind === 'blockRef' && selected.blockId === blockId) setSelectedIds([]);
  }, [blocks, allObjects, commit, selectedIds, setSelectedIds]);

  const undo = useCallback(() => setState(s => ({ ...s, pointer: Math.max(0, s.pointer - 1) })), []);
  const redo = useCallback(() => setState(s => ({ ...s, pointer: Math.min(s.versions.length - 1, s.pointer + 1) })), []);

  const goTo = useCallback((index: number) => {
    setState(s => ({ ...s, pointer: Math.max(0, Math.min(s.versions.length - 1, index)) }));
    setSelectedId(null);
  }, [setSelectedId]);

  /** Émet l'indice suivant sur la version affichée (nom et lettre figés) ; sans effet si elle est déjà émise. */
  const issueIndex = useCallback((name: string) => {
    setState(s => {
      if (s.versions[s.pointer].index) return s;
      const index = nextIndexLetter(s.versions, s.pointer);
      return { ...s, versions: s.versions.map((v, i) => (i === s.pointer ? { ...v, named: name, index } : v)) };
    });
  }, []);

  const nameVersion = useCallback((name: string) => {
    setState(s => ({
      ...s,
      versions: s.versions.map((v, i) => (i === s.pointer ? { ...v, named: name } : v)),
    }));
  }, []);

  const reset = useCallback(() => {
    setState(seedProject());
    setSelectedId(null);
  }, [setSelectedId]);

  const loadState = useCallback((next: unknown) => {
    setState(normalizeProjectState(next));
    setSelectedId(null);
  }, [setSelectedId]);

  const canUndo = state.pointer > 0;
  const canRedo = state.pointer < state.versions.length - 1;

  const diagnostics = useMemo(() => {
    const out: { level: 'info' | 'avertissement'; text: string }[] = [];
    const unclassified = allObjects.filter(o => o.classification === 'non-classifie' && o.kind !== 'dimension');
    if (unclassified.length > 0) {
      out.push({ level: 'avertissement', text: `${unclassified.length} objet(s) sans classification métier — lectures indisponibles (${unclassified.map(o => o.id).join(', ')}).` });
    }
    for (const o of allObjects) {
      if (o.kind === 'line' && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) <= GEOMETRY_EPSILON) {
        out.push({ level: 'avertissement', text: `${o.id} : ligne de longueur nulle — géométrie à réparer.` });
      }
      if (o.kind === 'rect' && (o.w <= GEOMETRY_EPSILON || o.h <= GEOMETRY_EPSILON)) {
        out.push({ level: 'avertissement', text: `${o.id} : rectangle dégénéré — géométrie à réparer.` });
      }
      if (o.kind === 'dimension') {
        const target = allObjects.find(t => t.id === o.targetId);
        if (!target) {
          out.push({ level: 'avertissement', text: `${o.id} : cote orpheline — cible ${o.targetId} absente.` });
        } else if (!supportedDimensionStyles(target).includes(o.style)) {
          out.push({ level: 'info', text: `${o.id} : style « ${o.style} » non applicable à ${target.id} — style par défaut utilisé.` });
        }
      }
      if (o.kind === 'blockRef' && !blocks.some(b => b.id === o.blockId)) {
        out.push({ level: 'avertissement', text: `${o.id} : occurrence orpheline — bloc ${o.blockId} absent.` });
      }
    }
    const hidden = layers.filter(l => !l.visible);
    if (hidden.length > 0) out.push({ level: 'info', text: `${hidden.length} calque(s) masqué(s) : ${hidden.map(l => l.name).join(', ')}.` });
    if (state.pointer < state.versions.length - 1) {
      out.push({ level: 'info', text: `Position historique : ${state.versions.length - 1 - state.pointer} microversion(s) en avance — toute modification créera une branche.` });
    }
    if (out.length === 0) out.push({ level: 'info', text: 'Aucun problème détecté sur la révision courante.' });
    return out;
  }, [allObjects, layers, blocks, state.pointer, state.versions.length]);

  // ─── Feuilles et fenêtres ────────────────────────────────────────────────────
  // Identifiants jamais réutilisés, même après suppression puis annulation.
  const versions = state.versions;
  const allSheetIds = useMemo(() => versions.flatMap(v => (v.sheets ?? []).map(sh => sh.id)), [versions]);
  const allViewportIds = useMemo(() => versions.flatMap(v => (v.sheets ?? []).flatMap(sh => sh.viewports.map(vp => vp.id))), [versions]);

  const addSheet = useCallback((format: PaperFormat = 'A3', orientation: Orientation = 'paysage', name?: string) => {
    const id = nextId('FEU', allSheetIds);
    const sheet: Sheet = { id, name: name ?? `Feuille ${id.slice(4).replace(/^0+/, '')} — ${format}`, format, orientation, margins: { ...DEFAULT_MARGINS }, viewports: [] };
    commit(`Créer feuille ${id}`, { sheets: [...sheets, sheet] });
    return id;
  }, [sheets, allSheetIds, commit]);

  const updateSheet = useCallback((id: string, patch: Partial<Omit<Sheet, 'id' | 'viewports'>>, label = 'Modifier feuille') => {
    if (!sheets.some(sh => sh.id === id)) return;
    commit(`${label} ${id}`, { sheets: sheets.map(sh => (sh.id === id ? { ...sh, ...patch } : sh)) });
  }, [sheets, commit]);

  const removeSheet = useCallback((id: string) => {
    if (!sheets.some(sh => sh.id === id)) return;
    commit(`Supprimer feuille ${id}`, { sheets: sheets.filter(sh => sh.id !== id) });
  }, [sheets, commit]);

  /**
   * Ajoute une fenêtre sur la feuille. Par défaut : toute la zone utile, centrée sur l'emprise
   * donnée, à la plus grande échelle normalisée qui la fait tenir.
   */
  const addViewport = useCallback((sheetId: string, vp: Partial<Omit<Viewport, 'id'>> = {}) => {
    const sheet = sheets.find(sh => sh.id === sheetId);
    if (!sheet) return null;
    const id = nextId('FEN', allViewportIds);
    const area = printableArea(sheet);
    const viewport: Viewport = {
      id,
      name: vp.name ?? `Fenêtre ${id.slice(4).replace(/^0+/, '')}`,
      x: vp.x ?? area.x, y: vp.y ?? area.y, w: vp.w ?? area.w, h: vp.h ?? area.h,
      scale: vp.scale ?? STANDARD_SCALES.find(s => s.paper === 1 && s.model === 50)!,
      center: vp.center ?? { x: 0, y: 0 },
      hiddenLayerIds: vp.hiddenLayerIds ?? [],
      // Une fenêtre désigne toujours un niveau existant (par défaut, le niveau affiché).
      levelId: vp.levelId && levels.some(l => l.id === vp.levelId) ? vp.levelId : activeLevelId,
    };
    commit(`Créer fenêtre ${id} sur ${sheetId}`, { sheets: sheets.map(sh => (sh.id === sheetId ? { ...sh, viewports: [...sh.viewports, viewport] } : sh)) });
    return id;
  }, [sheets, allViewportIds, levels, activeLevelId, commit]);

  const updateViewport = useCallback((sheetId: string, id: string, patch: Partial<Omit<Viewport, 'id'>>, label = 'Modifier fenêtre') => {
    const sheet = sheets.find(sh => sh.id === sheetId);
    if (!sheet || !sheet.viewports.some(v => v.id === id)) return;
    commit(`${label} ${id}`, {
      sheets: sheets.map(sh => (sh.id === sheetId ? { ...sh, viewports: sh.viewports.map(v => (v.id === id ? { ...v, ...patch } : v)) } : sh)),
    });
  }, [sheets, commit]);

  const removeViewport = useCallback((sheetId: string, id: string) => {
    const sheet = sheets.find(sh => sh.id === sheetId);
    if (!sheet || !sheet.viewports.some(v => v.id === id)) return;
    commit(`Supprimer fenêtre ${id}`, { sheets: sheets.map(sh => (sh.id === sheetId ? { ...sh, viewports: sh.viewports.filter(v => v.id !== id) } : sh)) });
  }, [sheets, commit]);

  // ─── Profil de dessin (lot 3.1) ──────────────────────────────────────────────
  const profile = profileById(current.profileId);
  const setProfileId = useCallback((id: string) => {
    if (id === profile.id) return;
    commit(`Profil de dessin : ${profileById(id).name}`, { profileId: id });
  }, [profile.id, commit]);

  // ─── Règle de surface des pièces (lot 4.3) ───────────────────────────────────
  const surfaceRule = current.surfaceRule ?? 'sia-416';
  const setSurfaceRule = useCallback((rule: 'sia-416' | 'carrez') => {
    if (rule === surfaceRule) return;
    commit(`Règle de surface : ${rule === 'carrez' ? 'loi Carrez' : 'SIA 416'}`, { surfaceRule: rule });
  }, [surfaceRule, commit]);

  // ─── Niveaux (lot 4.4) ───────────────────────────────────────────────────────
  const allLevelIds = useMemo(() => versions.flatMap(v => levelsOf(v.levels).map(l => l.id)), [versions]);

  const setActiveLevelId = useCallback((id: string) => {
    if (!levels.some(l => l.id === id) || id === activeLevelId) return;
    setState(s => ({ ...s, activeLevelId: id }));
    setSelectedIds([]);
  }, [levels, activeLevelId, setSelectedIds]);

  const addLevel = useCallback((name: string, elevation: number) => {
    const id = nextId('NIV', allLevelIds);
    commit(`Créer niveau ${name}`, { levels: [...levels, { id, name, elevation }], activeLevelId: id });
    setSelectedIds([]);
    return id;
  }, [levels, allLevelIds, commit, setSelectedIds]);

  const updateLevel = useCallback((id: string, patch: Partial<Omit<Level, 'id'>>) => {
    if (!levels.some(l => l.id === id)) return;
    commit(`Modifier niveau ${id}`, { levels: levels.map(l => (l.id === id ? { ...l, ...patch } : l)) });
  }, [levels, commit]);

  /** Supprime un niveau et ses objets ; le dernier niveau ne se supprime pas. */
  const removeLevel = useCallback((id: string) => {
    if (levels.length <= 1 || !levels.some(l => l.id === id)) return false;
    const rest = levels.filter(l => l.id !== id);
    const kept = allObjects.filter(o => levelIdOf(o) !== id);
    const gone = new Set(allObjects.filter(o => levelIdOf(o) === id).map(o => o.id));
    // Une cote ou une ouverture qui dépendait d'un objet supprimé part avec lui.
    const objectsLeft = kept.filter(o => !(o.kind === 'dimension' && gone.has(o.targetId)) && !(o.kind === 'opening' && gone.has(o.hostId)));
    commit(`Supprimer niveau ${id}`, {
      levels: rest,
      objects: objectsLeft,
      sheets: sheets.map(sh => ({ ...sh, viewports: sh.viewports.map(v => (levelIdOf(v) === id ? { ...v, levelId: levelsOf(rest)[0].id } : v)) })),
      activeLevelId: activeLevelId === id ? levelsOf(rest)[0].id : undefined,
    });
    setSelectedIds([]);
    return true;
  }, [levels, allObjects, sheets, activeLevelId, commit, setSelectedIds]);

  /** Crée un niveau à partir d'un autre : mêmes objets, identifiants neufs, à l'altitude donnée. */
  const copyLevel = useCallback((fromId: string, name: string, elevation: number) => {
    if (!levels.some(l => l.id === fromId)) return null;
    const id = nextId('NIV', allLevelIds);
    const { objects: copies, counter } = copyLevelObjects(allObjects, fromId, id, state.counter, current.seq);
    commit(`Copier niveau ${levels.find(l => l.id === fromId)!.name} vers ${name}`, {
      levels: [...levels, { id, name, elevation }],
      objects: [...allObjects, ...copies],
      counter,
      activeLevelId: id,
    });
    setSelectedIds([]);
    return id;
  }, [levels, allLevelIds, allObjects, state.counter, current.seq, commit, setSelectedIds]);

  return {
    levels, activeLevelId, setActiveLevelId, addLevel, updateLevel, removeLevel, copyLevel, allObjects,
    profile, setProfileId, surfaceRule, setSurfaceRule,
    state, objects, layers, blocks, activeLayerId, sheets,
    addSheet, updateSheet, removeSheet, addViewport, updateViewport, removeViewport,
    current, versions: state.versions, pointer: state.pointer,
    selectedId, selectedIds, setSelectedId, setSelectedIds,
    addObject, updateObject, removeObject, removeObjects,
    transformObjects, duplicateObjects, addCopies, applyEdit, applyPatches,
    addLayer, updateLayer, removeLayer, setActiveLayerId,
    addDimension, createBlockFromObject, insertBlock, importObjects, removeBlock, addLibraryBlock,
    undo, redo, goTo, canUndo, canRedo, nameVersion, issueIndex, reset, loadState,
    diagnostics,
  };
}
