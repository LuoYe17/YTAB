import { fetchWithTimeout, retryWithBackoff } from './async';
import type { HitokotoState } from './types';

const TIMEOUT_MS = 5_000;

/** 一言：5s 超时 + 一次 2s 退避重试；全部失败返回 null（走本地缓存）。 */
export async function fetchHitokoto(): Promise<HitokotoState | null> {
  return retryWithBackoff(
    async () => {
      const res = await fetchWithTimeout('https://v1.hitokoto.cn/?encode=json', {}, TIMEOUT_MS);
      if (!res.ok) throw new Error(`hitokoto http ${res.status}`);
      const data = (await res.json()) as { hitokoto?: string; from?: string };
      if (!data.hitokoto) throw new Error('hitokoto empty');
      return {
        text: data.hitokoto,
        from: data.from ?? '',
      };
    },
    { attempts: 2, baseDelayMs: 2_000 },
  );
}
