import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelAccountBackup,
  flushAccountBackup,
  scheduleAccountBackup,
} from './accountBackup';
import type { AccountSession } from './accountSession';
import { createEmptyState, type AppItem } from './types';

const { stored, putBackup } = vi.hoisted(() => ({
  stored: { value: null as AccountSession | null },
  putBackup: vi.fn(async () => undefined),
}));

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => stored.value,
      setValue: async (next: AccountSession | null) => {
        stored.value = next;
      },
    }),
  },
}));

vi.mock('./accountApi', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./accountApi')>();
  return { ...orig, putBackup };
});

function app(id: string): AppItem {
  return { id, kind: 'app', name: id, url: `https://${id}.example`, icon: '' };
}

function unlocked(): AccountSession {
  return {
    provider: 'github',
    userId: '1',
    label: 'u',
    token: 't',
    hasBackup: true,
    rawKey: 'k',
    salt: 's',
    iter: 210_000,
  };
}

describe('scheduleAccountBackup', () => {
  afterEach(() => {
    cancelAccountBackup();
    stored.value = null;
    putBackup.mockClear();
    vi.useRealTimers();
  });

  it('未完成首次启动则取消待传，避免空网格盖住云端', async () => {
    vi.useFakeTimers();
    stored.value = unlocked();

    scheduleAccountBackup({
      ...createEmptyState(),
      onboardingDone: true,
      pages: [[app('a')]],
    });
    scheduleAccountBackup(createEmptyState());
    flushAccountBackup();
    await vi.runAllTimersAsync();

    expect(putBackup).not.toHaveBeenCalled();
  });
});
