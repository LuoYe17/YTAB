import { describe, expect, it, vi } from 'vitest';
import { createGridController } from './gridController.svelte';
import type { AppItem, FolderItem, GridItem } from './types';

function app(id: string): AppItem {
  return { id, kind: 'app', name: id, url: `https://${id}.example`, icon: '' };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

function makeController(initial: GridItem[][] = [[]]) {
  const pages: GridItem[][] = initial;
  const persist = vi.fn(async (p: GridItem[][]) => {
    pages.length = 0;
    pages.push(...p.map((page) => [...page]));
  });
  const grid = createGridController({ getPages: () => pages, persistPages: persist });
  return { grid, pages, persist };
}

describe('gridController', () => {
  it('addApp 追加并持久化', async () => {
    const { grid, pages, persist } = makeController();
    await grid.addApp(app('a'));
    expect(pages[0]!.map((i) => i.id)).toEqual(['a']);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('mergeApps 合文件夹', async () => {
    const a = app('a');
    const b = app('b');
    const { grid, pages } = makeController([[a, b]]);
    await grid.mergeApps('a', 'b');
    expect(pages[0]).toHaveLength(1);
    expect(pages[0]![0]!.kind).toBe('folder');
  });

  it('openFolderItem 打开/关闭文件夹', async () => {
    const a = app('a');
    const b = app('b');
    const f = folder('f', [a, b]);
    const { grid, pages } = makeController([[f]]);
    await grid.openFolderItem(f);
    expect(grid.openFolder?.id).toBe('f');
    grid.closeFolder();
    expect(grid.openFolder).toBeNull();
    expect(pages).toEqual([[f]]);
  });

  it('只剩 1 个 App 时打开文件夹直接拆开并落盘', async () => {
    const a = app('a');
    const f = folder('f', [a]);
    const { grid, pages, persist } = makeController([[f]]);
    await grid.openFolderItem(f);
    expect(grid.openFolder).toBeNull();
    expect(pages[0]!.map((i) => i.id)).toEqual(['a']);
    expect(persist).toHaveBeenCalled();
  });

  it('Esc 回滚拖拽快照', async () => {
    const a = app('a');
    const { grid, pages } = makeController([[a]]);
    grid.onGridDragSessionStart();
    await grid.addApp(app('b'));
    expect(pages[0]!.map((i) => i.id)).toEqual(['a', 'b']);
    await grid.onGridDragSessionCancel();
    expect(pages[0]!.map((i) => i.id)).toEqual(['a']);
  });

  it('renameFolder 更新文件夹名与打开的文件夹', async () => {
    const a = app('a');
    const b = app('b');
    const f = folder('f', [a, b]);
    const { grid, pages } = makeController([[f]]);
    await grid.openFolderItem(f);
    await grid.renameFolder('f', '工作');
    expect(pages[0]![0]!.kind === 'folder' && pages[0]![0]!.name).toBe('工作');
    expect(grid.openFolder?.name).toBe('工作');
  });
});
