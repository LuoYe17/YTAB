/** 壁纸：Wallhaven 拉取、内存预取池、换图会话。一次成图；上屏与 persist 由调用方负责。 */

import { DEFAULT_SETTINGS, type Settings, type WallpaperState } from './types';
import type { WallpaperFailReason } from './wallpaperFail';

const POOL_SIZE = 3;
const MAX_DISPLAY_WIDTH = 2560;
const AT_LEAST = '1920x1080';
const RATIOS = '16x9,16x10';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

export type WallpaperItem = {
  imageUrl: string;
  wallhavenId: string;
  fetchedOn: string;
};

/** @deprecated alias for callers still naming WallhavenFetchResult */
export type WallhavenFetchResult = WallpaperItem;

type WallhavenSearchHit = {
  id: string;
  path: string;
  purity?: 'sfw' | 'sketchy' | 'nsfw';
  category?: string;
  file_type?: string;
};

/** 本地自然日 YYYY-MM-DD；日更与 fetchedOn 必须用同一把尺，不能用 UTC 日界。 */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function needsDailyWallpaper(wallpaper: WallpaperState): boolean {
  if (!wallpaper.imageUrl) return true;
  return wallpaper.fetchedOn !== todayLocal();
}

/** Wallhaven rejects purity=000; fall back to SFW-only. */
export function purityParam(p: Settings['wallhavenPurity']): string {
  const bits = `${p.sfw ? '1' : '0'}${p.sketchy ? '1' : '0'}${p.nsfw ? '1' : '0'}`;
  return bits === '000' ? '100' : bits;
}

export function categoriesParam(c: Settings['wallhavenCategories']): string {
  const bits = `${c.general ? '1' : '0'}${c.anime ? '1' : '0'}${c.people ? '1' : '0'}`;
  return bits === '000' ? '111' : bits;
}

type TagPreset = { id: string; label: string };
type CategoryKey = keyof Settings['wallhavenCategories'];

/** 各分类自己的一小撮词；多开分类时按常规→动漫→人物并集，同 id 只留一次。 */
export const WALLHAVEN_TAG_PRESETS: Record<CategoryKey, TagPreset[]> = {
  general: [
    { id: 'landscape', label: '风景' },
    { id: 'nature', label: '自然' },
    { id: 'cityscape', label: '城市' },
    { id: 'architecture', label: '建筑' },
    { id: 'minimalism', label: '极简' },
    { id: 'night', label: '夜' },
    { id: 'stars', label: '星空' },
    { id: 'cyberpunk', label: '赛博' },
    { id: 'abstract', label: '抽象' },
  ],
  anime: [
    { id: 'anime girls', label: '少女' },
    { id: 'scenery', label: '场景' },
    { id: 'sakura', label: '樱花' },
    { id: 'rain', label: '雨' },
    { id: 'cyberpunk', label: '赛博' },
    { id: 'minimalism', label: '极简' },
    { id: 'night', label: '夜' },
    { id: 'mecha', label: '机甲' },
    { id: 'pixel art', label: '像素' },
  ],
  people: [
    { id: 'portrait', label: '人像' },
    { id: 'woman', label: '女性' },
    { id: 'man', label: '男性' },
    { id: 'street', label: '街头' },
    { id: 'fashion', label: '时尚' },
    { id: 'model', label: '模特' },
    { id: 'cityscape', label: '城市' },
    { id: 'night', label: '夜' },
    { id: 'close-up', label: '特写' },
  ],
};

const CATEGORY_ORDER: CategoryKey[] = ['general', 'anime', 'people'];

/** 当前开着的分类对应的标签菜单。 */
export function visibleTagPresets(
  categories: Settings['wallhavenCategories'] | null | undefined,
): TagPreset[] {
  const c = { ...DEFAULT_SETTINGS.wallhavenCategories, ...categories };
  const seen = new Set<string>();
  const out: TagPreset[] = [];
  for (const key of CATEGORY_ORDER) {
    if (!c[key]) continue;
    for (const tag of WALLHAVEN_TAG_PRESETS[key]) {
      if (seen.has(tag.id)) continue;
      seen.add(tag.id);
      out.push(tag);
    }
  }
  return out;
}

/** 关掉某类之后，去掉菜单里已经没有的已选标签。 */
export function tagsAfterCategoriesChange(
  tags: string[],
  categories: Settings['wallhavenCategories'],
): string[] {
  const allowed = new Set(visibleTagPresets(categories).map((t) => t.id));
  return tags.filter((id) => allowed.has(id));
}

/**
 * 拼 Wallhaven 搜索参数。缺字段的旧存储按热门、无标签。
 * 热门必须带 `topRange`，否则接口会拒。
 * 已选标签若不在当前分类菜单里，不写入 `q`。
 */
export function wallhavenSearchParams(settings: Settings): URLSearchParams {
  const sorting = settings.wallhavenSorting || 'toplist';
  const params = new URLSearchParams({
    sorting,
    purity: purityParam(settings.wallhavenPurity),
    categories: categoriesParam(settings.wallhavenCategories),
    atleast: AT_LEAST,
    ratios: RATIOS,
  });
  const allowed = new Set(visibleTagPresets(settings.wallhavenCategories).map((t) => t.id));
  const q = (settings.wallhavenTags ?? []).filter((id) => allowed.has(id)).join(' ');
  if (q) params.set('q', q);
  if (sorting === 'toplist') params.set('topRange', '1M');
  const key = settings.wallhavenApiKey.trim();
  if (key) params.set('apikey', key);
  return params;
}

function hitAllowed(hit: WallhavenSearchHit, settings: Settings): boolean {
  if (hit.purity === 'sfw') return settings.wallhavenPurity.sfw;
  if (hit.purity === 'sketchy') return settings.wallhavenPurity.sketchy;
  if (hit.purity === 'nsfw') return settings.wallhavenPurity.nsfw;
  // Unknown purity: keep only if SFW is enabled
  return settings.wallhavenPurity.sfw;
}

export function displayMaxWidth(): number {
  if (typeof window === 'undefined') return 1920;
  const w = Math.round(window.screen.width * (window.devicePixelRatio || 1));
  return Math.min(Math.max(w, 1280), MAX_DISPLAY_WIDTH);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.blob();
}

/** Resize to display width and encode as JPEG data URL (png sources still ok). */
export async function toDisplayDataUrl(source: Blob | string): Promise<string> {
  const blob = typeof source === 'string' ? await fetchBlob(source) : source;
  const bitmap = await createImageBitmap(blob);
  const maxW = displayMaxWidth();
  let width = bitmap.width;
  let height = bitmap.height;
  if (width > maxW) {
    height = Math.round((height * maxW) / width);
    width = maxW;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return blobToDataUrl(blob);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.88);
}

async function searchHits(settings: Settings): Promise<WallhavenSearchHit[]> {
  const res = await fetch(`https://wallhaven.cc/api/v1/search?${wallhavenSearchParams(settings)}`);
  if (!res.ok) throw new Error(`wallhaven ${res.status}`);
  const data = (await res.json()) as { data?: WallhavenSearchHit[] };
  return (data.data ?? []).filter((h) => {
    if (!h.path) return false;
    if (h.file_type && !ALLOWED_TYPES.has(h.file_type)) return false;
    if (!hitAllowed(h, settings)) return false;
    return true;
  });
}

async function pickHit(
  settings: Settings,
): Promise<{ hit: WallhavenSearchHit } | { fail: WallpaperFailReason }> {
  let gotOkEmpty = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const hits = await searchHits(settings);
      if (hits.length) {
        const hit = hits[Math.floor(Math.random() * hits.length)] ?? hits[0]!;
        return { hit };
      }
      gotOkEmpty = true;
    } catch {
      /* 网络/限额；若曾成功搜到零张则更像筛选过严 */
    }
  }
  return { fail: gotOkEmpty ? 'empty' : 'network' };
}

export type WallpaperAcquireResult =
  | { ok: true; item: WallpaperItem }
  | { ok: false; reason: WallpaperFailReason };

export async function fetchRandomWallpaper(
  settings: Settings,
): Promise<WallpaperAcquireResult> {
  const picked = await pickHit(settings);
  if ('fail' in picked) return { ok: false, reason: picked.fail };
  try {
    const imageUrl = await toDisplayDataUrl(picked.hit.path);
    return {
      ok: true,
      item: {
        imageUrl,
        wallhavenId: picked.hit.id,
        fetchedOn: todayLocal(),
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** In-memory prefetch pool (not persisted). */
class WallpaperPool {
  private items: WallpaperItem[] = [];
  private day = '';
  private filling: Promise<void> | null = null;
  private seenIds = new Set<string>();
  /** Bumped on clear / filter change so in-flight fills discard results. */
  private epoch = 0;

  invalidateIfNewDay(): void {
    const t = todayLocal();
    if (this.day && this.day !== t) {
      this.items = [];
      this.seenIds.clear();
      this.epoch++;
    }
    this.day = t;
  }

  clear(): void {
    this.items = [];
    this.seenIds.clear();
    this.day = todayLocal();
    this.epoch++;
  }

  rememberCurrent(id?: string): void {
    if (id) this.seenIds.add(id);
  }

  take(): WallpaperItem | null {
    this.invalidateIfNewDay();
    return this.items.shift() ?? null;
  }

  size(): number {
    return this.items.length;
  }

  async fill(settings: Settings, target = POOL_SIZE): Promise<void> {
    this.invalidateIfNewDay();
    // Wait out an in-flight fill (clear() bumps epoch so it exits); then start fresh.
    while (this.filling) {
      await this.filling;
    }
    if (this.items.length >= target) return;
    const epochAtStart = this.epoch;
    this.filling = (async () => {
      let guard = 0;
      while (this.items.length < target && guard < target * 4) {
        if (this.epoch !== epochAtStart) return;
        guard++;
        const got = await fetchRandomWallpaper(settings);
        if (this.epoch !== epochAtStart) return;
        if (!got.ok) break;
        if (this.seenIds.has(got.item.wallhavenId)) continue;
        this.seenIds.add(got.item.wallhavenId);
        this.items.push(got.item);
      }
    })().finally(() => {
      this.filling = null;
    });
    return this.filling;
  }
}

export const wallpaperPool = new WallpaperPool();

export function schedulePoolFill(settings: Settings): void {
  const run = () => {
    void wallpaperPool.fill(settings, POOL_SIZE).catch(() => {
      /* 预取失败不挡起始页 */
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 4000 });
  } else {
    setTimeout(run, 800);
  }
}

export type WallpaperEnsureResult =
  | { kind: 'keep' }
  | { kind: 'switched'; item: WallpaperItem }
  | { kind: 'failed' };

export type WallpaperPrepareResult =
  | { ok: true }
  | { ok: false; reason: WallpaperFailReason | 'busy' };

export type WallpaperSessionDeps = {
  acquire: (settings: Settings) => Promise<WallpaperAcquireResult>;
  decode: (src: string) => Promise<void>;
  /** 日更前丢掉旧池，避免过期过滤条件的预取图。 */
  beforeDaily?: () => void;
};

/**
 * 换图会话：准备阶段只解码不上屏；提交阶段再交出成图。
 * 池空与有货同一条路径（一次成图），避免 thumbs → 全图连闪。
 */
export function createWallpaperSession(deps: WallpaperSessionDeps) {
  let busy = false;
  let pending: WallpaperItem | null = null;

  async function prepare(settings: Settings): Promise<WallpaperPrepareResult> {
    if (busy) return { ok: false, reason: 'busy' };
    busy = true;
    pending = null;
    try {
      const got = await deps.acquire(settings);
      if (!got.ok) {
        busy = false;
        return { ok: false, reason: got.reason };
      }
      await deps.decode(got.item.imageUrl);
      pending = got.item;
      return { ok: true };
    } catch {
      busy = false;
      return { ok: false, reason: 'network' };
    }
  }

  function commit(): WallpaperItem | null {
    const item = pending;
    pending = null;
    busy = false;
    return item;
  }

  /** 无 UI 路径：准备 + 提交一次做完。 */
  async function refresh(settings: Settings): Promise<WallpaperItem | null> {
    const prepared = await prepare(settings);
    if (!prepared.ok) return null;
    return commit();
  }

  async function ensure(
    settings: Settings,
    current: WallpaperState,
    force: boolean,
  ): Promise<WallpaperEnsureResult> {
    if (!force && !needsDailyWallpaper(current)) return { kind: 'keep' };
    deps.beforeDaily?.();
    const item = await refresh(settings);
    return item ? { kind: 'switched', item } : { kind: 'failed' };
  }

  return {
    prepare,
    commit,
    ensure,
    get busy() {
      return busy;
    },
  };
}

/** 失败也放行，避免坏图卡死换图按钮。 */
function decodeWallpaperImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

function acquireFromPoolOrFetch(settings: Settings): Promise<WallpaperAcquireResult> {
  const pooled = wallpaperPool.take();
  return pooled ? Promise.resolve({ ok: true, item: pooled }) : fetchRandomWallpaper(settings);
}

/** 起始页用的换图会话：取池或拉取、解码；上屏与 persist 仍由 App 做。 */
export const wallpaperSession = createWallpaperSession({
  acquire: acquireFromPoolOrFetch,
  decode: decodeWallpaperImage,
  beforeDaily: () => wallpaperPool.clear(),
});
