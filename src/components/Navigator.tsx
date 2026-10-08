// Navigateur du projet — repère permanent UX1 : calques, objets identifiés et blocs.
import type { BlockDef, CadObject, Classification, Layer, Level } from '@/types/cad';
import { CLASSIFICATION_META, KIND_LABEL } from '@/types/cad';
import { useState } from 'react';
import LineStyleFields from '@/components/LineStyleFields';
import { formatElevation } from '@/lib/levels';
import { BUILDING_LIBRARY, LIBRARY_SOURCE } from '@/lib/library';

interface Props {
  objects: CadObject[];
  layers: Layer[];
  blocks: BlockDef[];
  selectedId: string | null;
  activeLayerId: string;
  onSelect: (id: string | null) => void;
  onAddLayer: (name: string) => void;
  onUpdateLayer: (id: string, patch: Partial<Layer>, label?: string) => void;
  onRemoveLayer: (id: string) => boolean;
  onSetActiveLayer: (id: string) => void;
  onInsertBlock: (blockId: string) => void;
  onCreateBlock: (objectId: string) => void;
  onRemoveBlock: (blockId: string) => void;
  /** Bibliothèque bâtiment : ajoute le gabarit au projet et prépare son insertion. */
  onAddLibraryBlock: (key: string) => void;
  /** Calque utilisé par un objet, tous niveaux confondus. */
  layerUsed: (id: string) => boolean;
  levels: Level[];
  activeLevelId: string;
  onSetActiveLevel: (id: string) => void;
  onAddLevel: (name: string, elevation: number) => void;
  onUpdateLevel: (id: string, patch: Partial<Omit<Level, 'id'>>) => void;
  onRemoveLevel: (id: string) => boolean;
  onCopyLevel: (fromId: string, name: string, elevation: number) => void;
  /** Si fourni, affiche un bouton pour plier le panneau. */
  onCollapse?: () => void;
}

const ORDER: Classification[] = ['architecture', 'structure', 'mecanique', 'electrique', 'non-classifie'];

export default function Navigator(p: Props) {
  const [styledLayer, setStyledLayer] = useState<string | null>(null);
  const groups = ORDER.map(c => ({
    cls: c,
    meta: CLASSIFICATION_META[c],
    items: p.objects.filter(o => o.classification === c),
  })).filter(g => g.items.length > 0);
  const selected = p.objects.find(o => o.id === p.selectedId) ?? null;
  const canCreateBlock = !!selected && ['line', 'rect', 'circle', 'arc', 'polyline'].includes(selected.kind);

  const addLayer = () => {
    const name = window.prompt('Nom du nouveau calque', `Calque ${p.layers.length + 1}`);
    if (name?.trim()) p.onAddLayer(name.trim());
  };

  /** Altitude saisie en mètres (virgule acceptée) ; null si annulée ou illisible. */
  const askElevation = (message: string, initialMm: number): number | null => {
    const raw = window.prompt(message, String(initialMm / 1000).replace('.', ','));
    if (raw == null) return null;
    const m = Number(raw.trim().replace(',', '.').replace(/\s*m$/, ''));
    if (!Number.isFinite(m)) { window.alert('Altitude illisible : saisir un nombre de mètres, par exemple 2,80.'); return null; }
    return Math.round(m * 1000);
  };
  const top = p.levels[p.levels.length - 1];
  const addLevel = () => {
    const name = window.prompt('Nom du nouveau niveau', `Niveau ${p.levels.length}`);
    if (!name?.trim()) return;
    const elevation = askElevation('Altitude du plancher (m, par rapport au ±0,00)', top ? top.elevation : 0);
    if (elevation != null) p.onAddLevel(name.trim(), elevation);
  };
  const copyLevel = (l: Level) => {
    const name = window.prompt(`Copier ${l.name} : nom du nouveau niveau`, `${l.name} (copie)`);
    if (!name?.trim()) return;
    const elevation = askElevation('Altitude du plancher du nouveau niveau (m)', top ? top.elevation : l.elevation);
    if (elevation != null) p.onCopyLevel(l.id, name.trim(), elevation);
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-title">
        <span>Navigateur du projet</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-cyan-400">{p.objects.length}</span>
          {p.onCollapse && (
            <button
              onClick={p.onCollapse}
              aria-label="Plier le navigateur du projet"
              title="Plier le navigateur du projet"
              className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-cyan-400/50 hover:text-cyan-300"
            >
              ◂
            </button>
          )}
        </span>
      </div>

      <div className="max-h-32 shrink-0 overflow-y-auto border-b border-border" aria-label="Niveaux">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="ui-label">Niveaux</span>
          <button onClick={addLevel} className="font-mono text-[10px] text-cyan-300 hover:text-cyan-200">+ niveau</button>
        </div>
        {[...p.levels].reverse().map(l => (
          <div key={l.id} data-level={l.id} className={`flex items-center gap-1.5 border-t border-border/40 px-2 py-1 ${l.id === p.activeLevelId ? 'bg-cyan-400/5' : ''}`}>
            <button
              onClick={() => p.onSetActiveLevel(l.id)}
              aria-label={`Afficher le niveau ${l.name}`}
              aria-pressed={l.id === p.activeLevelId}
              title="Niveau affiché et édité"
              className={`font-mono text-[10px] ${l.id === p.activeLevelId ? 'text-cyan-300' : 'text-muted-foreground'}`}
            >
              {l.id === p.activeLevelId ? '◉' : '○'}
            </button>
            <button
              onClick={() => { const n = window.prompt('Nom du niveau', l.name); if (n?.trim() && n.trim() !== l.name) p.onUpdateLevel(l.id, { name: n.trim() }); }}
              title="Renommer le niveau"
              className="min-w-0 truncate text-left text-xs text-foreground/85 hover:text-cyan-200"
            >
              {l.name}
            </button>
            <button
              onClick={() => { const e = askElevation(`Altitude de ${l.name} (m)`, l.elevation); if (e != null && e !== l.elevation) p.onUpdateLevel(l.id, { elevation: e }); }}
              title="Modifier l'altitude du plancher"
              className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            >
              {formatElevation(l.elevation)}
            </button>
            <button
              onClick={() => copyLevel(l)}
              aria-label={`Copier le niveau ${l.name}`}
              title="Copier ce niveau (objets compris) vers un nouveau niveau"
              className="rounded-sm border border-border px-1 font-mono text-[9px] text-muted-foreground hover:text-foreground"
            >
              CPY
            </button>
            <button
              onClick={() => { if (window.confirm(`Supprimer le niveau ${l.name} et tous ses objets ?`)) p.onRemoveLevel(l.id); }}
              disabled={p.levels.length <= 1}
              aria-label={`Supprimer le niveau ${l.name}`}
              title="Supprimer le niveau et ses objets"
              className="rounded-sm border border-red-400/30 px-1 font-mono text-[9px] text-red-400 disabled:opacity-25"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="max-h-44 shrink-0 overflow-y-auto border-b border-border">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="ui-label">Calques</span>
          <button onClick={addLayer} className="font-mono text-[10px] text-cyan-300 hover:text-cyan-200">+ ajouter</button>
        </div>
        {p.layers.map(layer => {
          const used = p.layerUsed(layer.id);
          return (
            <div key={layer.id} className="border-t border-border/40">
            <div className={`flex items-center gap-1.5 px-2 py-1 ${layer.id === p.activeLayerId ? 'bg-cyan-400/5' : ''}`}>
              <button
                onClick={() => p.onSetActiveLayer(layer.id)}
                disabled={layer.locked}
                title={layer.locked ? 'Calque verrouillé' : 'Définir comme calque actif'}
                className={`font-mono text-[10px] ${layer.id === p.activeLayerId ? 'text-cyan-300' : 'text-muted-foreground'} disabled:opacity-30`}
              >
                {layer.id === p.activeLayerId ? '◉' : '○'}
              </button>
              <button
                onClick={() => setStyledLayer(id => (id === layer.id ? null : layer.id))}
                aria-expanded={styledLayer === layer.id}
                aria-label={`Trait du calque ${layer.name}`}
                title="Couleur, type et épaisseur du trait"
                className="flex h-4 w-4 items-center justify-center rounded-sm hover:bg-accent"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: layer.color }} />
              </button>
              <span className={`truncate text-xs ${layer.visible ? 'text-foreground/85' : 'text-muted-foreground line-through'}`}>{layer.name}</span>
              <button
                onClick={() => p.onUpdateLayer(layer.id, { visible: !layer.visible }, layer.visible ? 'Masquer calque' : 'Afficher calque')}
                title={layer.visible ? 'Masquer' : 'Afficher'}
                className="ml-auto rounded-sm border border-border px-1 font-mono text-[9px] text-muted-foreground hover:text-foreground"
              >
                {layer.visible ? 'VIS' : 'MAS'}
              </button>
              <button
                onClick={() => p.onUpdateLayer(layer.id, { locked: !layer.locked }, layer.locked ? 'Déverrouiller calque' : 'Verrouiller calque')}
                title={layer.locked ? 'Déverrouiller' : 'Verrouiller'}
                className={`rounded-sm border px-1 font-mono text-[9px] ${layer.locked ? 'border-amber-400/50 text-amber-300' : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {layer.locked ? 'VER' : 'LIB'}
              </button>
              <button
                onClick={() => { if (!p.onRemoveLayer(layer.id)) window.alert('Calque utilisé par au moins un objet ou dernier calque restant.'); }}
                disabled={used || p.layers.length <= 1}
                title="Supprimer le calque"
                className="rounded-sm border border-red-400/30 px-1 font-mono text-[9px] text-red-400 disabled:opacity-25"
              >
                ×
              </button>
            </div>
            {styledLayer === layer.id && (
              <div className="px-3 pb-2 pt-1">
                <LineStyleFields
                  value={{ color: layer.color, lineType: layer.lineType, lineWeight: layer.lineWeight }}
                  subject={`calque ${layer.name}`}
                  onChange={(patch, label) => p.onUpdateLayer(layer.id, patch, `${label} du calque`)}
                />
              </div>
            )}
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map(g => (
          <div key={g.cls}>
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.meta.color }} />
              <span className="ui-label">{g.meta.label}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{g.items.length}</span>
            </div>
            {g.items.map(o => (
              <button
                key={o.id}
                onClick={() => p.onSelect(o.id === p.selectedId ? null : o.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  o.id === p.selectedId ? 'bg-cyan-400/10 text-cyan-300' : 'text-foreground/80 hover:bg-accent'
                }`}
              >
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{o.id}</span>
                <span className="truncate text-xs">{o.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  {KIND_LABEL[o.kind]}
                </span>
              </button>
            ))}
          </div>
        ))}
        {p.objects.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Aucun objet. Utilisez les outils de création pour démarrer un dessin libre.
          </p>
        )}
      </div>

      <div className="max-h-36 shrink-0 overflow-y-auto border-t border-border">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="ui-label">Blocs</span>
          <button
            onClick={() => selected && canCreateBlock && p.onCreateBlock(selected.id)}
            disabled={!canCreateBlock}
            title="Convertir la sélection en définition de bloc"
            className="font-mono text-[10px] text-emerald-300 hover:text-emerald-200 disabled:opacity-30"
          >
            + depuis sélection
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-t border-border/40 px-3 py-1.5" title={LIBRARY_SOURCE}>
          <select aria-label="Bibliothèque bâtiment" defaultValue="" onChange={e => { if (e.target.value) { p.onAddLibraryBlock(e.target.value); e.target.value = ''; } }}
            className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 py-0.5 text-[11px] text-foreground">
            <option value="">Bibliothèque bâtiment…</option>
            {BUILDING_LIBRARY.map(it => <option key={it.key} value={it.key}>{it.name} {it.size}</option>)}
          </select>
        </div>
        {p.blocks.map(block => (
          <div key={block.id} className="flex items-center gap-2 border-t border-border/40 px-3 py-1.5">
            <span className="font-mono text-[10px] text-violet-300">{block.id}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{block.name}</span>
            <button onClick={() => p.onInsertBlock(block.id)} className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-cyan-300 hover:bg-cyan-400/10">
              Insérer
            </button>
            <button
              aria-label={`Supprimer le bloc ${block.id}`}
              onClick={() => { if (window.confirm(`Supprimer ${block.id} et ses occurrences ?`)) p.onRemoveBlock(block.id); }}
              className="rounded-sm border border-red-400/30 px-1.5 py-0.5 font-mono text-[9px] text-red-400 hover:bg-red-400/10"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <p className="ui-label mb-1">Ontologies du projet</p>
        <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/80">
          building.architecture · building.structure<br />
          industry.mechanical · industry.electrical
        </p>
      </div>
    </div>
  );
}
