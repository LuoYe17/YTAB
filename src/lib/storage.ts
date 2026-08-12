/** 持久化：chrome.storage 只放小 meta；壁纸与 App 图标像素在 IndexedDB。 */

import { storage } from 'wxt/utils/storage';
import { createEmptyState, type YtabState } from './types';
import {
  IDB_ICON_PREFIX,
  collectAppIds,
  extractIconBlobs,
  hydrateIconBlobs,
  iconIdbKey,
  staleIconKeys,
} from './iconPersist';

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

async function idbGetAllKeys(): Promise<string[]> {
  const db = await openIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () =>
        resolve((req.result ?? []).filter((k): k is string => typeof k === 'string'));
      req.onerror = () => reject(req.error ?? new Error('idb keys failed'));
    });
  } finally {
    db.close();
  }
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

async function writeIconBlobs(blobs: Map<string, string>, liveIds: Set<string>): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb icon write failed'));
      for (const [id, data] of blobs) {
        store.put(data, iconIdbKey(id));
      }
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = (keysReq.result ?? []).filter((k): k is string => typeof k === 'string');
        for (const key of staleIconKeys(keys, liveIds)) {
          store.delete(key);
        }
      };
    });
  } finally {
    db.close();
  }
}

async function readIconBlobs(): Promise<Map<string, string>> {
  const keys = await idbGetAllKeys();
  const blobs = new Map<string, string>();
  for (const key of keys) {
    if (!key.startsWith(IDB_ICON_PREFIX)) continue;
    const value = await idbGet(key);
    if (value) blobs.set(key.slice(IDB_ICON_PREFIX.length), value);
  }
  return blobs;
}

async function writeNow(state: YtabState): Promise<void> {
  const imageUrl = state.wallpaper.imageUrl ?? '';
  const { meta, blobs } = extractIconBlobs(state);
  // Meta first and alone — wallpaper / icon pixel failure must never wipe Apps.
  await ytabStore.setValue(meta);
  try {
    await writeWallpaperImage(imageUrl);
  } catch (err) {
    console.error('[ytab] wallpaper image persist failed', err);
  }
  try {
    await writeIconBlobs(blobs, collectAppIds(state));
  } catch (err) {
    console.error('[ytab] icon persist failed', err);
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
      const { meta } = extractIconBlobs({ ...state, wallpaper: { ...state.wallpaper, imageUrl } });
      await ytabStore.setValue(meta);
    } catch (err) {
      console.error('[ytab] wallpaper migrate failed', err);
    }
  } else if (embedded.startsWith('data:') || embedded.length > 2048) {
    // Strip leftover pixels from meta even when IDB already has the image.
    try {
      const { meta } = extractIconBlobs(state);
      await ytabStore.setValue(meta);
    } catch {
      /* ignore */
    }
  }

  let iconBlobs = new Map<string, string>();
  try {
    iconBlobs = await readIconBlobs();
  } catch (err) {
    console.error('[ytab] icon read failed', err);
  }

  return hydrateIconBlobs({ ...state, wallpaper: { ...state.wallpaper, imageUrl } }, iconBlobs);
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
