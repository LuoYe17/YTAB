/** 决定哪些变化值得触发一次账号备份。纯逻辑，无 persist。 */

import type { YtabState } from './types';

/**
 * 备份指纹：网格 / 设置 / 当前壁纸变了才值得传。一言每次打开都换，故意不算。
 * 壁纸的 data URL 只取长度当指纹，几 MB 的字符串不整段进 JSON.stringify。
 */
export function backupInterest(state: YtabState): string {
  return JSON.stringify({
    onboardingDone: state.onboardingDone,
    pages: state.pages,
    settings: state.settings,
    wallpaper: {
      fetchedOn: state.wallpaper.fetchedOn,
      wallhavenId: state.wallpaper.wallhavenId,
      bytes: state.wallpaper.imageUrl?.length ?? 0,
    },
  });
}
