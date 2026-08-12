import { describe, expect, it } from 'vitest';
import {
  addApp,
  beginDragSession,
  cancelDragSession,
  createAppGridView,
  ejectFromFolderAt,
  mergeApps,
  openFolderItem,
  reorderFolderChildren,
} from './appGrid';
import type { AppItem, FolderItem } from './types';

function app(id: string, name = id): AppItem {
  return { id, kind: 'app', name, url: `https://example.com/${id}`, icon: '' };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

describe('appGrid', () => {
  it('合文件夹：两个 App 收进同一文件夹', () => {
    const a = app('a');
    const b = app('b');
    const view = createAppGridView([[a, b]]);
    const next = mergeApps(view, 'a', 'b');
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0]).toHaveLength(1);
    const f = next.pages[0]![0]!;
    expect(f.kind).toBe('folder');
    if (f.kind !== 'folder') return;
    expect(f.children.map((c) => c.id)).toEqual(['b', 'a']);
    expect(next.dragSnapshot).toBeNull();
  });

  it('只剩 1 个 App 时自动拆开文件夹', () => {
    const a = app('a');
    const b = app('b');
    const f = folder('f', [a, b]);
    const view = { ...createAppGridView([[f]]), openFolder: f };
    const next = reorderFolderChildren(view, 'f', [a]);
    expect(next.pages[0]).toEqual([a]);
    expect(next.openFolder).toBeNull();
  });

  it('打开只含 1 个 App 的文件夹时直接拆开', () => {
    const a = app('a');
    const f = folder('f', [a]);
    const next = openFolderItem(createAppGridView([[f]]), f);
    expect(next.pages[0]).toEqual([a]);
    expect(next.openFolder).toBeNull();
  });

  it('eject 按 insertAt 插入当前页并关文件夹', () => {
    const a = app('a');
    const b = app('b');
    const c = app('c');
    const f = folder('f', [a, b]);
    const view = {
      ...createAppGridView([[f, c]]),
      openFolder: f,
    };
    const next = ejectFromFolderAt(view, 'f', 'a', 1);
    expect(next.openFolder).toBeNull();
    // f 拆成只剩 b；a 插入 index 1（在 b 与 c 之间，或视 collapse 后页内容）
    const ids = next.pages[0]!.map((i) => i.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids.indexOf('a')).toBe(1);
  });

  it('Esc 回滚拖拽快照', () => {
    const a = app('a');
    const b = app('b');
    let view = createAppGridView([[a, b]], 0);
    view = beginDragSession(view);
    view = addApp(view, app('c'));
    expect(flattenIds(view)).toContain('c');
    view = cancelDragSession(view);
    expect(flattenIds(view)).toEqual(['a', 'b']);
    expect(view.pageIndex).toBe(0);
    expect(view.dragSnapshot).toBeNull();
  });
});

function flattenIds(view: ReturnType<typeof createAppGridView>): string[] {
  return view.pages.flat().map((i) => i.id);
}
