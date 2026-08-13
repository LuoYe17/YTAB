import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { faviconUrlFor } from './defaults';
import { META_ICON_PREFIX, iconIdbKey } from './iconPersist';
import { createPersist, type KvStore, type MetaStore } from './storage';
import { createEmptyState, type AppItem, type FolderItem, type GridItem, type YtabState } from './types';

const DATA_A = 'data:image/png;base64,aaa';
const DATA_B = 'data:image/png;base64,bbb';
const HTTP_ICON = 'https://example.com/c.png';
const WALLPAPER = 'data:image/jpeg;base64,wp';

function app(id: string, icon = '', url = `https://example.com/${id}`): AppItem {
  return { id, kind: 'app', name: id, url, icon };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

function stateOf(items: GridItem[], imageUrl = ''): YtabState {
  return {
    ...createEmptyState(),
    pages: [items],
    wallpaper: { imageUrl, fetchedOn: '2026-01-01', wallhavenId: 'w' },
  };
}

/** 内存 adapter；`calls` 记录写入序列，`fail` 可中途开关以模拟介质出问题。 */
function memPersist(seed: { meta?: YtabState; legacy?: string } = {}) {
  const calls: string[] = [];
  const batches: { entries: Map<string, string>; deleteKeys: string[] }[] = [];
  const kvMap = new Map<string, string>();
  const fail = { kvSet: false, writeBatch: false, kvRead: false };
  let metaValue: YtabState | null = seed.meta ? structuredClone(seed.meta) : null;
  let legacy = seed.legacy ?? '';

  const meta: MetaStore = {
    get: async () => (metaValue ? structuredClone(metaValue) : null),
    set: async (state) => {
      calls.push('meta.set');
      metaValue = structuredClone(state);
    },
    getLegacyWallpaper: async () => legacy,
    clearLegacyWallpaper: async () => {
      calls.push('meta.clearLegacy');
      legacy = '';
    },
  };

  const kv: KvStore = {
    get: async (key) => {
      if (fail.kvRead) throw new Error('kv read down');
      return kvMap.get(key) ?? '';
    },
    keys: async () => {
      if (fail.kvRead) throw new Error('kv read down');
      return [...kvMap.keys()];
    },
    set: async (key, value) => {
      calls.push('kv.set');
      if (fail.kvSet) throw new Error('kv set down');
      kvMap.set(key, value);
    },
    writeBatch: async (entries, dropKey) => {
      calls.push('kv.writeBatch');
      // 与真实 adapter 一样：列举发生在这一次事务里
      const deleteKeys = [...kvMap.keys()].filter(dropKey);
      batches.push({ entries: new Map(entries), deleteKeys });
      if (fail.writeBatch) throw new Error('kv batch down');
      for (const [key, value] of entries) kvMap.set(key, value);
      for (const key of deleteKeys) kvMap.delete(key);
    },
  };

  return {
    ...createPersist({ meta, kv }),
    calls,
    batches,
    kvMap,
    fail,
    /** 落盘序列，去掉 legacy 清理噪声 */
    writes: () => calls.filter((c) => c !== 'meta.clearLegacy'),
    storedMeta: () => metaValue,
    storedLegacy: () => legacy,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('落盘顺序与失败', () => {
  it('壁纸像素 → 图标与 GC 同事务 → meta', async () => {
    const p = memPersist();
    await p.save(stateOf([app('a', DATA_A), folder('f', [app('b', DATA_B)])], WALLPAPER));

    expect(p.writes()).toEqual(['kv.set', 'kv.writeBatch', 'meta.set']);
    expect(p.batches).toHaveLength(1);
    expect([...p.batches[0]!.entries.keys()]).toEqual([iconIdbKey('a'), iconIdbKey('b')]);
  });

  it('壁纸像素写失败则整单中止，不提交 meta', async () => {
    const p = memPersist();
    p.fail.kvSet = true;

    await expect(p.save(stateOf([app('a', DATA_A)], WALLPAPER))).rejects.toThrow();
    expect(p.writes()).toEqual(['kv.set']);
    expect(p.storedMeta()).toBeNull();
  });

  it('有新图标像素却写失败时不发 meta，免得 idb: 引用永远空白', async () => {
    const p = memPersist();
    p.fail.writeBatch = true;

    await p.save(stateOf([app('a', DATA_A)], WALLPAPER));
    expect(p.writes()).toEqual(['kv.set', 'kv.writeBatch']);
    expect(p.storedMeta()).toBeNull();
  });

  it('没有新像素时，事务失败仍提交 meta', async () => {
    const p = memPersist();
    p.fail.writeBatch = true;

    await p.save(stateOf([app('c', HTTP_ICON)], WALLPAPER));
    expect(p.writes()).toEqual(['kv.set', 'kv.writeBatch', 'meta.set']);
    expect(p.storedMeta()?.pages[0]![0]).toMatchObject({ icon: HTTP_ICON });
  });
});

describe('图标像素与 GC', () => {
  it('data: 进 kv 并在 meta 里换成引用；http 原址保留', async () => {
    const p = memPersist();
    await p.save(stateOf([app('a', DATA_A), app('c', HTTP_ICON)], WALLPAPER));

    expect(p.kvMap.get(iconIdbKey('a'))).toBe(DATA_A);
    expect(p.kvMap.has(iconIdbKey('c'))).toBe(false);
    expect(p.storedMeta()?.pages[0]![0]).toMatchObject({ icon: `${META_ICON_PREFIX}a` });
    expect(p.storedMeta()?.pages[0]![1]).toMatchObject({ icon: HTTP_ICON });
    expect(p.storedMeta()?.wallpaper.imageUrl).toBe('');
  });

  it('删掉 App 后清掉它的图标像素，活着的不动', async () => {
    const p = memPersist();
    await p.save(stateOf([app('a', DATA_A), app('b', DATA_B)], WALLPAPER));
    await p.save(stateOf([app('a', DATA_A)], WALLPAPER));

    expect(p.batches.at(-1)!.deleteKeys).toEqual([iconIdbKey('b')]);
    expect(p.kvMap.has(iconIdbKey('b'))).toBe(false);
    expect(p.kvMap.get(iconIdbKey('a'))).toBe(DATA_A);
  });

  it('壁纸像素不被图标 GC 误删', async () => {
    const p = memPersist();
    await p.save(stateOf([app('a', DATA_A), app('b', DATA_B)], WALLPAPER));
    await p.save(stateOf([app('a', DATA_A)], WALLPAPER));

    expect((await p.load()).wallpaper.imageUrl).toBe(WALLPAPER);
  });
});

describe('读回', () => {
  it('save 后 load 拿回同一份，像素填回图标', async () => {
    const p = memPersist();
    const state = stateOf([app('a', DATA_A), folder('f', [app('b', DATA_B)])], WALLPAPER);
    await p.save(state);

    const loaded = await p.load();
    expect(loaded.wallpaper.imageUrl).toBe(WALLPAPER);
    expect(loaded.pages[0]![0]).toMatchObject({ id: 'a', icon: DATA_A });
    const f = loaded.pages[0]![1];
    expect(f?.kind).toBe('folder');
    if (f?.kind !== 'folder') return;
    expect(f.children[0]).toMatchObject({ id: 'b', icon: DATA_B });
  });

  it('像素丢了就回退站点 favicon，不留空白磁贴', async () => {
    const orphan = app('a', `${META_ICON_PREFIX}a`);
    const p = memPersist({ meta: stateOf([orphan]) });

    const loaded = await p.load();
    expect(loaded.pages[0]![0]).toMatchObject({ icon: faviconUrlFor(orphan.url) });
  });

  it('像素读不出来时退回 favicon，但不许把引用写回盘', async () => {
    const p = memPersist();
    await p.save(stateOf([app('a', DATA_A)], WALLPAPER));
    const before = p.storedMeta();
    p.calls.length = 0;
    p.fail.kvRead = true;

    const loaded = await p.load();
    expect(loaded.pages[0]![0]).toMatchObject({ icon: faviconUrlFor('https://example.com/a') });
    // 一旦回写，meta 里的 idb:a 就会变成 favicon，而像素其实还躺在 kv 里
    expect(p.writes()).not.toContain('meta.set');
    expect(p.storedMeta()).toEqual(before);
    expect(p.kvMap.get(iconIdbKey('a'))).toBe(DATA_A);
  });

  it('内置作者图标升级会顺手落盘', async () => {
    const p = memPersist({ meta: stateOf([app('gh', '', 'https://github.com/')]) });

    const loaded = await p.load();
    const upgraded = loaded.pages[0]![0]!;
    expect(upgraded.kind).toBe('app');
    if (upgraded.kind !== 'app') return;
    expect(upgraded.icon.startsWith('data:image/svg+xml')).toBe(true);
    expect(p.writes()).toContain('meta.set');
  });
});

describe('迁移', () => {
  it('legacy 壁纸 key 迁进 kv 并被清掉', async () => {
    const p = memPersist({ meta: stateOf([app('a', HTTP_ICON)]), legacy: WALLPAPER });

    expect((await p.load()).wallpaper.imageUrl).toBe(WALLPAPER);
    expect(p.storedLegacy()).toBe('');
    expect((await p.load()).wallpaper.imageUrl).toBe(WALLPAPER);
  });

  it('meta 里嵌着 data: 壁纸时剥离并落盘', async () => {
    const p = memPersist({ meta: stateOf([app('a', HTTP_ICON)], WALLPAPER) });

    expect((await p.load()).wallpaper.imageUrl).toBe(WALLPAPER);
    expect(p.storedMeta()?.wallpaper.imageUrl).toBe('');
    expect(p.storedMeta()?.wallpaper.fetchedOn).toBe('2026-01-01');
  });

  it('meta 里嵌着 data: 图标时迁进 kv', async () => {
    const p = memPersist({ meta: stateOf([app('a', DATA_A)]) });

    await p.load();
    expect(p.kvMap.get(iconIdbKey('a'))).toBe(DATA_A);
    expect(p.storedMeta()?.pages[0]![0]).toMatchObject({ icon: `${META_ICON_PREFIX}a` });
  });
});

describe('写入队列', () => {
  it('连发只落最后一份', async () => {
    const p = memPersist();
    const first = p.save({ ...stateOf([app('a', HTTP_ICON)]), hitokoto: { text: '1', from: '' } });
    const second = p.save({ ...stateOf([app('a', HTTP_ICON)]), hitokoto: { text: '2', from: '' } });
    const third = p.save({ ...stateOf([app('a', HTTP_ICON)]), hitokoto: { text: '3', from: '' } });
    await Promise.all([first, second, third]);

    expect(p.writes().filter((c) => c === 'meta.set')).toHaveLength(1);
    expect(p.storedMeta()?.hitokoto.text).toBe('3');
  });

  it('一次失败不卡住后续 save', async () => {
    const p = memPersist();
    p.fail.kvSet = true;
    await expect(p.save(stateOf([app('a', HTTP_ICON)], WALLPAPER))).rejects.toThrow();

    p.fail.kvSet = false;
    await p.save(stateOf([app('a', HTTP_ICON)], WALLPAPER));
    expect(p.storedMeta()?.pages[0]![0]).toMatchObject({ id: 'a' });
  });
});
