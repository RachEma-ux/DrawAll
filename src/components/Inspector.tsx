// Inspecteur — repère permanent UX1 : propriétés typées, unités explicites (T03),
// calques, hachures, cotes associatives, blocs et « un objet, deux lectures ».
import type { BlockDef, CadObject, Classification, DimensionObj, DimensionStyle, DimensionTolerance, DisplayLevel, HatchParams, HatchStyle, Layer, OpeningObj, ProjectionMethod, ViewReading, WallObj, Asset } from '@/types/cad';
import LineStyleFields from '@/components/LineStyleFields';
import { measureObject } from '@/lib/area';
import { formatLevel, pdimValues } from '@/lib/pdim';
import { containedContours, hatchParamsOf, loopOf } from '@/lib/hatch';
import { openingFits } from '@/lib/opening';
import { deviations, fit, formatDeviation, parseClass } from '@/lib/iso286';
import { cutView, materialIntervals, shapeOf } from '@/lib/cuts';
import { bomRows, itemOf } from '@/lib/bom';
import { SURFACE_RULES, areaM2, detectRoom, formatM2, type SurfaceRule } from '@/lib/rooms';
import { MATERIALS, effectiveHatch, materialById, profileById, type DrawingProfile } from '@/lib/materials';
import { formatArea, formatLength, type DisplayUnit } from '@/lib/input';
import {
  canHatch,
  CLASSIFICATION_META,
  DIMENSION_LABEL,
  dimensionMeasure,
  dimensionOf,
  dimensionValue,
  effectiveDimensionStyle,
  fmt,
  HATCH_LABEL,
  KIND_LABEL,
  readingFor,
  supportedDimensionStyles,
} from '@/types/cad';

interface Props {
  obj: CadObject | null;
  objects: CadObject[];
  layers: Layer[];
  blocks: BlockDef[];
  view: ViewReading;
  level: DisplayLevel;
  onUpdate: (id: string, patch: Partial<CadObject>, label?: string) => void;
  onRemove: (id: string) => void;
  onCreateBlock: (id: string) => void;
  /** Diagnostics du projet concernant cet objet (contrôles légers, pas une validation métier). */
  issues?: string[];
  /** Unité d'affichage des mesures. */
  displayUnit?: DisplayUnit;
  /** Profil de dessin actif (motif des matériaux). */
  profile?: DrawingProfile;
  /** Règle de surface des pièces du projet. */
  surfaceRule?: SurfaceRule;
  onSurfaceRule?: (rule: SurfaceRule) => void;
  /** Vues liées d'une face fermée (lot 5.2). */
  onAddViews?: (sourceId: string, depth: number) => void;
  /** Vue en coupe d'une face par un repère de coupe (lot 5.3). */
  onAddCut?: (sourceId: string, markId: string, depth: number) => void;
  /** Nomenclature (lot 5.4) : repère d'une pièce, tableau. */
  onAddBalloon?: (targetId: string) => void;
  onAddBom?: () => void;
  onSelect?: (id: string) => void;
  /** Notes de terrain (lot 7.3) : images du projet, ajout et retrait de photos. */
  assets?: Record<string, Asset>;
  onAddNotePhoto?: (noteId: string, file: File) => void;
  onRemoveNotePhoto?: (noteId: string, assetId: string) => void;
}

export default function Inspector({ obj, objects, layers, blocks, view, level, onUpdate, onRemove, onCreateBlock, issues = [], displayUnit = 'mm', profile = profileById(undefined), surfaceRule = 'sia-416', onSurfaceRule, onAddViews, onAddCut, onAddBalloon, onAddBom, onSelect, assets, onAddNotePhoto, onRemoveNotePhoto }: Props) {
  if (!obj) {
    return (
      <div className="panel flex h-full flex-col">
        <div className="panel-title"><span>Inspecteur</span></div>
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Sélectionnez un objet dans la zone de travail<br />ou dans le navigateur du projet.
          </p>
        </div>
      </div>
    );
  }

  const bat = readingFor(obj, 'batiment');
  const ind = readingFor(obj, 'industrie');
  const layer = layers.find(l => l.id === obj.layerId);
  const isPrimitive = obj.kind === 'line' || obj.kind === 'rect' || obj.kind === 'circle' || obj.kind === 'arc' || obj.kind === 'polyline';

  const num = (v: number, apply: (n: number) => Partial<CadObject>) => (
    <input
      key={v}
      type="number"
      step="any"
      defaultValue={v}
      className="w-full rounded-sm border border-input bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-cyan-400"
      onBlur={e => {
        // Valeur stockée affichée à pleine précision ; un simple passage dans le champ ne réécrit rien.
        const raw = e.target.value.trim().replace(',', '.');
        const n = Number(raw);
        if (raw === '' || !Number.isFinite(n) || n === v) return;
        onUpdate(obj.id, apply(n), 'Renseigner paramètre');
      }}
    />
  );

  const fields: { label: string; el: React.ReactNode }[] = [];
  if (obj.kind === 'line') {
    fields.push(
      { label: 'X1 (mm)', el: num(obj.x1, n => ({ x1: n })) },
      { label: 'Y1 (mm)', el: num(obj.y1, n => ({ y1: n })) },
      { label: 'X2 (mm)', el: num(obj.x2, n => ({ x2: n })) },
      { label: 'Y2 (mm)', el: num(obj.y2, n => ({ y2: n })) },
    );
  } else if (obj.kind === 'rect') {
    fields.push(
      { label: 'X (mm)', el: num(obj.x, n => ({ x: n })) },
      { label: 'Y (mm)', el: num(obj.y, n => ({ y: n })) },
      { label: 'Largeur (mm)', el: num(obj.w, n => ({ w: n > 0 ? n : obj.w })) },
      { label: 'Hauteur (mm)', el: num(obj.h, n => ({ h: n > 0 ? n : obj.h })) },
    );
  } else if (obj.kind === 'circle') {
    fields.push(
      { label: 'Centre X (mm)', el: num(obj.cx, n => ({ cx: n })) },
      { label: 'Centre Y (mm)', el: num(obj.cy, n => ({ cy: n })) },
      { label: 'Rayon (mm)', el: num(obj.r, n => ({ r: n > 0 ? n : obj.r })) },
    );
  } else if (obj.kind === 'arc') {
    fields.push(
      { label: 'Centre X (mm)', el: num(obj.cx, n => ({ cx: n })) },
      { label: 'Centre Y (mm)', el: num(obj.cy, n => ({ cy: n })) },
      { label: 'Rayon (mm)', el: num(obj.r, n => ({ r: n > 0 ? n : obj.r })) },
      { label: 'Début (°)', el: num(obj.start, n => ({ start: n })) },
      { label: 'Fin (°)', el: num(obj.end, n => ({ end: n })) },
    );
  } else if (obj.kind === 'dimension') {
    fields.push({ label: 'Décalage (mm)', el: num(obj.offset, n => ({ offset: n })) });
  } else if (obj.kind === 'blockRef') {
    fields.push(
      { label: 'X (mm)', el: num(obj.x, n => ({ x: n })) },
      { label: 'Y (mm)', el: num(obj.y, n => ({ y: n })) },
      { label: 'Échelle', el: num(obj.scale, n => ({ scale: n > 0 ? n : obj.scale })) },
    );
  } else if (obj.kind === 'text') {
    fields.push(
      { label: 'X (mm)', el: num(obj.x, n => ({ x: n })) },
      { label: 'Y (mm)', el: num(obj.y, n => ({ y: n })) },
      { label: 'Hauteur (mm)', el: num(obj.height, n => ({ height: n > 0 ? n : obj.height })) },
      { label: 'Rotation (°)', el: num(obj.rotation, n => ({ rotation: n })) },
    );
  }

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-title">
        <span>Inspecteur</span>
        <span className="font-mono text-[10px] text-cyan-400">{obj.id}</span>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">

        <div>
          <p className="ui-label mb-1.5">Identité</p>
          <input
            key={obj.id + obj.name}
            defaultValue={obj.name}
            className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-cyan-400"
            onBlur={e => e.target.value.trim() && onUpdate(obj.id, { name: e.target.value.trim() }, 'Renommer')}
          />
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <span>{KIND_LABEL[obj.kind]}</span>
            <span>·</span>
            <span>{obj.kind === 'dimension' ? dimensionValue(obj, objects) : dimensionOf(obj)}</span>
            {level === 'complet' && (<><span>·</span><span>créé à v{obj.createdSeq}</span></>)}
          </div>
        </div>

        <div>
          <p className="ui-label mb-1.5">Calque</p>
          <select
            value={obj.layerId}
            onChange={e => onUpdate(obj.id, { layerId: e.target.value }, 'Changer de calque')}
            className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-cyan-400"
          >
            {layers.map(l => (
              <option key={l.id} value={l.id}>{l.name}{l.locked ? ' — verrouillé' : ''}{!l.visible ? ' — masqué' : ''}</option>
            ))}
          </select>
          {layer && (
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: layer.color }} />
              {layer.id} · {layer.visible ? 'visible' : 'masqué'} · {layer.locked ? 'verrouillé' : 'éditable'}
            </p>
          )}
        </div>

        <div>
          <p className="ui-label mb-1.5">Classification métier</p>
          <div className="grid grid-cols-1 gap-1">
            {(Object.keys(CLASSIFICATION_META) as Classification[]).map(c => (
              <button
                key={c}
                onClick={() => onUpdate(obj.id, { classification: c }, 'Classifier')}
                className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-xs transition-colors ${
                  obj.classification === c
                    ? 'border-cyan-400/60 bg-cyan-400/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: CLASSIFICATION_META[c].color }} />
                {CLASSIFICATION_META[c].label}
                <span className="ml-auto font-mono text-[9px] opacity-60">{CLASSIFICATION_META[c].ontology}</span>
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const m = measureObject(obj);
          if (!m) return null;
          const rows: [string, string][] = m.closed
            ? [['Aire', m.area !== undefined ? formatArea(m.area, displayUnit, fmt) : (m.areaNote ?? 'non évaluée')], ['Périmètre', formatLength(m.length, displayUnit, fmt)]]
            : [['Longueur', formatLength(m.length, displayUnit, fmt)], ...(m.area !== undefined ? [['Emprise', formatArea(m.area, displayUnit, fmt)] as [string, string]] : [])];
          if (m.sectorArea !== undefined) rows.push(['Aire du secteur', formatArea(m.sectorArea, displayUnit, fmt)]);
          if (m.segmentArea !== undefined) rows.push(['Aire du segment', formatArea(m.segmentArea, displayUnit, fmt)]);
          return (
            <div>
              <p className="ui-label mb-1.5">Mesures</p>
              <dl aria-label="Mesures" className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right text-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })()}

        {obj.kind !== 'pdim' && (
          <div>
            <p className="ui-label mb-1.5">Trait (ISO 128-2)</p>
            <LineStyleFields
              value={obj}
              layer={layer}
              subject="objet"
              onChange={(patch, label) => onUpdate(obj.id, patch, label)}
            />
          </div>
        )}

        {obj.kind !== 'dimension' && obj.kind !== 'pdim' && obj.kind !== 'text' && (
          <div>
            <p className="ui-label mb-1.5">Matériau</p>
            <select
              aria-label="Matériau"
              value={obj.materialId ?? ''}
              onChange={e => onUpdate(obj.id, { materialId: e.target.value || undefined }, e.target.value ? `Matériau : ${materialById(e.target.value)?.name}` : 'Retirer le matériau')}
              className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-cyan-400"
            >
              <option value="">— Aucun —</option>
              {MATERIALS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}

        {loopOf(obj) && onAddViews && (() => {
          const existing = objects.find(o => o.kind === 'views' && o.sourceId === obj.id);
          return (
            <div>
              <p className="ui-label mb-1.5">Vues liées</p>
              {existing ? (
                <button onClick={() => onSelect?.(existing.id)} className="w-full rounded-sm border border-border px-2 py-1.5 text-left font-mono text-[10px] text-muted-foreground hover:text-foreground">
                  {existing.id} : vues de dessus et de côté (sélectionner)
                </button>
              ) : (
                <button
                  onClick={() => {
                    const raw = window.prompt('Épaisseur de la pièce (mm) : la face est extrudée sur cette épaisseur', '10');
                    if (raw == null) return;
                    const d = Number(raw.trim().replace(',', '.'));
                    if (d > 0) onAddViews(obj.id, d); else window.alert('Épaisseur illisible : saisir un nombre positif de millimètres.');
                  }}
                  className="w-full rounded-sm border border-cyan-400/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 hover:bg-cyan-400/10"
                >
                  Créer les vues de dessus et de côté
                </button>
              )}
            </div>
          );
        })()}

        {(obj.kind === 'blockRef' || loopOf(obj)) && onAddBalloon && (() => {
          const rows = bomRows(objects, blocks);
          const item = itemOf(rows, obj.id);
          const balloon = objects.find(o => o.kind === 'balloon' && o.targetId === obj.id);
          const table = objects.find(o => o.kind === 'bom');
          return (
            <div className="space-y-1.5">
              <p className="ui-label mb-1.5">Nomenclature</p>
              <label className="block text-[11px] text-muted-foreground">Désignation de pièce
                <input key={`${obj.id}-${obj.part ?? ''}`} aria-label="Désignation de pièce" defaultValue={obj.part ?? ''}
                  placeholder={obj.kind === 'blockRef' ? blocks.find(b => b.id === obj.blockId)?.name ?? '' : 'vide : pas une pièce'}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (obj.part ?? '')) onUpdate(obj.id, { part: v || undefined }, v ? 'Désigner la pièce' : 'Retirer de la nomenclature'); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="mt-0.5 w-full rounded-sm border border-input bg-background px-2 py-1 text-xs" />
              </label>
              {item !== null && <p data-testid="repere-piece" className="font-mono text-[10px] text-foreground/80">Repère {item} · quantité {rows.find(r => r.item === item)!.quantity}</p>}
              {item !== null && !balloon && (
                <button onClick={() => onAddBalloon(obj.id)} className="w-full rounded-sm border border-cyan-400/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 hover:bg-cyan-400/10">
                  Ajouter un repère
                </button>
              )}
              {item !== null && !table && onAddBom && (
                <button onClick={onAddBom} className="w-full rounded-sm border border-border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
                  Insérer la nomenclature
                </button>
              )}
            </div>
          );
        })()}

        {(obj.kind === 'bom' || obj.kind === 'balloon') && (() => {
          const rows = bomRows(objects, blocks);
          return (
            <div className="space-y-1">
              <p className="ui-label mb-1.5">{obj.kind === 'bom' ? 'Nomenclature' : 'Repère de pièce'}</p>
              {obj.kind === 'bom'
                ? <p data-testid="nomenclature-lignes" className="font-mono text-[10px] text-foreground/80">{rows.length} ligne{rows.length > 1 ? 's' : ''} · {rows.reduce((a, r) => a + r.quantity, 0)} pièce{rows.reduce((a, r) => a + r.quantity, 0) > 1 ? 's' : ''} — calculée depuis les pièces du niveau.</p>
                : <p className="font-mono text-[10px] text-foreground/80">Pièce {obj.targetId} · repère {itemOf(rows, obj.targetId) ?? '— (non désignée)'}</p>}
            </div>
          );
        })()}

        {obj.kind === 'note' && (
          <div className="space-y-1.5" data-testid="note-inspecteur">
            <p className="ui-label mb-1.5">Note de terrain</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {new Date(obj.time).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · {obj.targetId ? <>jointe à <button className="text-cyan-300 underline" onClick={() => onSelect?.(obj.targetId!)}>{obj.targetId}</button></> : 'sur un point'}
            </p>
            <textarea key={obj.id} aria-label="Texte de la note" defaultValue={obj.text} rows={3}
              onBlur={e => { const v = e.target.value; if (v !== obj.text) onUpdate(obj.id, { text: v }, 'Modifier la note'); }}
              className="w-full rounded-sm border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground" />
            <div className="grid grid-cols-3 gap-1">
              {(obj.photoIds ?? []).map(id => (
                <figure key={id} className="relative">
                  {assets?.[id]
                    ? <img src={assets[id].dataUrl} alt={`Photo ${assets[id].name}`} className="h-16 w-full rounded-sm object-cover" />
                    : <span className="block h-16 rounded-sm border border-red-400/40 p-1 text-[9px] text-red-300">photo absente</span>}
                  {onRemoveNotePhoto && (
                    <button aria-label={`Retirer la photo ${id}`} onClick={() => onRemoveNotePhoto(obj.id, id)}
                      className="absolute right-0.5 top-0.5 rounded-sm bg-black/70 px-1 text-[10px] text-red-300">×</button>
                  )}
                </figure>
              ))}
            </div>
            {onAddNotePhoto && (
              <label className="block w-full cursor-pointer rounded-sm border border-amber-400/40 px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-amber-300 hover:bg-amber-400/10">
                Ajouter une photo
                <input type="file" accept="image/*" capture="environment" aria-label="Photo de la note" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAddNotePhoto(obj.id, f); }} />
              </label>
            )}
          </div>
        )}

        {obj.kind === 'underlay' && (
          <div className="space-y-1.5">
            <p className="ui-label mb-1.5">Fond de plan</p>
            <p className="font-mono text-[10px] text-muted-foreground">{fmt(obj.w)} × {fmt(obj.h)} mm · à caler avec l’outil « Caler le fond » (deux points, distance réelle).</p>
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              Opacité
              <input type="range" min={10} max={100} step={5} aria-label="Opacité du fond de plan" value={Math.round(obj.opacity * 100)}
                onChange={e => onUpdate(obj.id, { opacity: Number(e.target.value) / 100 }, 'Opacité du fond de plan')} className="w-32" />
            </label>
            <button onClick={() => onUpdate(obj.id, { locked: !obj.locked }, obj.locked ? 'Déverrouiller le fond de plan' : 'Verrouiller le fond de plan')} aria-pressed={!!obj.locked}
              className={`w-full rounded-sm border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${obj.locked ? 'border-amber-400/50 text-amber-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {obj.locked ? 'Verrouillé — déverrouiller' : 'Verrouiller le fond'}
            </button>
          </div>
        )}

        {obj.kind === 'section' && onAddCut && (() => {
          const horizontal = Math.abs(obj.y2 - obj.y1) < 1e-6, vertical = Math.abs(obj.x2 - obj.x1) < 1e-6;
          if (!horizontal && !vertical) return <p className="text-[11px] text-amber-300">Vue en coupe : trace oblique non prise en charge (trace horizontale ou verticale).</p>;
          // Faces fermées traversées par la trace (matière le long de la droite, dans l'étendue de la trace).
          const lo = horizontal ? Math.min(obj.x1, obj.x2) : Math.min(obj.y1, obj.y2), hi = horizontal ? Math.max(obj.x1, obj.x2) : Math.max(obj.y1, obj.y2);
          const faces = objects.filter(o => {
            const shape = shapeOf(o);
            if (!shape || o.kind === 'section') return false;
            const holes = (o.holes ?? []).map(id => objects.find(x => x.id === id)).map(h => (h ? shapeOf(h) : null)).filter((l): l is NonNullable<typeof l> => !!l);
            return materialIntervals([shape, ...holes], horizontal ? 'y' : 'x', horizontal ? obj.y1 : obj.x1).some(([a, b]) => b > lo && a < hi);
          });
          return (
            <div className="space-y-1">
              <p className="ui-label mb-1.5">Vue en coupe {obj.label}–{obj.label}</p>
              {faces.length === 0 && <p className="text-[11px] text-muted-foreground">La trace ne traverse aucune face fermée.</p>}
              {faces.map(f => {
                const existing = objects.find(o => o.kind === 'cut' && o.sourceId === f.id && o.markId === obj.id);
                const views = objects.find((o): o is Extract<CadObject, { kind: 'views' }> => o.kind === 'views' && o.sourceId === f.id);
                return existing ? (
                  <button key={f.id} onClick={() => onSelect?.(existing.id)} className="w-full rounded-sm border border-border px-2 py-1.5 text-left font-mono text-[10px] text-muted-foreground hover:text-foreground">
                    {existing.id} : coupe de {f.id} (sélectionner)
                  </button>
                ) : (
                  <button key={f.id}
                    onClick={() => {
                      let d = views?.depth;
                      if (d === undefined) {
                        const raw = window.prompt(`Épaisseur de ${f.id} (mm)`, '10');
                        if (raw == null) return;
                        d = Number(raw.trim().replace(',', '.'));
                      }
                      if (d > 0) onAddCut(f.id, obj.id, d); else window.alert('Épaisseur illisible : saisir un nombre positif de millimètres.');
                    }}
                    className="w-full rounded-sm border border-cyan-400/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 hover:bg-cyan-400/10">
                    Créer la coupe de {f.id}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {obj.kind === 'cut' && (() => {
          const c = cutView(obj, objects.find(o => o.id === obj.sourceId), objects.find(o => o.id === obj.markId), objects, 0, 0);
          const field = (label: string, value: number, apply: (v: number) => void) => (
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              {label}
              <span className="flex items-center gap-1">
                <input key={`${obj.id}-${label}-${value}`} aria-label={`Coupe — ${label}`} defaultValue={String(value).replace('.', ',')} inputMode="decimal"
                  onBlur={e => { const v = Number(e.target.value.trim().replace(',', '.')); if (Number.isFinite(v) && v !== value) apply(v); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs" /> mm
              </span>
            </label>
          );
          return (
            <div className="space-y-1.5">
              <p className="ui-label mb-1.5">Vue en coupe</p>
              <p className="font-mono text-[10px] text-muted-foreground">Face {obj.sourceId} · repère {obj.markId} — la coupe suit la face et la trace.</p>
              {c.ok
                ? <p data-testid="coupe-matiere" className="font-mono text-[10px] text-foreground/80">{c.value.material.length} surface{c.value.material.length > 1 ? 's' : ''} coupée{c.value.material.length > 1 ? 's' : ''} · {c.value.label.text}</p>
                : <p className="text-[11px] text-amber-300">Non évaluée : {c.error}</p>}
              {field('Épaisseur', obj.depth, v => v > 0 && onUpdate(obj.id, { depth: v }, 'Coupe : épaisseur'))}
              {field('Écart', obj.gap, v => v >= 0 && onUpdate(obj.id, { gap: v }, 'Coupe : écart'))}
              <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                Projection
                <select aria-label="Méthode de projection de la coupe" value={obj.method ?? 'premier-diedre'}
                  onChange={e => onUpdate(obj.id, { method: e.target.value as ProjectionMethod }, 'Coupe : méthode de projection')}
                  className="rounded-sm border border-input bg-background px-1.5 py-1 text-xs">
                  <option value="premier-diedre">Premier dièdre (ISO E)</option>
                  <option value="troisieme-diedre">Troisième dièdre (ISO A)</option>
                </select>
              </label>
            </div>
          );
        })()}

        {obj.kind === 'views' && (() => {
          const field = (label: string, value: number, apply: (v: number) => void) => (
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              {label}
              <span className="flex items-center gap-1">
                <input key={`${obj.id}-${label}-${value}`} aria-label={`Vues — ${label}`} defaultValue={String(value).replace('.', ',')} inputMode="decimal"
                  onBlur={e => { const v = Number(e.target.value.trim().replace(',', '.')); if (Number.isFinite(v) && v !== value) apply(v); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs" /> mm
              </span>
            </label>
          );
          const method = obj.method ?? 'premier-diedre';
          return (
            <div className="space-y-1.5">
              <p className="ui-label mb-1.5">Vues liées</p>
              <p className="font-mono text-[10px] text-muted-foreground">Face : {obj.sourceId} — les vues suivent chaque modification de la face.</p>
              {field('Épaisseur', obj.depth, v => v > 0 && onUpdate(obj.id, { depth: v }, 'Vues : épaisseur'))}
              {field('Écart entre vues', obj.gap, v => v >= 0 && onUpdate(obj.id, { gap: v }, 'Vues : écart'))}
              <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                Projection
                <select aria-label="Méthode de projection des vues" value={method}
                  onChange={e => onUpdate(obj.id, { method: e.target.value as ProjectionMethod }, e.target.value === 'premier-diedre' ? 'Vues : premier dièdre' : 'Vues : troisième dièdre')}
                  className="rounded-sm border border-input bg-background px-1.5 py-1 text-xs">
                  <option value="premier-diedre">Premier dièdre (ISO E)</option>
                  <option value="troisieme-diedre">Troisième dièdre (ISO A)</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-1">
                {([['top', 'Vue de dessus'], ['side', method === 'premier-diedre' ? 'Vue de gauche' : 'Vue de droite']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => onUpdate(obj.id, { [k]: !obj[k] }, `${obj[k] ? 'Masquer' : 'Afficher'} ${label.toLowerCase()}`)} aria-pressed={obj[k]}
                    className={`rounded-sm border px-1.5 py-1.5 font-mono text-[10px] ${obj[k] ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {canHatch(obj) && (
          <div>
            <p className="ui-label mb-1.5">Hachures</p>
            {obj.materialId && materialById(obj.materialId) ? (
              <p className="text-[11px] text-muted-foreground">
                Motif donné par le profil « {profile.name} » ({profile.version}) pour {materialById(obj.materialId)!.name.toLowerCase()} :{' '}
                <span className="text-foreground">{HATCH_LABEL[effectiveHatch(obj, profile)]}</span>. Retirez le matériau pour choisir un motif à la main.
              </p>
            ) : (
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(HATCH_LABEL) as HatchStyle[]).map(h => (
                <button
                  key={h}
                  onClick={() => onUpdate(obj.id, { hatch: h }, 'Appliquer hachures')}
                  className={`rounded-sm border px-2 py-1.5 font-mono text-[10px] ${
                    (obj.hatch ?? 'none') === h ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {HATCH_LABEL[h]}
                </button>
              ))}
            </div>
            )}
            {effectiveHatch(obj, profile) !== 'none' && effectiveHatch(obj, profile) !== 'solid' && (() => {
              const hp = hatchParamsOf(obj);
              const set = (patch: Partial<HatchParams>, label: string) => onUpdate(obj.id, { hatchParams: { ...hp, ...patch } }, label);
              const num = (key: 'angle' | 'spacing' | 'originX' | 'originY', label: string, unitLabel: string, min?: number) => (
                <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  {label}
                  <span className="flex items-center gap-1">
                    <input key={`${obj.id}-${key}-${hp[key] ?? 0}`} aria-label={`Hachures — ${label}`} defaultValue={String(hp[key] ?? 0).replace('.', ',')} inputMode="decimal"
                      onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && (min === undefined || v > min) && v !== (hp[key] ?? 0)) set({ [key]: v }, `Hachures : ${label.toLowerCase()}`); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-16 rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs" />
                    <span className="w-6">{unitLabel}</span>
                  </span>
                </label>
              );
              const candidates = containedContours(obj, objects);
              return (
                <div className="mt-2 space-y-1">
                  {num('angle', 'Angle', '°')}
                  {num('spacing', 'Pas', 'mm', 0)}
                  <div className="grid grid-cols-2 gap-1" role="group" aria-label="Unité du pas">
                    {(['papier', 'modele'] as const).map(u => (
                      <button key={u} onClick={() => set({ unit: u }, u === 'papier' ? 'Hachures : pas papier' : 'Hachures : pas modèle')} aria-pressed={hp.unit === u}
                        className={`rounded-sm border px-2 py-1 font-mono text-[10px] ${hp.unit === u ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {u === 'papier' ? 'Pas papier' : 'Pas modèle'}
                      </button>
                    ))}
                  </div>
                  {num('originX', 'Origine X', 'mm')}
                  {num('originY', 'Origine Y', 'mm')}
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <button disabled={candidates.length === 0} onClick={() => onUpdate(obj.id, { holes: candidates }, 'Hachures : îlots')}
                      className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30">
                      Évider les contours contenus ({candidates.length})
                    </button>
                    {(obj.holes?.length ?? 0) > 0 && (
                      <button onClick={() => onUpdate(obj.id, { holes: undefined }, 'Hachures : sans îlot')}
                        className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                        Retirer les îlots ({obj.holes!.length})
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {obj.kind === 'dimension' && (() => {
          const target = objects.find(o => o.id === obj.targetId);
          const styles = target ? supportedDimensionStyles(target) : [];
          const current = target ? effectiveDimensionStyle(obj.style, target) : null;
          return (
            <div>
              <p className="ui-label mb-1.5">Cote associative</p>
              {styles.length > 0 ? (
                <select
                  value={current ?? styles[0]}
                  onChange={e => onUpdate(obj.id, { style: e.target.value as DimensionStyle }, 'Changer type de cote')}
                  className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-cyan-400"
                >
                  {styles.map(s => <option key={s} value={s}>{DIMENSION_LABEL[s]}</option>)}
                </select>
              ) : (
                <p className="text-[11px] text-amber-300">{target ? `Aucune cote disponible pour un objet de type ${KIND_LABEL[target.kind]}.` : `Cible ${obj.targetId} absente.`}</p>
              )}
              {current === 'radial' && target && (
                <div className="mt-1.5 grid grid-cols-2 gap-1" role="group" aria-label="Rayon ou diamètre">
                  {(['rayon', 'diametre'] as const).map(m => {
                    const active = (obj.radialMode ?? (target.kind === 'circle' ? 'diametre' : 'rayon')) === m;
                    return (
                      <button key={m} onClick={() => onUpdate(obj.id, { radialMode: m }, m === 'rayon' ? 'Coter le rayon' : 'Coter le diamètre')} aria-pressed={active}
                        className={`rounded-sm border px-2 py-1.5 font-mono text-[10px] ${active ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                        {m === 'rayon' ? 'Rayon (R)' : 'Diamètre (Ø)'}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 font-mono text-[9px] text-muted-foreground">Cible : {obj.targetId} · valeur recalculée automatiquement.</p>
              {target && <ToleranceEditor obj={obj} nominal={dimensionMeasure(obj, target)?.value ?? null} onUpdate={onUpdate} />}
            </div>
          );
        })()}

        {obj.kind === 'wall' && (
          <div>
            <p className="ui-label mb-1.5">Mur</p>
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              Épaisseur
              <span className="flex items-center gap-1">
                <input key={`${obj.id}-${obj.thickness}`} aria-label="Épaisseur du mur" defaultValue={String(obj.thickness).replace('.', ',')} inputMode="decimal"
                  onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (v > 0 && v !== obj.thickness) onUpdate(obj.id, { thickness: v }, 'Épaisseur du mur'); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs" /> mm
              </span>
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-1" role="group" aria-label="Justification du mur">
              {([['axe', 'Axe'], ['gauche', 'Nu gauche'], ['droite', 'Nu droit']] as const).map(([k, label]) => (
                <button key={k} onClick={() => onUpdate(obj.id, { justification: k }, `Mur : ${label.toLowerCase()}`)} aria-pressed={obj.justification === k}
                  className={`rounded-sm border px-1.5 py-1.5 font-mono text-[10px] ${obj.justification === k ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {obj.kind === 'room' && (() => {
          const walls = objects.filter((o): o is WallObj => o.kind === 'wall');
          const poly = detectRoom(walls, obj);
          const rule = SURFACE_RULES[surfaceRule];
          return (
            <div className="space-y-1.5">
              <p className="ui-label mb-1.5">Pièce</p>
              <label className="block text-[11px] text-muted-foreground">Nom
                <input key={`${obj.id}-${obj.name}`} aria-label="Nom de la pièce" defaultValue={obj.name}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== obj.name) onUpdate(obj.id, { name: v }, 'Renommer la pièce'); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="mt-0.5 w-full rounded-sm border border-input bg-background px-2 py-1 text-xs" />
              </label>
              <p aria-label="Surface de la pièce" className="font-mono text-sm text-foreground">
                {poly ? formatM2(areaM2(poly)) : 'non évaluée — pièce non fermée par des murs'}
              </p>
              <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                Règle (projet)
                <select aria-label="Règle de surface" value={surfaceRule} onChange={e => onSurfaceRule?.(e.target.value as SurfaceRule)}
                  className="rounded-sm border border-input bg-background px-1.5 py-1 text-xs">
                  {(Object.keys(SURFACE_RULES) as SurfaceRule[]).map(k => <option key={k} value={k}>{SURFACE_RULES[k].label}</option>)}
                </select>
              </label>
              <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">{rule.detail}</p>
            </div>
          );
        })()}

        {(obj.kind === 'north' || obj.kind === 'section' || obj.kind === 'levelMark' || obj.kind === 'roughness') && (() => {
          // Symboles (lot 4.5) : valeurs saisies ; nombre décimal à virgule ou point.
          const numInput = (label: string, value: number, apply: (v: number) => void, unit: string) => (
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              {label}
              <span className="flex items-center gap-1">
                <input key={`${obj.id}-${label}-${value}`} aria-label={label} defaultValue={String(Math.round(value * 1000) / 1000).replace('.', ',')} inputMode="decimal"
                  onBlur={e => { const v = Number(e.target.value.trim().replace(',', '.')); if (Number.isFinite(v) && v !== value) apply(v); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs" /> {unit}
              </span>
            </label>
          );
          return (
            <div className="space-y-1.5">
              <p className="ui-label mb-1.5">{obj.kind === 'north' ? 'Nord' : obj.kind === 'section' ? 'Repère de coupe' : obj.kind === 'roughness' ? 'État de surface' : 'Cote de niveau'}</p>
              {obj.kind === 'roughness' && (
                <>
                  <select aria-label="Procédé de la surface" value={obj.process} onChange={e => onUpdate(obj.id, { process: e.target.value as typeof obj.process }, 'État de surface : procédé')}
                    className="w-full rounded-sm border border-input bg-background px-1.5 py-1 text-xs">
                    <option value="enlevement">Enlèvement de matière exigé</option>
                    <option value="sans-enlevement">Enlèvement interdit</option>
                    <option value="quelconque">Procédé quelconque</option>
                  </select>
                  {numInput('Rugosité Ra', obj.ra ?? 0, v => onUpdate(obj.id, v > 0 ? { ra: v } : { ra: undefined }, 'État de surface : rugosité'), 'µm')}
                  {numInput('Angle du symbole', obj.rotation, v => onUpdate(obj.id, { rotation: v }, 'Orienter l’état de surface'), '°')}
                </>
              )}
              {obj.kind === 'north' && numInput('Angle du nord', obj.rotation, v => onUpdate(obj.id, { rotation: v }, 'Orienter le nord'), '°')}
              {obj.kind === 'levelMark' && numInput('Altitude', obj.elevation / 1000, v => onUpdate(obj.id, { elevation: Math.round(v * 1000) }, 'Cote de niveau : altitude'), 'm')}
              {obj.kind === 'section' && (
                <>
                  <label className="block text-[11px] text-muted-foreground">Repère
                    <input key={`${obj.id}-${obj.label}`} aria-label="Repère de la coupe" defaultValue={obj.label}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== obj.label) onUpdate(obj.id, { label: v }, 'Repère de coupe'); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="mt-0.5 w-full rounded-sm border border-input bg-background px-2 py-1 text-xs" />
                  </label>
                  <button onClick={() => onUpdate(obj.id, { flip: !obj.flip }, 'Inverser le sens de la coupe')}
                    className="w-full rounded-sm border border-border px-1.5 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                    Inverser le sens de la vue
                  </button>
                </>
              )}
              <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">Taille fixe sur le papier : le symbole garde ses dimensions à toutes les échelles.</p>
            </div>
          );
        })()}

        {obj.kind === 'opening' && (() => {
          const host = objects.find(o => o.id === obj.hostId);
          const num = (key: 'width' | 'position', label: string) => (
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              {label}
              <span className="flex items-center gap-1">
                <input key={`${obj.id}-${key}-${obj[key]}`} aria-label={`Ouverture — ${label}`} defaultValue={String(Math.round(obj[key] * 1000) / 1000).replace('.', ',')} inputMode="decimal"
                  onBlur={e => {
                    const v = Number(e.target.value.replace(',', '.'));
                    if (!Number.isFinite(v) || v === obj[key] || host?.kind !== 'wall') return;
                    const next = { position: obj.position, width: obj.width, [key]: v };
                    if (!openingFits(next, host)) onUpdate(obj.id, { [key]: v }, `Ouverture : ${label.toLowerCase()}`);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs" /> mm
              </span>
            </label>
          );
          const toggle = <K extends 'type' | 'hinge' | 'side'>(key: K, values: readonly [OpeningObj[K], string][]) => (
            <div className="grid grid-cols-2 gap-1">
              {values.map(([v, label]) => (
                <button key={String(v)} onClick={() => onUpdate(obj.id, { [key]: v } as Partial<CadObject>, `Ouverture : ${label.toLowerCase()}`)} aria-pressed={obj[key] === v}
                  className={`rounded-sm border px-1.5 py-1 font-mono text-[10px] ${obj[key] === v ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          );
          return (
            <div className="space-y-1">
              <p className="ui-label mb-1.5">Ouverture — mur {obj.hostId}</p>
              {toggle('type', [['porte', 'Porte'], ['fenetre', 'Fenêtre']])}
              {num('width', 'Largeur')}
              {num('position', 'Position')}
              {obj.type === 'porte' && toggle('hinge', [['debut', 'Charnière début'], ['fin', 'Charnière fin']])}
              {obj.type === 'porte' && toggle('side', [['droite', 'Ouvre à droite'], ['gauche', 'Ouvre à gauche']])}
              <p className="font-mono text-[9px] text-muted-foreground">Position : centre de la baie depuis le début du mur. L’ouverture suit son mur.</p>
            </div>
          );
        })()}

        {obj.kind === 'pdim' && (() => {
          const values = pdimValues(obj);
          const label = { chain: 'En série', baseline: 'Cumulée', angular: 'Angulaire', level: 'Niveau' }[obj.mode];
          const shown = obj.mode === 'angular' ? values.map(v => `${fmt(v)}°`) : obj.mode === 'level' ? values.map(formatLevel) : values.map(v => `${fmt(v)} mm`);
          return (
            <div>
              <p className="ui-label mb-1.5">Cote par points — {label}</p>
              <p aria-label="Valeurs de la cote" className="font-mono text-[11px] text-foreground">{shown.join(' · ') || 'points insuffisants'}</p>
              <label className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                {obj.mode === 'angular' ? 'Rayon de l’arc' : obj.mode === 'level' ? 'Longueur du repère' : 'Décalage'}
                <input key={`${obj.id}-${obj.offset}`} aria-label="Décalage de la cote" defaultValue={String(obj.offset).replace('.', ',')} inputMode="decimal"
                  onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v !== obj.offset) onUpdate(obj.id, { offset: v }, 'Décaler la cote'); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs" />
              </label>
              <p className="mt-1 font-mono text-[9px] text-muted-foreground">Cote non associative : sa valeur vient de ses {obj.points.length / 2} points.</p>
            </div>
          );
        })()}

        {obj.kind === 'blockRef' && (
          <div>
            <p className="ui-label mb-1.5">Définition de bloc</p>
            <select
              value={obj.blockId}
              onChange={e => onUpdate(obj.id, { blockId: e.target.value }, 'Changer définition de bloc')}
              className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-cyan-400"
            >
              {blocks.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
          </div>
        )}

        {obj.kind === 'text' && (
          <div>
            <p className="ui-label mb-1.5">Texte</p>
            <textarea
              key={`${obj.id}-${obj.content}`}
              defaultValue={obj.content}
              rows={Math.min(6, obj.content.split('\n').length + 1)}
              aria-label="Contenu du texte"
              className="w-full resize-y rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-cyan-400"
              onBlur={e => {
                const value = e.target.value.replace(/\s+$/, '');
                if (value.trim() && value !== obj.content) onUpdate(obj.id, { content: value }, 'Modifier texte');
              }}
            />
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {(['left', 'center', 'right'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => onUpdate(obj.id, { align: a }, 'Aligner texte')}
                  className={`rounded-sm border px-2 py-1.5 font-mono text-[10px] ${obj.align === a ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  {a === 'left' ? 'Gauche' : a === 'center' ? 'Centre' : 'Droite'}
                </button>
              ))}
            </div>
          </div>
        )}

        {fields.length > 0 && (
          <div>
            <p className="ui-label mb-1.5">Paramètres géométriques</p>
            <div className="grid grid-cols-2 gap-2">
              {fields.map(f => (
                <div key={f.label}>
                  <p className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">{f.label}</p>
                  {f.el}
                </div>
              ))}
            </div>
          </div>
        )}

        {isPrimitive && (
          <button
            onClick={() => onCreateBlock(obj.id)}
            className="w-full rounded-sm border border-violet-400/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-violet-300 transition-colors hover:bg-violet-400/10"
          >
            Convertir en bloc réutilisable
          </button>
        )}

        <div>
          <p className="ui-label mb-1.5">Un objet, deux lectures</p>
          <div className={`rounded-sm border p-2 ${view === 'batiment' ? 'border-cyan-400/50 bg-cyan-400/5' : 'border-border opacity-70'}`}>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-cyan-400">Vue bâtiment</p>
            <p className="mt-0.5 text-xs font-medium">{bat.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{bat.detail}</p>
          </div>
          <div className={`mt-1.5 rounded-sm border p-2 ${view === 'industrie' ? 'border-emerald-400/50 bg-emerald-400/5' : 'border-border opacity-70'}`}>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-400">Vue industrie</p>
            <p className="mt-0.5 text-xs font-medium">{ind.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{ind.detail}</p>
          </div>
          <p className="mt-1.5 font-mono text-[9px] leading-relaxed text-muted-foreground/60">
            Même identité {obj.id} — aucune conversion ni duplication entre les lectures.
          </p>
        </div>

        {level === 'complet' && (
          <div>
            <p className="ui-label mb-1.5">Propriétés typées</p>
            <div className="space-y-1 font-mono text-[10px]">
              <div className="flex justify-between border-b border-border/50 py-1"><span className="text-muted-foreground">longueur/hors-tout</span><span>{obj.kind === 'dimension' ? dimensionValue(obj, objects) : dimensionOf(obj)}</span></div>
              <div className="flex justify-between border-b border-border/50 py-1"><span className="text-muted-foreground">unité</span><span>millimètre (SI)</span></div>
              <div className="flex justify-between border-b border-border/50 py-1"><span className="text-muted-foreground">calque</span><span>{layer?.name ?? obj.layerId}</span></div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">contrôles</span>
                {issues.length > 0
                  ? <span className="text-amber-300">{issues.length} problème{issues.length > 1 ? 's' : ''}</span>
                  : <span className="text-muted-foreground">aucun problème détecté</span>}
              </div>
              {issues.map(text => <p key={text} className="text-[10px] leading-relaxed text-amber-300/90">{text}</p>)}
              <p className="pt-1 text-[9px] leading-relaxed text-muted-foreground/60">Contrôles géométriques légers — ce n'est pas une validation métier.</p>
            </div>
          </div>
        )}

        <button
          onClick={() => onRemove(obj.id)}
          className="w-full rounded-sm border border-red-400/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-red-400 transition-colors hover:bg-red-400/10"
        >
          Supprimer {obj.id}
        </button>
        <p className="text-center font-mono text-[9px] text-muted-foreground/50">
          La suppression crée une microversion — réversible via l'historique.
        </p>
      </div>
    </div>
  );
}

/** Tolérance d'une cote (lot 5.1) : ±, écarts saisis, classe ISO 286 ou ajustement alésage / arbre. */
function ToleranceEditor({ obj, nominal, onUpdate }: { obj: DimensionObj; nominal: number | null; onUpdate: (id: string, patch: Partial<CadObject>, label?: string) => void }) {
  const t = obj.tolerance;
  const kind = t?.kind ?? 'aucune';
  const num = (v: string) => Number(v.trim().replace(',', '.').replace('−', '-'));
  const field = (label: string, value: string, apply: (v: string) => void, width = 'w-20') => (
    <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      {label}
      <input key={`${obj.id}-${label}-${value}`} aria-label={`Tolérance — ${label}`} defaultValue={value}
        onBlur={e => { if (e.target.value.trim() !== value) apply(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={`${width} rounded-sm border border-input bg-background px-1.5 py-1 text-right font-mono text-xs`} />
    </label>
  );
  const set = (tol: DimensionTolerance | undefined, label: string) => onUpdate(obj.id, { tolerance: tol }, label);
  const choose = (k: string) => {
    if (k === 'aucune') set(undefined, 'Cote sans tolérance');
    else if (k === 'symetrique') set({ kind: 'symetrique', value: 0.1 }, 'Tolérance ±');
    else if (k === 'ecarts') set({ kind: 'ecarts', upper: 0.1, lower: 0 }, 'Tolérance par écarts');
    else if (k === 'classe') set({ kind: 'classe', cls: 'H7' }, 'Tolérance ISO 286');
    else set({ kind: 'ajustement', hole: 'H7', shaft: 'g6' }, 'Ajustement ISO 286');
  };
  const iso = (() => {
    if (nominal === null || !t) return null;
    if (t.kind === 'classe') {
      const c = parseClass(t.cls);
      const d = c ? deviations(nominal, c) : { ok: false as const, error: `Classe illisible : « ${t.cls} ».` };
      return d.ok ? `Écarts ${formatDeviation(d.value.upper)} / ${formatDeviation(d.value.lower)} mm (IT${c!.grade})` : d.error;
    }
    if (t.kind === 'ajustement') {
      const f = fit(nominal, t.hole, t.shaft);
      if (!f.ok) return f.error;
      const v = f.value;
      const nature = v.type === 'jeu' ? 'avec jeu' : v.type === 'serrage' ? 'avec serrage' : 'incertain';
      return `Alésage ${formatDeviation(v.hole.upper)} / ${formatDeviation(v.hole.lower)} · arbre ${formatDeviation(v.shaft.upper)} / ${formatDeviation(v.shaft.lower)} mm — ajustement ${nature} : jeu de ${formatDeviation(v.minClearance)} à ${formatDeviation(v.maxClearance)} mm`;
    }
    return null;
  })();
  return (
    <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
      <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        Tolérance
        <select aria-label="Tolérance de la cote" value={kind} onChange={e => choose(e.target.value)}
          className="rounded-sm border border-input bg-background px-1.5 py-1 text-xs">
          <option value="aucune">Aucune</option>
          <option value="symetrique">± symétrique</option>
          <option value="ecarts">Écarts supérieur / inférieur</option>
          <option value="classe">Classe ISO 286</option>
          <option value="ajustement">Ajustement ISO 286</option>
        </select>
      </label>
      {t?.kind === 'symetrique' && field('± (mm)', String(t.value).replace('.', ','), v => { const n = num(v); if (n > 0) set({ kind: 'symetrique', value: n }, 'Tolérance ±'); })}
      {t?.kind === 'ecarts' && (
        <>
          {field('Écart supérieur (mm)', String(t.upper).replace('.', ','), v => { const n = num(v); if (Number.isFinite(n) && n > t.lower) set({ ...t, upper: n }, 'Écart supérieur'); })}
          {field('Écart inférieur (mm)', String(t.lower).replace('.', ','), v => { const n = num(v); if (Number.isFinite(n) && n < t.upper) set({ ...t, lower: n }, 'Écart inférieur'); })}
        </>
      )}
      {t?.kind === 'classe' && field('Classe (H7, g6…)', t.cls, v => set({ kind: 'classe', cls: v.trim() }, 'Classe ISO 286'), 'w-16')}
      {t?.kind === 'ajustement' && (
        <>
          {field('Alésage (H7…)', t.hole, v => set({ ...t, hole: v.trim() }, 'Ajustement : alésage'), 'w-16')}
          {field('Arbre (g6…)', t.shaft, v => set({ ...t, shaft: v.trim() }, 'Ajustement : arbre'), 'w-16')}
        </>
      )}
      {iso && <p data-testid="tolerance-iso" className="font-mono text-[10px] leading-relaxed text-foreground/80">{iso}</p>}
      {(t?.kind === 'classe' || t?.kind === 'ajustement') && <p className="font-mono text-[9px] text-muted-foreground">ISO 286-1 : tailles jusqu’à 500 mm ; positions d à p (arbres), D à P (alésages).</p>}
    </div>
  );
}
