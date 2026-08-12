import type { Settings, WallpaperState } from './types';

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
  thumbs?: { large?: string; original?: string; small?: string };
};

function todayLocal(): string {
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
  const params = new URLSearchParams({
    sorting: 'random',
    purity: purityParam(settings.wallhavenPurity),
    categories: categoriesParam(settings.wallhavenCategories),
    atleast: AT_LEAST,
    ratios: RATIOS,
  });
  if (settings.wallhavenApiKey.trim()) {
    params.set('apikey', settings.wallhavenApiKey.trim());
  }

  const res = await fetch(`https://wallhaven.cc/api/v1/search?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: WallhavenSearchHit[] };
  return (data.data ?? []).filter((h) => {
    if (!h.path) return false;
    if (h.file_type && !ALLOWED_TYPES.has(h.file_type)) return false;
    if (!hitAllowed(h, settings)) return false;
    return true;
  });
}

async function pickHit(settings: Settings): Promise<WallhavenSearchHit | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const hits = await searchHits(settings);
    if (hits.length) return hits[Math.floor(Math.random() * hits.length)] ?? hits[0]!;
  }
  return null;
}

export async function fetchRandomWallpaper(
  settings: Settings,
): Promise<WallpaperItem | null> {
  const hit = await pickHit(settings);
  if (!hit) return null;
  try {
    const imageUrl = await toDisplayDataUrl(hit.path);
    return {
      imageUrl,
      wallhavenId: hit.id,
      fetchedOn: todayLocal(),
    };
  } catch {
    return null;
  }
}

/** Pool-empty progressive: small preview first (thumbs.large). */
export async function fetchWallpaperPreview(
  settings: Settings,
): Promise<{ previewUrl: string; hit: WallhavenSearchHit } | null> {
  const hit = await pickHit(settings);
  if (!hit) return null;
  const thumb = hit.thumbs?.large || hit.thumbs?.original || hit.path;
  try {
    const previewUrl = await toDisplayDataUrl(thumb);
    return { previewUrl, hit };
  } catch {
    return { previewUrl: thumb, hit };
  }
}

export async function finalizeWallpaperFromHit(
  hit: WallhavenSearchHit,
): Promise<WallpaperItem | null> {
  try {
    const imageUrl = await toDisplayDataUrl(hit.path);
    return {
      imageUrl,
      wallhavenId: hit.id,
      fetchedOn: todayLocal(),
    };
  } catch {
    return null;
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
        const item = await fetchRandomWallpaper(settings);
        if (this.epoch !== epochAtStart) return;
        if (!item) break;
        if (this.seenIds.has(item.wallhavenId)) continue;
        this.seenIds.add(item.wallhavenId);
        this.items.push(item);
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
    void wallpaperPool.fill(settings, POOL_SIZE);
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 4000 });
  } else {
    setTimeout(run, 800);
  }
}
