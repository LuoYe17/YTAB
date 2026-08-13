import { describe, expect, it, vi } from 'vitest';
import { META_ICON_PREFIX } from './iconPersist';
import { persistPlan, saveState } from './storage';
import { createEmptyState, type AppItem, type FolderItem } from './types';

const { setMetaValue } = vi.hoisted(() => ({
  setMetaValue: vi.fn(async () => {}),
}));

// persistPlan 与 chrome.storage 同模块；defineItem 会摸 runtime，纯顺序测试不需要。
vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => null,
      setValue: setMetaValue,
    }),
  },
}));

function app(id: string, icon: string): AppItem {
  return { id, kind: 'app', name: id, url: `https://example.com/${id}`, icon };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

describe('persistPlan', () => {
  it('顺序：壁纸像素 → 每个 data: 图标 → meta；meta 清壁纸、data: 改 idb:', () => {
    const dataA = 'data:image/png;base64,aaa';
    const dataB = 'data:image/png;base64,bbb';
    const http = 'https://example.com/c.png';
    const wp = 'data:image/jpeg;base64,wp';
    const steps = persistPlan({
      ...createEmptyState(),
      pages: [[app('a', dataA), folder('f', [app('b', dataB), app('c', http)])]],
      wallpaper: { imageUrl: wp, fetchedOn: '2026-01-01', wallhavenId: 'w' },
    });

    expect(steps.map((s) => s.kind)).toEqual(['wallpaper', 'icon', 'icon', 'meta']);
    expect(steps[0]).toEqual({ kind: 'wallpaper', imageUrl: wp });
    expect(steps[1]).toEqual({ kind: 'icon', id: 'a', data: dataA });
    expect(steps[2]).toEqual({ kind: 'icon', id: 'b', data: dataB });

    const metaStep = steps[3];
    expect(metaStep?.kind).toBe('meta');
    if (metaStep?.kind !== 'meta') return;
    expect(metaStep.meta.wallpaper.imageUrl).toBe('');
    expect(metaStep.meta.wallpaper.fetchedOn).toBe('2026-01-01');
    expect(metaStep.meta.pages[0]![0]).toMatchObject({ id: 'a', icon: `${META_ICON_PREFIX}a` });
    const f = metaStep.meta.pages[0]![1];
    expect(f?.kind).toBe('folder');
    if (f?.kind !== 'folder') return;
    expect(f.children[0]?.icon).toBe(`${META_ICON_PREFIX}b`);
    expect(f.children[1]?.icon).toBe(http);
  });

  it('http 图标保持原址，不产生 icon 步骤', () => {
    const http = 'https://example.com/a.png';
    const steps = persistPlan({
      ...createEmptyState(),
      pages: [[app('a', http)]],
    });

    expect(steps.map((s) => s.kind)).toEqual(['wallpaper', 'meta']);
    const metaStep = steps[1];
    expect(metaStep?.kind).toBe('meta');
    if (metaStep?.kind !== 'meta') return;
    expect(metaStep.meta.pages[0]![0]).toMatchObject({ id: 'a', icon: http });
    expect(metaStep.meta.wallpaper.imageUrl).toBe('');
  });
});

describe('saveState', () => {
  it('壁纸写入失败则整单中止，不提交 fetchedOn/wallhavenId', async () => {
    setMetaValue.mockClear();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('idb down');
      },
    });
    await expect(
      saveState({
        ...createEmptyState(),
        wallpaper: { imageUrl: 'data:image/jpeg;base64,wp', fetchedOn: '2026-01-01', wallhavenId: 'w' },
      }),
    ).rejects.toThrow();
    expect(setMetaValue).not.toHaveBeenCalled();
    err.mockRestore();
    vi.unstubAllGlobals();
  });
});
