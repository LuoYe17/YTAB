/** 导入与重置的状态落地：补全设置、决定首次启动是否结束。纯函数，不碰壁纸池。 */

import { mergeSettings, type YtabState } from './types';

/**
 * 把导入或重置得到的 raw 整理成可 persist 的一份。
 * 始终 `mergeSettings`（旧导出文件缺字段时补默认）。`endFirstRun` 默认 true：导入视为已完成首次启动；
 * 重置传 `{ endFirstRun: false }` 并传入 `createEmptyState()`，才会再出首次启动。
 * 导入与重置都会换掉整份设置与壁纸，`invalidatePool` 恒为 true，由调用方清池。
 */
export function applyImportedState(
  raw: YtabState,
  opts?: { endFirstRun?: boolean },
): {
  state: YtabState;
  invalidatePool: boolean;
  displayUrl: string;
} {
  const endFirstRun = opts?.endFirstRun ?? true;
  const imageUrl = typeof raw.wallpaper?.imageUrl === 'string' ? raw.wallpaper.imageUrl : '';
  const fetchedOn = typeof raw.wallpaper?.fetchedOn === 'string' ? raw.wallpaper.fetchedOn : '';
  return {
    state: {
      ...raw,
      settings: mergeSettings(raw.settings),
      onboardingDone: endFirstRun ? true : raw.onboardingDone,
      wallpaper: {
        imageUrl,
        fetchedOn,
        wallhavenId: raw.wallpaper?.wallhavenId,
      },
    },
    invalidatePool: true,
    displayUrl: imageUrl,
  };
}
