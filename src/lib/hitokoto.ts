/** 一言：在线取句。打开起始页失败静默；用户点换才把原因交给通知。 */

import type { HitokotoState } from './types';

export type HitokotoFailReason = 'network' | 'rateLimit' | 'empty';

export type HitokotoFetchResult =
  | { ok: true; value: HitokotoState }
  | { ok: false; reason: HitokotoFailReason };

/**
 * 点换失败时通知用；打开起始页后台失败不走这里。
 * network：连不上或超时；rateLimit：429；empty：其他非 2xx 或空包（分不清就不当成网络）。
 */
export function hitokotoFailNotice(reason: HitokotoFailReason): string {
  if (reason === 'network') return '连不上一言 (｡•́︿•̀｡) 检查一下网络';
  if (reason === 'rateLimit') return '一言让歇一会，稍后再点';
  return '一言这次没给句子，稍后再试';
}

const HITOKOTO_URL = 'https://v1.hitokoto.cn/?encode=json';
const HITOKOTO_TIMEOUT_MS = 8000;

/**
 * 取一句一言。8 秒无响应当连不上。
 * 不抛错：打开起始页的调用方靠 ok 决定是否静默留缓存。
 */
export async function fetchHitokoto(): Promise<HitokotoFetchResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HITOKOTO_TIMEOUT_MS);
  try {
    const res = await fetch(HITOKOTO_URL, { signal: ac.signal });
    if (res.status === 429) return { ok: false, reason: 'rateLimit' };
    // 5xx 等分不清限额和空包，不当成网络，避免用户去查自己的网。
    if (!res.ok) return { ok: false, reason: 'empty' };
    const data = (await res.json()) as { hitokoto?: string; from?: string };
    if (!data.hitokoto) return { ok: false, reason: 'empty' };
    return {
      ok: true,
      value: {
        text: data.hitokoto,
        from: data.from ?? '',
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
