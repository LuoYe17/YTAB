/** 壁纸：Wallhaven 拉取、内存预取池、换图会话。一次成图；上屏与 persist 由调用方负责。 */

import type { Settings, WallpaperState } from './types';
import { visibleTagPresets } from './settingsFilters';
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

export function needsDailyWallpaper(wallpaper: WallpaperState, today = todayLocal()): boolean {
  if (!wallpaper.imageUrl) return true;
  return wallpaper.fetchedOn !== today;
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
  // 密钥走请求头，避免进查询串被代理/日志记下。
  const key = (settings.wallhavenApiKey ?? '').trim();
  const res = await fetch(`https://wallhaven.cc/api/v1/search?${wallhavenSearchParams(settings)}`, {
    headers: key ? { 'X-API-Key': key } : undefined,
  });
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

/** In-memory prefetch pool (not persisted). 由 surface 持有；日界与取图都经注入口，便于整条验证。 */
class WallpaperPool {
  private items: WallpaperItem[] = [];
  private day = '';
  private filling: Promise<void> | null = null;
  private seenIds = new Set<string>();
  /** Bumped on clear / filter change so in-flight fills discard results. */
  private epoch = 0;

  constructor(
    private deps: {
      fetch: (settings: Settings) => Promise<WallpaperAcquireResult>;
      today: () => string;
    },
  ) {}

  invalidateIfNewDay(): void {
    const t = this.deps.today();
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
    this.day = this.deps.today();
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
        const got = await this.deps.fetch(settings);
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
  /** 本地自然日；与池、`fetchedOn` 必须用同一把尺。 */
  today?: () => string;
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
    if (!force && !needsDailyWallpaper(current, (deps.today ?? todayLocal)())) {
      return { kind: 'keep' };
    }
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

/** 生产排期：空闲时补池，别和首屏抢。 */
function idleSchedule(run: () => Promise<void>): void {
  const start = () => {
    void run().catch(() => {
      /* 预取失败不挡起始页 */
    });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => start(), { timeout: 4000 });
  } else {
    setTimeout(start, 800);
  }
}

export type WallpaperSurfaceDeps = {
  /** 上屏 URL 变了；起始页据此换背景。 */
  onDisplay: (imageUrl: string) => void;
  /** 落盘一份壁纸状态。surface 不认识 chrome.storage，也不管账号备份。 */
  persist: (wallpaper: WallpaperState) => Promise<void>;
  fetch?: (settings: Settings) => Promise<WallpaperAcquireResult>;
  decode?: (src: string) => Promise<void>;
  /** 本地自然日；池的日界与 `fetchedOn` 必须用同一把尺。 */
  today?: () => string;
  schedule?: (run: () => Promise<void>) => void;
};

/**
 * 壁纸上屏面：日更、手动换图、改筛选、导入 / 首启落地，全部经此一处。
 *
 * 内部持有预取池与换图会话；调用方只需说发生了什么，不必再各自拼
 * 「上屏 + 落盘 + 记 id + 清池 / 补池」。落盘失败会原样抛给调用方——
 * 图已经上屏，吞掉的话下次打开就变回旧图且无人知情。
 */
export function createWallpaperSurface(deps: WallpaperSurfaceDeps) {
  const fetchOne = deps.fetch ?? fetchRandomWallpaper;
  const today = deps.today ?? todayLocal;
  const schedule = deps.schedule ?? idleSchedule;
  const pool = new WallpaperPool({ fetch: fetchOne, today });

  const session = createWallpaperSession({
    acquire: (settings) => {
      const pooled = pool.take();
      return pooled ? Promise.resolve({ ok: true, item: pooled }) : fetchOne(settings);
    },
    decode: deps.decode ?? decodeWallpaperImage,
    beforeDaily: () => pool.clear(),
    today,
  });

  function refill(settings: Settings): void {
    schedule(() => pool.fill(settings, POOL_SIZE));
  }

  function keepShowing(current: WallpaperState, settings: Settings): void {
    deps.onDisplay(current.imageUrl);
    pool.rememberCurrent(current.wallhavenId);
    refill(settings);
  }

  async function land(item: WallpaperItem, settings: Settings): Promise<void> {
    deps.onDisplay(item.imageUrl);
    await deps.persist({
      imageUrl: item.imageUrl,
      fetchedOn: item.fetchedOn,
      wallhavenId: item.wallhavenId,
    });
    pool.rememberCurrent(item.wallhavenId);
    refill(settings);
  }

  return {
    /** 打开起始页：先把已存的图放上屏，不发请求。 */
    restore(current: WallpaperState): void {
      deps.onDisplay(current.imageUrl);
    },

    /** 按本地自然日换图；同日维持现状，失败也维持现状。 */
    async ensureDaily(settings: Settings, current: WallpaperState): Promise<void> {
      const result = await session.ensure(settings, current, false);
      if (result.kind === 'switched') {
        await land(result.item, settings);
        return;
      }
      keepShowing(current, settings);
    },

    /** 手动换一张的准备阶段：拉取并解码，不上屏。 */
    prepare(settings: Settings): Promise<WallpaperPrepareResult> {
      return session.prepare(settings);
    },

    /** 手动换一张的提交阶段：与绿勾同时上屏并落盘。 */
    async commit(settings: Settings): Promise<void> {
      const item = session.commit();
      if (!item) return;
      await land(item, settings);
    },

    /** 筛选条件变了：旧池作废并重新预取，不动上屏。 */
    onFiltersChanged(settings: Settings): void {
      pool.clear();
      refill(settings);
    },

    /**
     * 外面已经拿到一张（首次启动 / 导入）：上屏并接管后续预取。
     * 整份状态由调用方落盘，这里不重复写。
     */
    adopt(item: { imageUrl: string; wallhavenId?: string }, settings: Settings): void {
      pool.clear();
      deps.onDisplay(item.imageUrl);
      pool.rememberCurrent(item.wallhavenId);
      refill(settings);
    },
  };
}

export type WallpaperSurface = ReturnType<typeof createWallpaperSurface>;
