// Inspecteur — repère permanent UX1 : propriétés typées, unités explicites (T03),
// calques, hachures, cotes associatives, blocs et « un objet, deux lectures ».
import type { BlockDef, CadObject, Classification, DimensionStyle, DisplayLevel, HatchParams, HatchStyle, Layer, OpeningObj, ViewReading, WallObj } from '@/types/cad';
import LineStyleFields from '@/components/LineStyleFields';
import { measureObject } from '@/lib/area';
import { formatLevel, pdimValues } from '@/lib/pdim';
import { containedContours, hatchParamsOf } from '@/lib/hatch';
import { openingFits } from '@/lib/opening';
import { SURFACE_RULES, areaM2, detectRoom, formatM2, type SurfaceRule } from '@/lib/rooms';
import { MATERIALS, effectiveHatch, materialById, profileById, type DrawingProfile } from '@/lib/materials';
import { formatArea, formatLength, type DisplayUnit } from '@/lib/input';
import {
  canHatch,
  CLASSIFICATION_META,
  DIMENSION_LABEL,
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
}

export default function Inspector({ obj, objects, layers, blocks, view, level, onUpdate, onRemove, onCreateBlock, issues = [], displayUnit = 'mm', profile = profileById(undefined), surfaceRule = 'sia-416', onSurfaceRule }: Props) {
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

        {(obj.kind === 'north' || obj.kind === 'section' || obj.kind === 'levelMark') && (() => {
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
              <p className="ui-label mb-1.5">{obj.kind === 'north' ? 'Nord' : obj.kind === 'section' ? 'Repère de coupe' : 'Cote de niveau'}</p>
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
