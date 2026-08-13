/**
 * 持久化：chrome.storage 只放小 meta；壁纸与 App 图标像素在 IndexedDB。
 *
 * 两种介质的不变量不同，因此分成两个口注入：meta 装不下像素，kv 需要事务与 GC。
 * 写入顺序、半失败策略、迁移与合并写都在 `createPersist` 里，可用内存 adapter 整条验证。
 */

import { storage } from 'wxt/utils/storage';
import { applyBundledIcons, bundledIconDataUrls, pack } from './appIcons';
import { createEmptyState, mergeSettings, type YtabState } from './types';
import { IDB_ICON_PREFIX, collectAppIds, hydrateIconBlobs, iconIdbKey, staleIconKeys } from './iconPersist';

const META_KEY = 'local:ytab:v1' as const;
/** Legacy key — read once to migrate, then clear. */
const LEGACY_WALLPAPER_KEY = 'local:ytab:wallpaper:image' as const;

const IDB_NAME = 'ytab';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';
const IDB_WALLPAPER = 'wallpaperImage';

/** chrome.storage 侧：只放小 meta。像素挤进来会打爆配额，把整包状态一起赔进去。 */
export type MetaStore = {
  get(): Promise<YtabState | null>;
  set(state: YtabState): Promise<void>;
  /** 老版本把壁纸像素塞在 chrome.storage 里，读一次即迁走。 */
  getLegacyWallpaper(): Promise<string>;
  clearLegacyWallpaper(): Promise<void>;
};

/** IndexedDB 侧：壁纸与 App 图标像素。 */
export type KvStore = {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
  keys(): Promise<string[]>;
  /** 同一次事务写入 entries 并删掉 deleteKeys：半截 IDB 比慢更可怕。 */
  writeBatch(entries: Map<string, string>, deleteKeys: string[]): Promise<void>;
};

export type Persist = {
  load(): Promise<YtabState>;
  save(state: YtabState): Promise<void>;
};

/** 落盘步骤。数组顺序即写入顺序，不可重排。 */
type PersistStep =
  | { kind: 'wallpaper'; imageUrl: string }
  | { kind: 'icon'; id: string; data: string }
  | { kind: 'meta'; meta: YtabState };

/**
 * 把内存状态拆成有序落盘步骤：壁纸像素 → 各图标像素 → meta。
 * 顺序不能改：若先写 meta，像素失败后 `idb:` 引用会永久空白。
 */
function persistPlan(state: YtabState): PersistStep[] {
  const { meta, blobs } = pack(state);
  const steps: PersistStep[] = [{ kind: 'wallpaper', imageUrl: state.wallpaper.imageUrl ?? '' }];
  for (const [id, data] of blobs) {
    steps.push({ kind: 'icon', id, data });
  }
  steps.push({ kind: 'meta', meta });
  return steps;
}

/**
 * 起始页状态的读写。调用顺序无要求；连续 `save` 会合并，只落最后一份。
 *
 * 失败契约：壁纸像素写失败则整单中止并 reject（meta 里的 fetchedOn / wallhavenId
 * 不能在 imageUrl 仍空时提交）；有新图标像素却写失败时同样不发 meta，否则 `idb:`
 * 引用会指向永远不存在的像素。
 */
export function createPersist({ meta, kv }: { meta: MetaStore; kv: KvStore }): Persist {
  let writeChain: Promise<void> = Promise.resolve();
  let latest: YtabState | null = null;

  async function writeWallpaperImage(imageUrl: string): Promise<void> {
    await kv.set(IDB_WALLPAPER, imageUrl);
    // legacy 副本清不掉不影响本次写入，但留着会把配额重新撑起来。
    try {
      await meta.clearLegacyWallpaper();
    } catch {
      /* ignore */
    }
  }

  /** 图标像素与 GC 同一次事务：写一半再删一半会留下对不上的引用。 */
  async function writeIconBlobs(blobs: Map<string, string>, liveIds: Set<string>): Promise<void> {
    const entries = new Map<string, string>();
    for (const [id, data] of blobs) entries.set(iconIdbKey(id), data);
    await kv.writeBatch(entries, staleIconKeys(await kv.keys(), liveIds));
  }

  async function readIconBlobs(): Promise<Map<string, string>> {
    const blobs = new Map<string, string>();
    for (const key of await kv.keys()) {
      if (!key.startsWith(IDB_ICON_PREFIX)) continue;
      const value = await kv.get(key);
      if (value) blobs.set(key.slice(IDB_ICON_PREFIX.length), value);
    }
    return blobs;
  }

  async function writeNow(state: YtabState): Promise<void> {
    const blobs = new Map<string, string>();
    for (const step of persistPlan(state)) {
      switch (step.kind) {
        case 'wallpaper':
          try {
            await writeWallpaperImage(step.imageUrl);
          } catch (err) {
            console.error('[ytab] wallpaper image persist failed', err);
            throw err;
          }
          break;
        case 'icon':
          blobs.set(step.id, step.data);
          break;
        case 'meta':
          try {
            await writeIconBlobs(blobs, collectAppIds(state));
          } catch (err) {
            console.error('[ytab] icon persist failed', err);
            if (blobs.size > 0) return;
          }
          await meta.set(step.meta);
          break;
      }
    }
  }

  async function save(state: YtabState): Promise<void> {
    latest = state;
    const run = writeChain.then(async () => {
      while (latest) {
        const toWrite = latest;
        latest = null;
        await writeNow(toWrite);
      }
    });
    // catch 只修 writeChain，避免一次失败把后续 save 全部卡住；本 Promise 仍 reject。
    writeChain = run.catch((err) => {
      console.error('[ytab] saveState failed', err);
    });
    await run;
  }

  async function load(): Promise<YtabState> {
    const value = await meta.get();
    const state = value ?? createEmptyState();
    state.settings = mergeSettings(state.settings);

    let imageUrl = '';
    try {
      imageUrl = await kv.get(IDB_WALLPAPER);
    } catch (err) {
      console.error('[ytab] wallpaper image read failed', err);
    }

    // Migrate pixels out of chrome.storage (old single-key or legacy split key).
    const legacy = (await meta.getLegacyWallpaper()) ?? '';
    const embedded = state.wallpaper.imageUrl ?? '';
    const needsWallpaperMigrate = !imageUrl && !!(legacy || embedded);
    const needsMetaStrip = embedded.startsWith('data:') || embedded.length > 2048;
    if (needsWallpaperMigrate) {
      imageUrl = legacy || embedded;
    }

    let iconBlobs = new Map<string, string>();
    try {
      iconBlobs = await readIconBlobs();
    } catch (err) {
      console.error('[ytab] icon read failed', err);
    }

    const hydrated = { ...state, wallpaper: { ...state.wallpaper, imageUrl } };
    // hydrate / unpack 每次都是新对象；只能拿 applyBundledIcons 的「有改才换引用」判断要不要落盘。
    const afterHydrate = hydrateIconBlobs(hydrated, iconBlobs);
    const loaded = applyBundledIcons(afterHydrate, await bundledIconDataUrls());
    // chrome.storage 里若还嵌着 data: 图标，必须走 save 写入链，先落 IDB 再发 meta。
    const needsIconMigrate = pack(state).blobs.size > 0;
    const needsBundledUpgrade = loaded !== afterHydrate;
    if (needsWallpaperMigrate || needsMetaStrip || needsIconMigrate || needsBundledUpgrade) {
      await save(loaded);
    }

    return loaded;
  }

  return { load, save };
}

function chromeMetaStore(): MetaStore {
  const metaItem = storage.defineItem<YtabState>(META_KEY, { fallback: createEmptyState() });
  const legacyItem = storage.defineItem<string>(LEGACY_WALLPAPER_KEY, { fallback: '' });
  return {
    get: () => metaItem.getValue(),
    set: (state) => metaItem.setValue(state),
    getLegacyWallpaper: () => legacyItem.getValue(),
    clearLegacyWallpaper: () => legacyItem.setValue(''),
  };
}

function idbKvStore(): KvStore {
  function open(): Promise<IDBDatabase> {
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

  async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await open();
    try {
      return await run(db);
    } finally {
      db.close();
    }
  }

  return {
    get: (key) =>
      withDb(
        (db) =>
          new Promise<string>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
            req.onerror = () => reject(req.error ?? new Error('idb get failed'));
          }),
      ),

    set: (key, value) =>
      withDb(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('idb set failed'));
            tx.objectStore(IDB_STORE).put(value, key);
          }),
      ),

    keys: () =>
      withDb(
        (db) =>
          new Promise<string[]>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).getAllKeys();
            req.onsuccess = () =>
              resolve((req.result ?? []).filter((k): k is string => typeof k === 'string'));
            req.onerror = () => reject(req.error ?? new Error('idb keys failed'));
          }),
      ),

    writeBatch: (entries, deleteKeys) =>
      withDb(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('idb batch write failed'));
            for (const [key, value] of entries) store.put(value, key);
            for (const key of deleteKeys) store.delete(key);
          }),
      ),
  };
}

/** 生产实例懒建：import 本模块不该碰扩展运行时，否则测试与非扩展页一进来就炸。 */
let production: Persist | null = null;

function persist(): Persist {
  production ??= createPersist({ meta: chromeMetaStore(), kv: idbKvStore() });
  return production;
}

export function loadState(): Promise<YtabState> {
  return persist().load();
}

export function saveState(state: YtabState): Promise<void> {
  return persist().save(state);
}
