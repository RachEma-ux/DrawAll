// Export SVG d'une feuille (lot 6.4) : SVG autonome aux dimensions exactes de la feuille (largeur et
// hauteur en mm, viewBox en mm papier), fenêtres découpées et dessinées comme à l'écran (mêmes formes,
// tailles papier), cartouche ; monochrome sur fond blanc, comme le PDF. Les fonds de plan, références
// de travail, ne sont pas exportés.
import { renderToStaticMarkup } from 'react-dom/server';
import type { BlockDef, CadObject, Layer, Level, MicroVersion, OpeningObj, Sheet, ViewReading, WallObj } from '@/types/cad';
import { ObjectShape } from '@/components/CanvasView';
import { onLevel, viewportLevelId } from '@/lib/levels';
import { withProfile, withProfileBlocks, type DrawingProfile } from '@/lib/materials';
import { roomPolygons } from '@/lib/rooms';
import { layerVisibleInViewport, printableArea, scaleRatio, sheetSize, viewportModelRect } from '@/lib/sheet';
import { titleBlockFields, titleBlockRect } from '@/lib/titleblock';
import { wallsGeometry } from '@/lib/wall';

export interface SvgInput {
  sheet: Sheet;
  objects: CadObject[];
  levels: Level[];
  layers: Layer[];
  blocks: BlockDef[];
  profile: DrawingProfile;
  view: ViewReading;
  versions: MicroVersion[];
  pointer: number;
}

/** Pixels par mm papier supposés pour les épaisseurs minimales (0,05 mm) : sans effet visible à l'impression. */
const PX_PER_MM = 10;

export function SheetSvg(p: SvgInput) {
  const { sheet } = p;
  const size = sheetSize(sheet.format, sheet.orientation);
  const area = printableArea(sheet);
  const tb = sheet.titleBlock ? titleBlockRect(sheet) : null;
  const fields = sheet.titleBlock ? titleBlockFields(sheet, p.versions, p.pointer) : [];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${size.w}mm`} height={`${size.h}mm`} viewBox={`0 0 ${size.w} ${size.h}`}>
      <title>{`${sheet.id} — ${sheet.name}`}</title>
      <rect x={0} y={0} width={size.w} height={size.h} fill="white" />
      <rect data-cadre="" x={area.x} y={area.y} width={area.w} height={area.h} fill="none" stroke="#000000" strokeWidth={0.5} />
      {sheet.viewports.map(v => {
        const objs = onLevel(p.objects, viewportLevelId(v, p.levels)).filter(o => o.kind !== 'underlay');
        const ctx = v.context ?? 'coupe';
        const drawn = withProfile(objs, p.profile, ctx, p.blocks);
        const blocks = withProfileBlocks(p.blocks, p.profile, ctx);
        const visible = (o: CadObject) => { const l = p.layers.find(x => x.id === o.layerId); return !!l && layerVisibleInViewport(v, l); };
        // Jonctions et pièces calculées à partir des seuls objets que la fenêtre dessine.
        const walls = wallsGeometry(objs.filter((o): o is WallObj => o.kind === 'wall' && visible(o)), objs.filter((o): o is OpeningObj => o.kind === 'opening'));
        const rooms = roomPolygons(objs.filter(visible));
        const m = viewportModelRect(v);
        return (
          <svg key={v.id} data-fenetre={v.id} x={v.x} y={v.y} width={v.w} height={v.h} viewBox={`${m.x} ${m.y} ${m.w} ${m.h}`} preserveAspectRatio="none" overflow="hidden">
            {drawn.filter(visible).map(o => (
              <ObjectShape key={o.id} obj={o} objects={drawn} blocks={blocks} view={p.view} selected={false}
                zoom={PX_PER_MM * scaleRatio(v.scale)} unit="mm" layer={p.layers.find(l => l.id === o.layerId)} colorMode="calque"
                paperScale={v.scale} hatchPrefix={`${v.id}-`} walls={walls} rooms={rooms} />
            ))}
          </svg>
        );
      })}
      {tb && (
        <g data-cartouche="" fontFamily="Helvetica, Arial, sans-serif">
          <rect x={tb.x} y={tb.y} width={tb.w} height={tb.h} fill="white" stroke="#000000" strokeWidth={0.5} />
          {fields.map((f, i) => {
            const cw = tb.w / 4, rh = tb.h / 2;
            const cx = tb.x + (i % 4) * cw, cy = tb.y + Math.floor(i / 4) * rh;
            const fs = f.value.length > 18 ? 2.6 : 3.5;
            const fits = f.value.length * fs * 0.6 <= cw - 3;
            return (
              <g key={f.key}>
                <rect x={cx} y={cy} width={cw} height={rh} fill="none" stroke="#000000" strokeWidth={0.18} />
                <text x={cx + 1.5} y={cy + 4} fontSize={2.5} fill="#000000">{f.label}</text>
                <text x={cx + 1.5} y={cy + 11} fontSize={fs} fill="#000000" {...(fits ? {} : { textLength: cw - 3, lengthAdjust: 'spacingAndGlyphs' })}>{f.value}</text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

/**
 * Couleurs ramenées au noir sur blanc (usage du dessin technique, comme le PDF) : traits, textes et
 * aplats en noir, blancs compris (un trait blanc, couleur 7 d'un DXF, disparaîtrait sur le papier) ;
 * les teintes d'aide à l'écran (rgba) disparaissent. Seuls le papier et le fond du cartouche, écrits
 * avec le mot-clé « white », restent blancs.
 */
export function monochrome(svg: string): string {
  return svg
    .replace(/(stroke|fill)="rgba\([^)]*\)"/g, '$1="none"')
    .replace(/(stroke|fill)="(#[0-9a-fA-F]{3,8})"/g, (_, attr: string) => `${attr}="#000000"`)
    .replace(/(stroke|fill)="(?!none|transparent|url\(|#)([a-z]+)"/g, (m, attr: string, name: string) => (name === 'white' ? m : `${attr}="#000000"`));
}

/** Document SVG autonome de la feuille (déclaration XML comprise). */
export function sheetToSvg(input: SvgInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${monochrome(renderToStaticMarkup(<SheetSvg {...input} />))}\n`;
}
