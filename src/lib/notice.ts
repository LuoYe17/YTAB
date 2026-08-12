/** 起始页顶部通知：同时只一条，新的顶掉旧的。 */

import type { WallpaperFailFocus } from './wallpaperFail';

export type NoticeTone = 'ok' | 'fail';

export type Notice = {
  id: number;
  tone: NoticeTone;
  before: string;
  action?: { text: string; focus: WallpaperFailFocus };
  after?: string;
};

let seq = 0;
let current: Notice | null = null;
const listeners = new Set<(n: Notice | null) => void>();

function emit() {
  for (const fn of listeners) fn(current);
}

/** 订阅当前通知；立即回放一条，便于挂载时赶上已有通知。 */
export function subscribeNotice(fn: (n: Notice | null) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}

/** 砸下一条新通知；已有的会被顶掉（宿主先右溜再入）。 */
export function showNotice(input: Omit<Notice, 'id'>): void {
  seq += 1;
  current = { ...input, id: seq };
  emit();
}

/** 关掉当前条。传入 id 时只关这一条，避免迟到的 2s 定时误关下一条。 */
export function dismissNotice(id?: number): void {
  if (id !== undefined && current?.id !== id) return;
  current = null;
  emit();
}

/** 无链接的短通知。 */
export function plainNotice(tone: NoticeTone, text: string): void {
  showNotice({ tone, before: text });
}
