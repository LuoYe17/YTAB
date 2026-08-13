import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureAvatar,
  loadSession,
  needsFirstPassphrase,
  sessionUnlocked,
  type AccountSession,
} from './accountSession';

const { stored } = vi.hoisted(() => ({ stored: { value: null as AccountSession | null } }));

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

describe('ensureAvatar', () => {
  afterEach(() => {
    stored.value = null;
    vi.unstubAllGlobals();
  });

  /** 拉不下来就退回原地址，避开 FileReader；写盘那半段照走。 */
  function stubAvatarFetch() {
    vi.stubGlobal('fetch', async () => ({ ok: false }));
  }

  it('已经有头像就原样返回，不读盘也不写盘', async () => {
    stubAvatarFetch();
    const withAvatar = session({ avatar: 'https://cdn.example.com/me.png' });

    expect(await ensureAvatar(withAvatar)).toBe(withAvatar);
    expect(stored.value).toBeNull();
  });

  it('补上头像并写回', async () => {
    stubAvatarFetch();
    stored.value = session({ rawKey: 'k' });

    const next = await ensureAvatar(stored.value);
    expect(next?.avatar).toContain('avatars.githubusercontent.com');
    expect(stored.value?.avatar).toBe(next?.avatar);
    expect(stored.value?.rawKey).toBe('k');
  });

  it('抓头像期间登出了，不许把带 token 的旧会话写回来', async () => {
    const before = session({ rawKey: 'k' });
    stored.value = before;
    vi.stubGlobal('fetch', async () => {
      // 网络往返期间用户点了退出
      stored.value = null;
      return { ok: false };
    });

    expect(await ensureAvatar(before)).toBeNull();
    expect(stored.value).toBeNull();
  });

  it('抓头像期间换了账号，交出盘上那份，不覆盖', async () => {
    const before = session({ userId: '1', token: 't1' });
    stored.value = before;
    const other = session({ userId: '2', token: 't2', label: 'other' });
    vi.stubGlobal('fetch', async () => {
      stored.value = other;
      return { ok: false };
    });

    expect(await ensureAvatar(before)).toEqual(other);
    expect(stored.value).toBe(other);
  });

  it('loadSession 是纯读，不碰盘上的内容', async () => {
    stored.value = session({ rawKey: 'k' });
    const read = await loadSession();

    expect(read).toEqual(stored.value);
    expect(stored.value?.avatar).toBeUndefined();
  });
});
