import { describe, expect, it } from 'vitest';
import type { CadObject, Layer } from '@/types/cad';
import { exportToDxf, parseDxf } from './dxf';

const layers: Layer[] = [
  { id: 'LAY-0001', name: 'Dessin', color: '#22d3ee', visible: true, locked: false },
];

const base = {
  classification: 'non-classifie' as const,
  layerId: 'LAY-0001',
  hatch: 'none' as const,
  createdSeq: 0,
};

describe('interopérabilité DXF', () => {
  it('exporte les entités de base en millimètres', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Ligne', kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { ...base, id: 'OBJ-0002', name: 'Cercle', kind: 'circle', cx: 50, cy: 50, r: 20 },
    ];
    const dxf = exportToDxf(objects, layers, []);
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('CIRCLE');
    expect(dxf).toContain('Dessin');
  });

  it('réimporte un export sans inversion verticale', () => {
    const objects: CadObject[] = [
      { ...base, id: 'OBJ-0001', name: 'Profil', kind: 'polyline', points: [0, 0, 100, 0, 100, 50, 0, 0] },
    ];
    const dxf = exportToDxf(objects, layers, []);
    const parsed = parseDxf(dxf, { objectStart: 10, layerStart: 1, createdSeq: 2, existingLayers: layers });
    expect(parsed.objects).toHaveLength(1);
    expect(parsed.objects[0]).toMatchObject({ kind: 'polyline', layerId: 'LAY-0001' });
    if (parsed.objects[0]?.kind === 'polyline') expect(parsed.objects[0].points).toEqual([0, 0, 100, 0, 100, 50, 0, 0]);
  });

  it('signale les entités non prises en charge', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'ARC', '8', '0', '10', '0', '20', '0', '40', '10',
      '0', 'ENDSEC', '0', 'EOF',
    ].join('\n');
    const parsed = parseDxf(dxf, { objectStart: 0, layerStart: 0, createdSeq: 0, existingLayers: [] });
    expect(parsed.objects).toHaveLength(0);
    expect(parsed.warnings.join(' ')).toContain('ARC');
  });
});
