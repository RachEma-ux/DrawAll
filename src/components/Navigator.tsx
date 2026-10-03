// Navigateur du projet — repère permanent UX1 : objets identifiés, couches, lectures.
import type { CadObject, Classification } from '@/types/cad';
import { CLASSIFICATION_META, KIND_LABEL } from '@/types/cad';

interface Props {
  objects: CadObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const ORDER: Classification[] = ['architecture', 'structure', 'mecanique', 'electrique', 'non-classifie'];

export default function Navigator({ objects, selectedId, onSelect }: Props) {
  const groups = ORDER.map(c => ({
    cls: c,
    meta: CLASSIFICATION_META[c],
    items: objects.filter(o => o.classification === c),
  })).filter(g => g.items.length > 0);

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-title">
        <span>Navigateur du projet</span>
        <span className="font-mono text-[10px] text-cyan-400">{objects.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
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
                onClick={() => onSelect(o.id === selectedId ? null : o.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  o.id === selectedId ? 'bg-cyan-400/10 text-cyan-300' : 'text-foreground/80 hover:bg-accent'
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
        {objects.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Aucun objet. Utilisez les outils de création pour démarrer un dessin libre.
          </p>
        )}
      </div>
      <div className="border-t border-border p-3">
        <p className="ui-label mb-1">Ontologies du projet</p>
        <p className="font-mono text-[10px] leading-relaxed text-muted-foreground/80">
          building.architecture · building.structure<br />
          industry.mechanical · industry.electrical
        </p>
      </div>
    </div>
  );
}
