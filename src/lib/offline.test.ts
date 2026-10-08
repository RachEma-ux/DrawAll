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

  it('avertissement de quota au-delà de 90 %', () => {
    expect(quotaWarning(null)).toBeNull();
    expect(quotaWarning({ usage: 80, quota: 100 })).toBeNull();
    expect(quotaWarning({ usage: 95, quota: 100 })).toMatch(/95 %/);
  });
});
