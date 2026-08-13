/** 换一张失败：给用户能动手的短文案，不在这里做 UI。 */

export type WallpaperFailReason = 'network' | 'empty';

export type WallpaperFailFocus = 'apiKey' | 'filters';

export type WallpaperFailHint = {
  before: string;
  link: string;
  after: string;
  focus: WallpaperFailFocus;
};

const HINTS: Record<WallpaperFailReason, WallpaperFailHint> = {
  network: {
    before: '换图失败了 (｡•́︿•̀｡) 检查一下网络，或者',
    link: '去设置 → 壁纸填个密钥',
    after: '吧',
    focus: 'apiKey',
  },
  empty: {
    before: '一张合适的都没找到 (´;ω;`) ',
    link: '去设置 → 壁纸把纯度或分类放宽一点',
    after: '吧',
    focus: 'filters',
  },
};

/** 分不清原因时按网络/限额处理：没 Key 是最常见情况。 */
export function wallpaperFailHint(reason: WallpaperFailReason): WallpaperFailHint {
  return HINTS[reason];
}
