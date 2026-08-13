/** 变了才值得传到云端：网格、设置、当前壁纸。一言每次打开都换，不进这份。 */

import type { YtabState } from './types';

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
