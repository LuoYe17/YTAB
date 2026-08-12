import type { HitokotoState } from './types';

export async function fetchHitokoto(): Promise<HitokotoState | null> {
  try {
    const res = await fetch('https://v1.hitokoto.cn/?encode=json');
    if (!res.ok) return null;
    const data = (await res.json()) as { hitokoto?: string; from?: string };
    if (!data.hitokoto) return null;
    return {
      text: data.hitokoto,
      from: data.from ?? '',
    };
  } catch {
    return null;
  }
}
