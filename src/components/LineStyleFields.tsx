// Champs « Trait » : couleur, type et épaisseur. Sur un objet, chaque propriété peut valoir
// « du calque » (valeur absente) ; sur un calque, elle a toujours une valeur.
import type { Layer, LineType } from '@/types/cad';
import { fmt } from '@/types/cad';
import { DEFAULT_LINE_TYPE, DEFAULT_LINE_WEIGHT, LINE_TYPES, LINE_WEIGHTS, lineTypeDef } from '@/lib/linestyle';

export interface LineStyleValue {
  color?: string;
  lineType?: LineType;
  lineWeight?: number;
}

interface Props {
  value: LineStyleValue;
  /** Calque de l'objet : active le choix « du calque ». Absent pour l'édition d'un calque. */
  layer?: Layer;
  onChange: (patch: LineStyleValue, label: string) => void;
  /** Préfixe des libellés accessibles (« objet » ou nom du calque). */
  subject: string;
}

const BY_LAYER = '__calque';

const selectClass = 'w-full rounded-sm border border-border bg-background px-1.5 py-1 font-mono text-[11px] text-foreground';

export default function LineStyleFields({ value, layer, onChange, subject }: Props) {
  const byLayer = layer !== undefined;
  const layerType = layer?.lineType ?? DEFAULT_LINE_TYPE;
  const layerWeight = layer?.lineWeight ?? DEFAULT_LINE_WEIGHT;
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>Couleur</span>
      <span className="flex items-center gap-1">
        <input
          type="color"
          aria-label={`Couleur du trait — ${subject}`}
          value={value.color ?? layer?.color ?? '#8b93a7'}
          onChange={e => onChange({ color: e.target.value }, 'Couleur du trait')}
          className="h-6 w-8 cursor-pointer rounded-sm border border-border bg-transparent"
        />
        {byLayer && (
          value.color === undefined
            ? <span className="font-mono text-[10px]">du calque</span>
            : <button onClick={() => onChange({ color: undefined }, 'Couleur du calque')} className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] hover:text-foreground">du calque</button>
        )}
      </span>

      <span>Type</span>
      <select
        aria-label={`Type de trait — ${subject}`}
        value={value.lineType ?? (byLayer ? BY_LAYER : DEFAULT_LINE_TYPE)}
        onChange={e => onChange({ lineType: e.target.value === BY_LAYER ? undefined : (e.target.value as LineType) }, 'Type de trait')}
        className={selectClass}
      >
        {byLayer && <option value={BY_LAYER}>Du calque ({lineTypeDef(layerType).label})</option>}
        {LINE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label} — ISO {t.iso}</option>)}
      </select>

      <span>Épaisseur</span>
      <select
        aria-label={`Épaisseur du trait — ${subject}`}
        value={value.lineWeight === undefined ? (byLayer ? BY_LAYER : String(DEFAULT_LINE_WEIGHT)) : String(value.lineWeight)}
        onChange={e => onChange({ lineWeight: e.target.value === BY_LAYER ? undefined : Number(e.target.value) }, 'Épaisseur du trait')}
        className={selectClass}
      >
        {byLayer && <option value={BY_LAYER}>Du calque ({fmt(layerWeight)} mm)</option>}
        {LINE_WEIGHTS.map(w => <option key={w} value={String(w)}>{fmt(w)} mm</option>)}
      </select>
    </div>
  );
}
