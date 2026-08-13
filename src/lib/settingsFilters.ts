/** 设置里纯度/分类开关：界面不允许全关；没密钥不能开限制。 */

import type { Settings, WallhavenPurity } from './types';

type PurityKey = keyof WallhavenPurity;
type CategoryKey = keyof Settings['wallhavenCategories'];

function countOn(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

/** 正要把最后一项开着的关掉。 */
export function isTurningOffLast(
  flags: Record<string, boolean>,
  key: string,
  next: boolean,
): boolean {
  return !next && !!flags[key] && countOn(flags) === 1;
}

/**
 * 切换一项纯度。最后一项开着时关不掉；没密钥时开限制无效。
 */
export function togglePurity(
  current: WallhavenPurity,
  key: PurityKey,
  next: boolean,
  hasKey: boolean,
): WallhavenPurity {
  if (key === 'nsfw' && next && !hasKey) return current;
  if (isTurningOffLast(current, key, next)) return current;
  return { ...current, [key]: next };
}

/**
 * 切换一项分类。最后一项开着时关不掉。
 */
export function toggleCategory(
  current: Settings['wallhavenCategories'],
  key: CategoryKey,
  next: boolean,
): Settings['wallhavenCategories'] {
  if (isTurningOffLast(current, key, next)) return current;
  return { ...current, [key]: next };
}

/** 清空密钥时把限制写成关；若因此一项都不剩，改开安全，避免纯度全关。 */
export function purityAfterClearingKey(current: WallhavenPurity): WallhavenPurity {
  if (!current.nsfw) return current;
  const next = { ...current, nsfw: false };
  if (countOn(next) === 0) next.sfw = true;
  return next;
}
