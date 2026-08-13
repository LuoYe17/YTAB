/** 这台记住的登录：token + 解开后的 raw key。卸扩展或登出会没。 */

import type { AuthOk } from './accountApi';
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
  /** 派生 rawKey 时的 PBKDF2 次数。再加密要原样标进密文，否则换机解不开。 */
  iter?: number;
  uploadedAt?: string;
  /** 登录时或上次成功上传时云端有份。删掉密文后为 false，避免自动备份把刚删的救活。 */
  hasBackup: boolean;
};

const store = storage.defineItem<AccountSession | null>('local:ytab:account:v1', {
  fallback: null,
});

/** 读这台记住的登录。纯读，不写盘。 */
export async function loadSession(): Promise<AccountSession | null> {
  return (await store.getValue()) ?? null;
}

/**
 * 补上缺失的头像并写回，供要显示头像的地方调用。
 * 与 `loadSession` 分开：读一份登录不该顺带落盘。
 *
 * 抓头像要走网络，期间用户可能已经登出或换了账号。写回前重读一次，对不上就
 * 交出盘上那份——否则会把含 token / rawKey 的旧会话复活，`clearSession` 白做。
 */
export async function ensureAvatar(session: AccountSession | null): Promise<AccountSession | null> {
  if (!session || session.avatar) return session;
  const avatar = await cacheAvatar(githubAvatarUrl(session.userId));
  if (!avatar) return session;
  const current = (await store.getValue()) ?? null;
  if (!current || current.userId !== session.userId || current.token !== session.token) {
    return current;
  }
  const next = { ...current, avatar };
  await store.setValue(next);
  return next;
}

function githubAvatarUrl(userId: string): string {
  return `https://avatars.githubusercontent.com/u/${encodeURIComponent(userId)}?v=4`;
}

/** 整份覆盖这台的登录记录。传 null 等于退出。 */
export async function saveSession(next: AccountSession | null): Promise<void> {
  await store.setValue(next);
}

/** 忘掉这台登录与 raw key。 */
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

/** 登录成功后组成本机会话。此时还没解开，raw key 为空。 */
export async function sessionFromAuth(auth: AuthOk): Promise<AccountSession> {
  return {
    provider: 'github',
    userId: auth.userId,
    label: auth.label,
    token: auth.token,
    hasBackup: auth.hasBackup,
    avatar: await cacheAvatar(auth.avatar ?? githubAvatarUrl(auth.userId)),
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

/** 已登录且解开（rawKey / salt / iter 齐了）：自动备份只在这时上传。 */
export function sessionUnlocked(
  session: AccountSession | null,
): session is AccountSession & { rawKey: string; salt: string; iter: number } {
  return Boolean(session?.rawKey && session.salt && session.iter && session.token);
}

/** 云端还没有、这台也还没解开：该设口令。云端有份时不要走这条，以免新口令盖掉旧份。 */
export function needsFirstPassphrase(session: AccountSession | null): boolean {
  return Boolean(session && !session.rawKey && session.hasBackup === false);
}

/** 本机显示「今天 / 昨天 / 日期」；解析失败则原样返回。 */
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
