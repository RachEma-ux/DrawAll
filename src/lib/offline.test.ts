import { describe, expect, it } from 'vitest';
import { quotaWarning, shouldResume } from './offline';

describe('hors ligne (lot 7.2)', () => {
  it('reprise depuis IndexedDB seulement si le stockage local a manqué le dernier enregistrement ou est vide', () => {
    const saved = { savedAt: 2, json: '{}', localOk: true };
    expect(shouldResume(null, true)).toBe(false);
    expect(shouldResume(saved, true)).toBe(false);
    expect(shouldResume({ ...saved, localOk: false }, true)).toBe(true);
    expect(shouldResume(saved, false)).toBe(true);
  });

  it('une copie IndexedDB plus ancienne que le dernier enregistrement local ne fait pas revenir en arrière', () => {
    // IndexedDB : enregistrement manqué par le stockage local à t = 2 ; puis le stockage local a réussi
    // à t = 5 alors qu'IndexedDB échouait : l'état local (t = 5) est gardé.
    expect(shouldResume({ savedAt: 2, json: '{}', localOk: false }, true, 5)).toBe(false);
    expect(shouldResume({ savedAt: 7, json: '{}', localOk: false }, true, 5)).toBe(true);
  });

  it('avertissement de quota au-delà de 90 %', () => {
    expect(quotaWarning(null)).toBeNull();
    expect(quotaWarning({ usage: 80, quota: 100 })).toBeNull();
    expect(quotaWarning({ usage: 95, quota: 100 })).toMatch(/95 %/);
  });
});
