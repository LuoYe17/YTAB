import { describe, expect, it } from 'vitest';
import { faviconUrlFor } from './defaults';
import {
  META_ICON_PREFIX,
  collectAppIds,
  extractIconBlobs,
  hydrateIconBlobs,
  staleIconKeys,
  stripLocalIcons,
} from './iconPersist';
import { createEmptyState, type AppItem, type FolderItem } from './types';

function app(id: string, icon: string): AppItem {
  return { id, kind: 'app', name: id, url: `https://example.com/${id}`, icon };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

describe('icon persist split', () => {
  it('extract：data: 进 blobs，meta 改 idb 引用；http 不动；壁纸像素清空', () => {
    const data = 'data:image/png;base64,aaa';
    const http = 'https://example.com/a.png';
    const state = {
      ...createEmptyState(),
      pages: [[app('a', data), folder('f', [app('b', http)])]],
      wallpaper: { imageUrl: 'data:image/jpeg;base64,wp', fetchedOn: '2026-01-01', wallhavenId: 'w' },
    };
    const { meta, blobs } = extractIconBlobs(state);
    expect(blobs.get('a')).toBe(data);
    expect(blobs.has('b')).toBe(false);
    expect(meta.pages[0]![0]).toMatchObject({ id: 'a', icon: `${META_ICON_PREFIX}a` });
    const f = meta.pages[0]![1];
    expect(f?.kind).toBe('folder');
    if (f?.kind !== 'folder') return;
    expect(f.children[0]?.icon).toBe(http);
    expect(meta.wallpaper.imageUrl).toBe('');
    expect(meta.wallpaper.fetchedOn).toBe('2026-01-01');
  });

  it('hydrate：idb 引用填回像素；缺 blob 回退 favicon', () => {
    const data = 'data:image/png;base64,aaa';
    const state = {
      ...createEmptyState(),
      pages: [[app('a', `${META_ICON_PREFIX}a`), app('b', `${META_ICON_PREFIX}b`)]],
    };
    const next = hydrateIconBlobs(state, new Map([['a', data]]));
    expect(next.pages[0]![0]?.kind === 'app' && next.pages[0]![0].icon).toBe(data);
    expect(next.pages[0]![1]?.kind === 'app' && next.pages[0]![1].icon).toBe(
      faviconUrlFor('https://example.com/b'),
    );
  });

  it('staleIconKeys：只删已不在网格里的图标 key', () => {
    const live = collectAppIds({
      ...createEmptyState(),
      pages: [[app('a', ''), folder('f', [app('b', '')])]],
    });
    expect(live).toEqual(new Set(['a', 'b']));
    const stale = staleIconKeys(['icon:a', 'icon:gone', 'wallpaperImage'], live);
    expect(stale).toEqual(['icon:gone']);
  });

  it('stripLocalIcons：data: 与 idb: 改成站点 favicon，http 与空保留', () => {
    const http = 'https://cdn.example.com/a.png';
    const state = {
      ...createEmptyState(),
      pages: [[
        app('a', 'data:image/png;base64,aaa'),
        app('b', `${META_ICON_PREFIX}b`),
        app('c', http),
        app('d', ''),
      ]],
    };
    const next = stripLocalIcons(state);
    expect(next.pages[0]![0]?.kind === 'app' && next.pages[0]![0].icon).toBe(
      faviconUrlFor('https://example.com/a'),
    );
    expect(next.pages[0]![1]?.kind === 'app' && next.pages[0]![1].icon).toBe(
      faviconUrlFor('https://example.com/b'),
    );
    expect(next.pages[0]![2]?.kind === 'app' && next.pages[0]![2].icon).toBe(http);
    expect(next.pages[0]![3]?.kind === 'app' && next.pages[0]![3].icon).toBe('');
  });

  it('stripLocalIcons keepPackedRefs：ZIP 内 icon: 保留，未打包的 idb: 仍剥离', () => {
    const state = {
      ...createEmptyState(),
      pages: [[app('a', 'icon:a'), app('b', `${META_ICON_PREFIX}b`)]],
    };
    const next = stripLocalIcons(state, true);
    expect(next.pages[0]![0]?.kind === 'app' && next.pages[0]![0].icon).toBe('icon:a');
    expect(next.pages[0]![1]?.kind === 'app' && next.pages[0]![1].icon).toBe(
      faviconUrlFor('https://example.com/b'),
    );
  });
});
