/** 壁纸编排控制器：两阶段（prepare → commit）状态机 + 显示 URL 状态。 */

import { sleep } from './async';
import {
  fetchRandomWallpaper,
  needsDailyWallpaper,
  schedulePoolFill,
  wallpaperPool,
  type WallpaperItem,
} from './wallpaper';
import type { Settings, WallpaperState } from './types';

export type WallpaperControllerDeps = {
  getSettings: () => Settings;
  getWallpaper: () => WallpaperState;
  persistWallpaper: (item: WallpaperItem) => Promise<void>;
};

export function createWallpaperController(deps: WallpaperControllerDeps) {
  /** WallpaperStage 实际绘制的 URL（commit 前可能是预览图） */
  let displayUrl = $state('');
  let wallpaperBusy = $state(false);
  let pendingRefresh: WallpaperItem | null = $state(null);

  function decodeImage(src: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  /** Scan 阶段：只拉取/解码，不上屏。 */
  async function prepareWallpaperRefresh(): Promise<boolean> {
    if (wallpaperBusy) return false;
    wallpaperBusy = true;
    pendingRefresh = null;
    try {
      const item = wallpaperPool.take() ?? (await fetchRandomWallpaper(deps.getSettings()));
      if (!item) {
        wallpaperBusy = false;
        return false;
      }
      await decodeImage(item.imageUrl);
      pendingRefresh = item;
      return true;
    } catch {
      wallpaperBusy = false;
      return false;
    }
  }

  /** Success 阶段：与绿勾同时上屏并落盘。 */
  async function commitWallpaperRefresh(): Promise<void> {
    const item = pendingRefresh;
    pendingRefresh = null;
    try {
      if (!item) return;
      displayUrl = item.imageUrl;
      await deps.persistWallpaper(item);
      schedulePoolFill(deps.getSettings());
      await sleep(450);
    } finally {
      wallpaperBusy = false;
    }
  }

  /** 日界等无 UI 路径：准备 + 提交一次做完。 */
  async function switchWallpaper(): Promise<boolean> {
    const ok = await prepareWallpaperRefresh();
    if (!ok) return false;
    await commitWallpaperRefresh();
    return true;
  }

  async function ensureWallpaper(force: boolean): Promise<void> {
    const wp = deps.getWallpaper();
    if (!force && !needsDailyWallpaper(wp)) {
      displayUrl = wp.imageUrl;
      return;
    }
    wallpaperPool.clear();
    await switchWallpaper();
  }

  function rememberCurrent(id?: string): void {
    wallpaperPool.rememberCurrent(id);
  }

  function setDisplayUrl(url: string): void {
    displayUrl = url;
  }

  return {
    get displayUrl() {
      return displayUrl;
    },
    get wallpaperBusy() {
      return wallpaperBusy;
    },
    prepareWallpaperRefresh,
    commitWallpaperRefresh,
    switchWallpaper,
    ensureWallpaper,
    rememberCurrent,
    setDisplayUrl,
  };
}
