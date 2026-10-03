// Inspecteur — repère permanent UX1 : propriétés typées, unités explicites (T03),
// « un objet, deux lectures » (Concept §1) et paramètres géométriques éditables.
import type { CadObject, Classification, DisplayLevel, ViewReading } from '@/types/cad';
import { CLASSIFICATION_META, KIND_LABEL, dimensionOf, readingFor } from '@/types/cad';

interface Props {
  obj: CadObject | null;
  view: ViewReading;
  level: DisplayLevel;
  onUpdate: (id: string, patch: Partial<CadObject>, label?: string) => void;
  onRemove: (id: string) => void;
}

export default function Inspector({ obj, view, level, onUpdate, onRemove }: Props) {
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

  const num = (v: number, apply: (n: number) => Partial<CadObject>) => (
    <input
      key={v}
      type="number"
      defaultValue={Math.round(v)}
      className="w-full rounded-sm border border-input bg-background px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-cyan-400"
      onBlur={e => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onUpdate(obj.id, apply(n), 'Renseigner paramètre');
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
      { label: 'Largeur (mm)', el: num(obj.w, n => ({ w: Math.max(1, n) })) },
      { label: 'Hauteur (mm)', el: num(obj.h, n => ({ h: Math.max(1, n) })) },
    );
  } else if (obj.kind === 'circle') {
    fields.push(
      { label: 'Centre X (mm)', el: num(obj.cx, n => ({ cx: n })) },
      { label: 'Centre Y (mm)', el: num(obj.cy, n => ({ cy: n })) },
      { label: 'Rayon (mm)', el: num(obj.r, n => ({ r: Math.max(1, n) })) },
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
            <span>{dimensionOf(obj)}</span>
            {level === 'complet' && (<><span>·</span><span>créé à v{obj.createdSeq}</span></>)}
          </div>
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
              <div className="flex justify-between border-b border-border/50 py-1"><span className="text-muted-foreground">longueur/hors-tout</span><span>{dimensionOf(obj)}</span></div>
              <div className="flex justify-between border-b border-border/50 py-1"><span className="text-muted-foreground">unité</span><span>millimètre (SI)</span></div>
              <div className="flex justify-between border-b border-border/50 py-1"><span className="text-muted-foreground">couche</span><span>{obj.layer}</span></div>
              <div className="flex justify-between py-1"><span className="text-muted-foreground">statut</span><span className="text-emerald-400">validé</span></div>
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
