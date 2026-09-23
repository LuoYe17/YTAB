import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { svgDataUrl } from './appIcons';
import { exportYtab, importYtab } from './backup';
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

  it('密钥留在包里，不在这一层剥掉（加密发生在 accountBackup）', async () => {
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

/** jsdom / node 都没有 FileReader，而 blobToDataUrl 要用；这里只补到够读 Blob。 */
function stubFileReader() {
  vi.stubGlobal(
    'FileReader',
    class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(blob: Blob) {
        blob
          .arrayBuffer()
          .then((buf) => {
            this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
            this.onload?.();
          })
          .catch(() => this.onerror?.());
      }
    },
  );
}

/** data URL 里的图片真身；base64 与百分号两种编码都认。 */
function iconText(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  const payload = dataUrl.slice(comma + 1);
  return decodeURIComponent(dataUrl.slice(5, comma).includes('base64') ? atob(payload) : payload);
}

function appOf(state: ReturnType<typeof createEmptyState>): string {
  const item = state.pages[0]![0];
  return item?.kind === 'app' ? item.icon : '';
}

// jsdom / node 的 Blob 喂不进 JSZip（拿不到底层数据）；测试里直接把 ArrayBuffer 递过去，
// 生产路径走的是文件框给的 File。
async function importArrayBuffer(file: Blob): Promise<ReturnType<typeof importYtab>> {
  return importYtab((await file.arrayBuffer()) as unknown as Blob);
}

describe('importYtab', () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#4D6BFE"/></svg>';

  it('charset=utf-8 的图标过一遍导出导入仍是真图', async () => {
    stubFileReader();
    try {
      const original = svgDataUrl(SVG);
      const blob = await exportYtab({ ...createEmptyState(), pages: [[app('a', original)]] });

      const back = await importArrayBuffer(blob);
      const icon = appOf(back);

      expect(iconText(icon)).toBe(SVG);
      // 关键：不再是 base64 包着百分号串（浏览器解不出那种图）
      expect(iconText(icon).startsWith('<svg')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('老版本写坏的包（ZIP 里是百分号文本）导入时就还原成真图', async () => {
    stubFileReader();
    try {
      const bundled = svgDataUrl(SVG);
      const zip = new JSZip();
      zip.file(
        'ytab.json',
        JSON.stringify({
          version: 1,
          state: { ...createEmptyState(), pages: [[app('a', 'icon:a')]] },
        }),
      );
      zip.file('icons/a.svg', bundled.slice(bundled.indexOf(',') + 1));

      const back = await importYtab((await zip.generateAsync({ type: 'arraybuffer' })) as unknown as Blob);
      const icon = appOf(back);

      expect(iconText(icon)).toBe(SVG);
      expect(icon.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
