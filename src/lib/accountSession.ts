/** 这台记住的登录：token + 解开后的 raw key。卸扩展或登出会没。 */

import { storage } from 'wxt/utils/storage';

export type AccountProvider = 'github';

export type AccountSession = {
  provider: AccountProvider;
  userId: string;
  label: string;
  /** 本机缓存的头像（data URL 或 https）。 */
  avatar?: string;
  token: string;
  rawKey?: string;
  salt?: string;
  uploadedAt?: string;
};

const store = storage.defineItem<AccountSession | null>('local:ytab:account:v1', {
  fallback: null,
});

export async function loadSession(): Promise<AccountSession | null> {
  const s = (await store.getValue()) ?? null;
  if (!s) return null;
  if (s.avatar) return s;
  const guessed = `https://avatars.githubusercontent.com/u/${encodeURIComponent(s.userId)}?v=4`;
  const avatar = await cacheAvatar(guessed);
  if (!avatar) return s;
  const next = { ...s, avatar };
  await store.setValue(next);
  return next;
}

export async function saveSession(next: AccountSession | null): Promise<void> {
  await store.setValue(next);
}

export async function clearSession(): Promise<void> {
  await store.setValue(null);
}

/** 把 GitHub 头像拉到本机，进不来就退回原地址。 */
export async function cacheAvatar(url: string | undefined): Promise<string | undefined> {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    if (blob.size > 400_000) return url;
    return await blobToDataUrl(blob);
  } catch {
    return url;
  }
}

export async function sessionFromAuth(auth: {
  userId: string;
  label: string;
  token: string;
  avatar?: string;
}): Promise<AccountSession> {
  return {
    provider: 'github',
    userId: auth.userId,
    label: auth.label,
    token: auth.token,
    avatar: await cacheAvatar(auth.avatar ?? `https://avatars.githubusercontent.com/u/${encodeURIComponent(auth.userId)}?v=4`),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function sessionUnlocked(
  session: AccountSession | null,
): session is AccountSession & { rawKey: string; salt: string } {
  return Boolean(session?.rawKey && session.salt && session.token);
}

export function providerLabel(provider: AccountProvider): string {
  return provider === 'github' ? 'GitHub' : provider;
}

export function formatBackupAt(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const now = new Date();
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${time}`;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (at.toDateString() === yest.toDateString()) return `昨天 ${time}`;
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')} ${time}`;
}
