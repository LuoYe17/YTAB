import { describe, expect, it, vi } from 'vitest';
import { needsFirstPassphrase, sessionUnlocked, type AccountSession } from './accountSession';

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => null,
      setValue: async () => {},
    }),
  },
}));

function session(partial: Partial<AccountSession> = {}): AccountSession {
  return {
    provider: 'github',
    userId: '1',
    label: 'u',
    token: 't',
    hasBackup: false,
    ...partial,
  };
}

describe('needsFirstPassphrase', () => {
  it('云端已有份则不逼设新口令', () => {
    expect(needsFirstPassphrase(session({ hasBackup: true }))).toBe(false);
    expect(needsFirstPassphrase(session({ hasBackup: false }))).toBe(true);
  });

  it('解开后不再设', () => {
    expect(needsFirstPassphrase(session({ hasBackup: false, rawKey: 'k', salt: 's' }))).toBe(false);
    expect(sessionUnlocked(session({ rawKey: 'k', salt: 's', iter: 210_000 }))).toBe(true);
  });

  it('少了 iter 不算解开：再加密没法原样标次数，宁可不传', () => {
    expect(sessionUnlocked(session({ rawKey: 'k', salt: 's' }))).toBe(false);
  });
});
