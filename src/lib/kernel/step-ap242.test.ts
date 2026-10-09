import { describe, expect, it } from 'vitest';
import { toAp242Ed3 } from './step-ap242';

describe('chaînes STEP réencodées (ISO 10303-21, sans noyau)', () => {
  const text = "ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=PRODUCT('Axe Ø 40 🔩 fin','',' ',());\nENDSEC;\nEND-ISO-10303-21;";
  it('plan de base en \\X2\\, caractères au-delà (émoji) en \\X4\\ sur le point de code entier', () => {
    const out = toAp242Ed3(text, 'pièce 🔩.step', new Date('2026-10-09T00:00:00Z'));
    if ('error' in out) throw new Error(out.error);
    expect(out.content).toContain("PRODUCT('Axe \\X2\\00D8\\X0\\ 40 \\X4\\0001F529\\X0\\ fin'");
    expect(out.content).toContain("FILE_NAME('pi\\X2\\00E8\\X0\\ce \\X4\\0001F529\\X0\\.step'");
    // Aucune moitié de paire de substitution isolée.
    expect(out.content).not.toMatch(/D83D|DD29/);
    expect(out.content).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('barre oblique inverse doublée dans les chaînes d’en-tête (elle ouvre une directive)', () => {
    const out = toAp242Ed3(text, 'A\\B.step', new Date('2026-10-09T00:00:00Z'));
    if ('error' in out) throw new Error(out.error);
    expect(out.content).toContain("FILE_NAME('A\\\\B.step'");
  });
});
