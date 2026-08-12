import { storage } from 'wxt/utils/storage';
import { faviconUrlFor } from './defaults';
import { createEmptyState, type AppItem, type GridItem, type YtabState } from './types';

const META_KEY = 'local:ytab:v1' as const;
/** Legacy key — read once to migrate, then clear. */
const LEGACY_WALLPAPER_KEY = 'local:ytab:wallpaper:image' as const;

const IDB_NAME = 'ytab';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';
const IDB_WALLPAPER = 'wallpaperImage';

export const ytabStore = storage.defineItem<YtabState>(META_KEY, {
  fallback: createEmptyState(),
});

const legacyWallpaperStore = storage.defineItem<string>(LEGACY_WALLPAPER_KEY, {
  fallback: '',
});

let writeChain: Promise<void> = Promise.resolve();
let latest: YtabState | null = null;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb open failed'));
  });
}

async function idbGet(key: string): Promise<string> {
  const db = await openIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
      req.onerror = () => reject(req.error ?? new Error('idb get failed'));
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb set failed'));
      tx.objectStore(IDB_STORE).put(value, key);
    });
  } finally {
    db.close();
  }
}

/** Meta blob must stay small: no wallpaper pixels, no icon data-URLs. */
function compactMeta(state: YtabState): YtabState {
  const mapApp = (app: AppItem): AppItem => ({
    ...app,
    icon: app.icon.startsWith('data:') ? faviconUrlFor(app.url) : app.icon,
  });
  const mapItem = (item: GridItem): GridItem => {
    if (item.kind === 'app') return mapApp(item);
    return { ...item, children: item.children.map(mapApp) };
  };
  return {
    ...state,
    pages: state.pages.map((page) => page.map(mapItem)),
    wallpaper: {
      fetchedOn: state.wallpaper.fetchedOn,
      wallhavenId: state.wallpaper.wallhavenId,
      imageUrl: '',
    },
  };
}

async function writeWallpaperImage(imageUrl: string): Promise<void> {
  await idbSet(IDB_WALLPAPER, imageUrl);
  // Drop legacy chrome.storage copy so it cannot re-bloat / race meta.
  try {
    await legacyWallpaperStore.setValue('');
  } catch {
    /* ignore */
  }
}

async function writeNow(state: YtabState): Promise<void> {
  const imageUrl = state.wallpaper.imageUrl ?? '';
  // Meta first and alone — wallpaper failure must never wipe Apps.
  await ytabStore.setValue(compactMeta(state));
  try {
    await writeWallpaperImage(imageUrl);
  } catch (err) {
    console.error('[ytab] wallpaper image persist failed', err);
  }
}

export async function loadState(): Promise<YtabState> {
  const value = await ytabStore.getValue();
  const state = value ?? createEmptyState();

  let imageUrl = '';
  try {
    imageUrl = await idbGet(IDB_WALLPAPER);
  } catch (err) {
    console.error('[ytab] wallpaper image read failed', err);
  }

  // Migrate pixels out of chrome.storage (old single-key or legacy split key).
  const legacy = (await legacyWallpaperStore.getValue()) ?? '';
  const embedded = state.wallpaper.imageUrl ?? '';
  if (!imageUrl && (legacy || embedded)) {
    imageUrl = legacy || embedded;
    try {
      await writeWallpaperImage(imageUrl);
      await ytabStore.setValue(compactMeta({ ...state, wallpaper: { ...state.wallpaper, imageUrl } }));
    } catch (err) {
      console.error('[ytab] wallpaper migrate failed', err);
    }
  } else if (embedded.startsWith('data:') || embedded.length > 2048) {
    // Strip leftover pixels from meta even when IDB already has the image.
    try {
      await ytabStore.setValue(compactMeta(state));
    } catch {
      /* ignore */
    }
  }

  return {
    ...state,
    wallpaper: { ...state.wallpaper, imageUrl },
  };
}

export async function saveState(state: YtabState): Promise<void> {
  latest = state;
  const run = writeChain.then(async () => {
    while (latest) {
      const toWrite = latest;
      latest = null;
      await writeNow(toWrite);
    }
  });
  writeChain = run.catch((err) => {
    console.error('[ytab] saveState failed', err);
  });
  await run;
}

export async function patchState(
  patch: (prev: YtabState) => YtabState,
): Promise<YtabState> {
  const prev = await loadState();
  const next = patch(prev);
  await saveState(next);
  return next;
}
