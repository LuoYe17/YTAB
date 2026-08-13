import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { exportYtab } from './backup';
import { faviconUrlFor } from './defaults';
import { META_ICON_PREFIX } from './iconPersist';
import { createEmptyState, type AppItem, type FolderItem } from './types';

function app(id: string, icon: string): AppItem {
  return { id, kind: 'app', name: id, url: `https://example.com/${id}`, icon };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

async function readExport(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const metaFile = zip.file('ytab.json');
  if (!metaFile) throw new Error('missing ytab.json');
  const meta = JSON.parse(await metaFile.async('string')) as {
    state: ReturnType<typeof createEmptyState>;
  };
  const iconPaths = Object.keys(zip.files).filter((name) => name.startsWith('icons/') && !zip.files[name]?.dir);
  return { zip, state: meta.state, iconPaths };
}

describe('exportYtab', () => {
  it('data: 图标进 ZIP，文件夹里的一并打包', async () => {
    const blob = await exportYtab({
      ...createEmptyState(),
      pages: [[
        app('a', 'data:image/png;base64,AAAA'),
        folder('f', [app('b', 'data:image/png;base64,BBBB')]),
      ]],
    });
    const { state, iconPaths } = await readExport(blob);

    expect(iconPaths.some((p) => p.startsWith('icons/a.'))).toBe(true);
    expect(iconPaths.some((p) => p.startsWith('icons/b.'))).toBe(true);
    expect(state.pages[0]![0]?.kind === 'app' && state.pages[0]![0].icon).toBe('icon:a');
    const f = state.pages[0]![1];
    expect(f?.kind).toBe('folder');
    if (f?.kind !== 'folder') return;
    expect(f.children[0]?.icon).toBe('icon:b');
  });

  it('没打包成的 idb: 改成站点 favicon，抓不到的 http 保留原址', async () => {
    // 断网导出：远程图抓不下来，引用不能因此丢失。
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const http = 'https://cdn.example.com/a.png';
    try {
      const blob = await exportYtab({
        ...createEmptyState(),
        pages: [[app('b', `${META_ICON_PREFIX}b`), app('c', http)]],
      });
      const { state, iconPaths } = await readExport(blob);

      expect(iconPaths).toEqual([]);
      expect(state.pages[0]![0]?.kind === 'app' && state.pages[0]![0].icon).toBe(
        faviconUrlFor('https://example.com/b'),
      );
      expect(state.pages[0]![1]?.kind === 'app' && state.pages[0]![1].icon).toBe(http);
      expect(JSON.stringify(state).includes(META_ICON_PREFIX)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('密钥随整份打包：出门前会被加密，云端只见密文', async () => {
    const blob = await exportYtab({
      ...createEmptyState(),
      settings: {
        ...createEmptyState().settings,
        wallhavenApiKey: 'secret',
        wallhavenKeyOk: true,
      },
    });
    const { state } = await readExport(blob);

    expect(state.settings.wallhavenApiKey).toBe('secret');
    expect(state.settings.wallhavenKeyOk).toBe(true);
  });
});
