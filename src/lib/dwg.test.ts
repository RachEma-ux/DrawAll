import { describe, expect, it } from 'vitest';
import { detectDwg, dwgRefusal } from './dwg';

const bytes = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)));

describe('DWG (lot 6.3) — valeur par défaut §7 : reconnu et refusé', () => {
  it('reconnaît la signature et la version', () => {
    expect(detectDwg(bytes('AC1032\0\0\0\0'))).toEqual({ code: 'AC1032', version: 'AutoCAD 2018' });
    expect(detectDwg(bytes('AC1015xxxx'))).toEqual({ code: 'AC1015', version: 'AutoCAD 2000' });
    expect(detectDwg(bytes('AC1099xxxx'))?.version).toMatch(/inconnue/);
  });

  it('un DXF ou un fichier court n’est pas pris pour un DWG', () => {
    expect(detectDwg(bytes('  0\nSECTION'))).toBeNull();
    expect(detectDwg(bytes('AC10'))).toBeNull();
  });

  it('message de refus : nature, raison, marche à suivre', () => {
    const m = dwgRefusal('plan.dwg', { code: 'AC1032', version: 'AutoCAD 2018' });
    expect(m).toContain('fichier DWG (AutoCAD 2018');
    expect(m).toContain('§7');
    expect(m).toContain('DXF');
  });
});
