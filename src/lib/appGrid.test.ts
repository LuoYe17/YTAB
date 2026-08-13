import { describe, expect, it } from 'vitest';
import { apply, createAppGridView } from './appGrid';
import type { AppItem, FolderItem } from './types';

function app(id: string, name = id): AppItem {
  return { id, kind: 'app', name, url: `https://example.com/${id}`, icon: '' };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

function idsOf(view: ReturnType<typeof createAppGridView>): string[] {
  return view.pages.flat().map((i) => i.id);
}

describe('apply', () => {
  it('合文件夹：两个 App 收进同一文件夹，发 id，松手 persist', () => {
    const view = createAppGridView([[app('a'), app('b')]]);
    const began = apply(view, { type: 'beginDrag', itemId: 'a' });
    expect(began.persist).toBe(false);
    const { view: next, persist } = apply(began.view, { type: 'merge', fromId: 'a', ontoId: 'b' });
    expect(persist).toBe(true);
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0]).toHaveLength(1);
    const f = next.pages[0]![0]!;
    expect(f.kind).toBe('folder');
    if (f.kind !== 'folder') return;
    expect(f.id.length).toBeGreaterThan(0);
    expect(f.children.map((c) => c.id)).toEqual(['b', 'a']);
    expect(next.dragSnapshot).toBeNull();
    expect(next.activeId).toBeNull();
  });

  it('跨页拖：翻页不 persist，松手才 persist', () => {
    const view = createAppGridView([[app('a'), app('b')], [app('c')]], 0);
    const began = apply(view, { type: 'beginDrag', itemId: 'a' });
    const flipped = apply(began.view, { type: 'pageFlip', toPage: 1 });
    expect(flipped.persist).toBe(false);
    expect(flipped.view.pageIndex).toBe(1);
    expect(flipped.view.dragSnapshot).not.toBeNull();
    expect(flipped.view.pages[0]!.map((i) => i.id)).toEqual(['b']);
    expect(flipped.view.pages[1]!.map((i) => i.id)).toEqual(['c', 'a']);
    const ended = apply(flipped.view, { type: 'endDrag' });
    expect(ended.persist).toBe(true);
    expect(ended.view.dragSnapshot).toBeNull();
    expect(ended.view.pages[1]!.map((i) => i.id)).toEqual(['c', 'a']);
  });

  it('拖着换位不 persist；Esc 回滚且不 persist', () => {
    const view = createAppGridView([[app('a'), app('b')]], 0);
    const began = apply(view, { type: 'beginDrag', itemId: 'a' });
    const moved = apply(began.view, { type: 'reorderPage', order: ['b', 'a'] });
    expect(moved.persist).toBe(false);
    expect(idsOf(moved.view)).toEqual(['b', 'a']);
    const canceled = apply(moved.view, { type: 'cancelDrag' });
    expect(canceled.persist).toBe(false);
    expect(idsOf(canceled.view)).toEqual(['a', 'b']);
    expect(canceled.view.pageIndex).toBe(0);
    expect(canceled.view.dragSnapshot).toBeNull();
  });

  it('文件夹内换位写入 pages 并 persist', () => {
    const a = app('a');
    const b = app('b');
    const f = folder('f', [a, b]);
    const view = { ...createAppGridView([[f]]), openFolder: f };
    const { view: next, persist } = apply(view, { type: 'reorderFolder', order: ['b', 'a'] });
    expect(persist).toBe(true);
    const item = next.pages[0]![0]!;
    expect(item.kind).toBe('folder');
    if (item.kind !== 'folder') return;
    expect(item.children.map((c) => c.id)).toEqual(['b', 'a']);
    expect(next.openFolder?.children.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('打开只含 1 个 App 的文件夹时直接拆开', () => {
    const a = app('a');
    const f = folder('f', [a]);
    const { view: next, persist } = apply(createAppGridView([[f]]), { type: 'openFolder', folderId: 'f' });
    expect(persist).toBe(true);
    expect(next.pages[0]).toEqual([a]);
    expect(next.openFolder).toBeNull();
  });

  it('eject 按 insertAt 插入当前页并关文件夹', () => {
    const a = app('a');
    const b = app('b');
    const c = app('c');
    const f = folder('f', [a, b]);
    const view = { ...createAppGridView([[f, c]]), openFolder: f };
    const { view: next, persist } = apply(view, { type: 'eject', appId: 'a', insertAt: 1 });
    expect(persist).toBe(true);
    expect(next.openFolder).toBeNull();
    expect(next.pages[0]!.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('编辑 App 保留 id，文件夹内外都能改', () => {
    const a = app('a', '旧');
    const b = app('b');
    const f = folder('f', [a, b]);
    const view = { ...createAppGridView([[f]]), openFolder: f };
    const { view: next, persist } = apply(view, { type: 'update', app: { ...a, name: '新' } });
    expect(persist).toBe(true);
    const folderItem = next.pages[0]![0]!;
    expect(folderItem.kind).toBe('folder');
    if (folderItem.kind !== 'folder') return;
    expect(folderItem.children[0]).toMatchObject({ id: 'a', name: '新' });
    expect(next.openFolder?.children[0]?.name).toBe('新');
  });

  it('删除网格上的 App，不把后页往前挤', () => {
    const page0 = Array.from({ length: 2 }, (_, i) => app(`p0-${i}`));
    const page1 = [app('keep')];
    const { view: next } = apply(createAppGridView([page0, page1], 0), {
      type: 'removeApp',
      appId: 'p0-0',
    });
    expect(next.pages).toHaveLength(2);
    expect(next.pages[0]!.map((i) => i.id)).toEqual(['p0-1']);
    expect(next.pages[1]!.map((i) => i.id)).toEqual(['keep']);
  });

  it('删空当前页则丢掉空页并夹住页码', () => {
    const { view: next } = apply(createAppGridView([[app('a')], [app('b')]], 0), {
      type: 'removeApp',
      appId: 'a',
    });
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0]!.map((i) => i.id)).toEqual(['b']);
    expect(next.pageIndex).toBe(0);
  });

  it('删除文件夹内 App：剩 1 个则拆开并关窗', () => {
    const a = app('a');
    const b = app('b');
    const f = folder('f', [a, b]);
    const view = { ...createAppGridView([[f]]), openFolder: f };
    const { view: next } = apply(view, { type: 'removeApp', appId: 'a' });
    expect(next.pages[0]).toEqual([b]);
    expect(next.openFolder).toBeNull();
  });

  it('删除文件夹连同其中 App', () => {
    const f = folder('f', [app('a'), app('b')]);
    const { view: next } = apply(
      { ...createAppGridView([[f, app('c')]]), openFolder: f },
      { type: 'removeFolder', folderId: 'f' },
    );
    expect(next.pages[0]!.map((i) => i.id)).toEqual(['c']);
    expect(next.openFolder).toBeNull();
  });

  it('开文件夹 / 翻页点不 persist', () => {
    const f = folder('f', [app('a'), app('b')]);
    const opened = apply(createAppGridView([[f], [app('c')]]), { type: 'openFolder', folderId: 'f' });
    expect(opened.persist).toBe(false);
    expect(opened.view.openFolder?.id).toBe('f');
    const paged = apply(createAppGridView([[f], [app('c')]]), { type: 'setPageIndex', pageIndex: 1 });
    expect(paged.persist).toBe(false);
    expect(paged.view.pageIndex).toBe(1);
  });
});
