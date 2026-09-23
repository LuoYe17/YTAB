/** App 图标：内存 data: 与 meta 引用之间的纯拆分（无 IDB / 无 chrome.storage）。 */

import { faviconUrlFor } from './defaults';
import type { AppItem, YtabState } from './types';

export const IDB_ICON_PREFIX = 'icon:';

/**
 * meta 里的图标引用。与 ZIP 内 `icon:` 分开，避免 persist 与备份两套解析搅在一起。
 */
export const META_ICON_PREFIX = 'idb:';

/** IndexedDB 里该 App 图标的 key；与 meta 的 `idb:` 引用成对。 */
export function iconIdbKey(appId: string): string {
  return `${IDB_ICON_PREFIX}${appId}`;
}

/** 网格上全部 App id（含文件夹内），供 IDB 图标 GC。 */
export function collectAppIds(state: YtabState): Set<string> {
  const ids = new Set<string>();
  for (const page of state.pages) {
    for (const item of page) {
      if (item.kind === 'app') ids.add(item.id);
      else for (const child of item.children) ids.add(child.id);
    }
  }
  return ids;
}

function mapApps(state: YtabState, fn: (app: AppItem) => AppItem): YtabState {
  return {
    ...state,
    pages: state.pages.map((page) =>
      page.map((item) => {
        if (item.kind === 'app') return fn(item);
        return { ...item, children: item.children.map(fn) };
      }),
    ),
  };
}

/**
 * 认「被备份往返写坏」的 SVG data URL，并还原成能渲染的形态；其余原样返回。
 *
 * 老版本导出把 `data:image/svg+xml;charset=utf-8,` 后面的百分号文本当字节写进 ZIP，
 * 回读时又按字节重包一层 base64 —— 于是浏览器拿到的是 `base64(百分号串)`，
 * `<img>` 解不出图，磁贴只能退成内置图或字母。认这个形态：base64 载荷解出来是百分号串、
 * 且解完确实是 XML。真实 base64 的 SVG（解出来直接是 `<svg`）不能碰：换成 charset=utf-8
 * 会让 `fill="#181717"` 里的 `#` 变成片段分隔符，反而弄坏好图。
 */
export function repairIconDataUrl(icon: string): string {
  const prefix = 'data:image/svg+xml;base64,';
  if (!icon.startsWith(prefix)) return icon;
  let inner: string;
  try {
    inner = atob(icon.slice(prefix.length));
  } catch {
    return icon;
  }
  if (!/%[0-9A-Fa-f]{2}/.test(inner)) return icon;
  try {
    if (!decodeURIComponent(inner).trimStart().startsWith('<')) return icon;
  } catch {
    return icon;
  }
  return `data:image/svg+xml;charset=utf-8,${inner}`;
}

/**
 * 把内存里的 data: 抽到 blobs；meta 只留 http / 空 / idb: 引用，壁纸像素清空。
 * 配额打挂过整包状态，所以像素绝不能进 chrome.storage。
 */
export function extractIconBlobs(state: YtabState): {
  meta: YtabState;
  blobs: Map<string, string>;
} {
  const blobs = new Map<string, string>();
  const withIcons = mapApps(state, (app) => {
    if (!app.icon.startsWith('data:')) return app;
    blobs.set(app.id, app.icon);
    return { ...app, icon: `${META_ICON_PREFIX}${app.id}` };
  });
  return {
    meta: {
      ...withIcons,
      wallpaper: {
        fetchedOn: withIcons.wallpaper.fetchedOn,
        wallhavenId: withIcons.wallpaper.wallhavenId,
        imageUrl: '',
      },
    },
    blobs,
  };
}

/** 把 IDB 像素填回 App.icon。缺 blob 时回退站点 favicon，避免空白磁贴。 */
export function hydrateIconBlobs(state: YtabState, blobs: Map<string, string>): YtabState {
  return mapApps(state, (app) => {
    if (!app.icon.startsWith(META_ICON_PREFIX)) return app;
    const id = app.icon.slice(META_ICON_PREFIX.length);
    const data = blobs.get(id);
    return { ...app, icon: repairIconDataUrl(data || faviconUrlFor(app.url)) };
  });
}

/** 这个 IDB key 是否属于已删除的 App；壁纸 key 恒为 false。 */
export function isStaleIconKey(key: string, liveIds: Set<string>): boolean {
  if (!key.startsWith(IDB_ICON_PREFIX)) return false;
  return !liveIds.has(key.slice(IDB_ICON_PREFIX.length));
}

/** 已删除 App 的 IDB 图标 key；壁纸 key 不在此列。 */
export function staleIconKeys(existingKeys: string[], liveIds: Set<string>): string[] {
  return existingKeys.filter((key) => isStaleIconKey(key, liveIds));
}

/**
 * 备份里只留另一台设备能解析的图标。
 * `keepPackedRefs`：ZIP 内已打包的 `icon:` 引用保留；其余 data: / idb: 改成站点 favicon。
 */
export function stripLocalIcons(state: YtabState, keepPackedRefs = false): YtabState {
  return mapApps(state, (app) => {
    if (keepPackedRefs && app.icon.startsWith('icon:')) return app;
    if (!app.icon || app.icon.startsWith('http')) return app;
    return { ...app, icon: faviconUrlFor(app.url) };
  });
}
