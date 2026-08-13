import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
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
  it('includeIcons false：无 icons/ 文件，json 不含 data: / idb: / icon:', async () => {
    const http = 'https://cdn.example.com/a.png';
    const blob = await exportYtab(
      {
        ...createEmptyState(),
        pages: [[
          app('a', 'data:image/png;base64,AAAA'),
          folder('f', [app('b', `${META_ICON_PREFIX}b`)]),
          app('c', http),
        ]],
      },
      { includeIcons: false, includeApiKey: false },
    );
    const { state, iconPaths } = await readExport(blob);
    expect(iconPaths).toEqual([]);
    const json = JSON.stringify(state);
    expect(json.includes('data:')).toBe(false);
    expect(json.includes('idb:')).toBe(false);
    expect(json.includes('icon:')).toBe(false);
    expect(state.pages[0]![0]?.kind === 'app' && state.pages[0]![0].icon).toBe(
      faviconUrlFor('https://example.com/a'),
    );
    const f = state.pages[0]![1];
    expect(f?.kind).toBe('folder');
    if (f?.kind !== 'folder') return;
    expect(f.children[0]?.icon).toBe(faviconUrlFor('https://example.com/b'));
    expect(state.pages[0]![2]?.kind === 'app' && state.pages[0]![2].icon).toBe(http);
  });

  it('includeIcons true：data: 进 ZIP；未打包的 idb: 改成 favicon', async () => {
    const blob = await exportYtab(
      {
        ...createEmptyState(),
        pages: [[app('a', 'data:image/png;base64,AAAA'), app('b', `${META_ICON_PREFIX}b`)]],
      },
      { includeIcons: true, includeApiKey: false },
    );
    const { state, iconPaths } = await readExport(blob);
    expect(iconPaths.some((p) => p.startsWith('icons/a.'))).toBe(true);
    expect(state.pages[0]![0]?.kind === 'app' && state.pages[0]![0].icon).toBe('icon:a');
    expect(state.pages[0]![1]?.kind === 'app' && state.pages[0]![1].icon).toBe(
      faviconUrlFor('https://example.com/b'),
    );
  });

  it('不含密钥时测通标记一并清掉，避免勾还在密钥却空', async () => {
    const blob = await exportYtab(
      {
        ...createEmptyState(),
        settings: {
          ...createEmptyState().settings,
          wallhavenApiKey: 'secret',
          wallhavenKeyOk: true,
        },
      },
      { includeIcons: false, includeApiKey: false },
    );
    const { state } = await readExport(blob);
    expect(state.settings.wallhavenApiKey).toBe('');
    expect(state.settings.wallhavenKeyOk).toBe(false);
  });
});
