/** App 网格：多页 + 文件夹 + 当前页 + 打开中文件夹 + 拖拽快照。纯计算；写不写盘只体现在 `apply` 的 persist。 */

import { newId } from './defaults';
import type { AppItem, FolderItem, GridItem } from './types';

const PAGE_CAPACITY = 19;

export type AppGridDragSnapshot = {
  pages: GridItem[][];
  pageIndex: number;
  /** 按下时打开中的文件夹；Esc 要连里面的换位一起回滚。 */
  openFolder: FolderItem | null;
};

export type AppGridView = {
  pages: GridItem[][];
  pageIndex: number;
  openFolder: FolderItem | null;
  dragSnapshot: AppGridDragSnapshot | null;
  /** 拖着的那一颗；瘦翻页事件靠它，不把拆好的页漏出 interface。 */
  activeId: string | null;
};

export type AppGridEvent =
  | { type: 'add'; app: AppItem }
  | { type: 'update'; app: AppItem }
  | { type: 'removeApp'; appId: string }
  | { type: 'removeFolder'; folderId: string }
  | { type: 'renameFolder'; folderId: string; name: string }
  | { type: 'merge'; fromId: string; ontoId: string }
  | { type: 'intoFolder'; appId: string; folderId: string }
  | { type: 'reorderPage'; order: string[] }
  | { type: 'reorderFolder'; order: string[] }
  | { type: 'pageFlip'; toPage: number }
  | { type: 'eject'; appId: string; insertAt: number }
  | { type: 'openFolder'; folderId: string }
  | { type: 'closeFolder' }
  | { type: 'beginDrag'; itemId: string }
  | { type: 'endDrag' }
  | { type: 'cancelDrag' }
  | { type: 'setPageIndex'; pageIndex: number };

export type AppGridApplyResult = {
  view: AppGridView;
  persist: boolean;
};

/** 空网格或从已 persist 的 pages 重建 live view（页码、打开中文件夹、拖拽快照都从零计）。 */
export function createAppGridView(
  pages: GridItem[][] = [[]],
  pageIndex = 0,
): AppGridView {
  return {
    pages,
    pageIndex,
    openFolder: null,
    dragSnapshot: null,
    activeId: null,
  };
}

/** 按每页 19 格切开；空列表仍是一页空数组。首次启动整表写入用，不走 `apply`。 */
export function paginate(items: GridItem[]): GridItem[][] {
  if (items.length === 0) return [[]];
  const pages: GridItem[][] = [];
  for (let i = 0; i < items.length; i += PAGE_CAPACITY) {
    pages.push(items.slice(i, i + PAGE_CAPACITY));
  }
  return pages.length ? pages : [[]];
}

function flattenPages(pages: GridItem[][]): GridItem[] {
  return pages.flat();
}

function rewritePages(items: GridItem[]): GridItem[][] {
  return paginate(items);
}

function cloneFolder(folder: FolderItem | null): FolderItem | null {
  if (!folder) return null;
  return { ...folder, children: folder.children.map((c) => ({ ...c })) };
}

function clonePages(pages: GridItem[][]): GridItem[][] {
  return pages.map((page) =>
    page.map((item) =>
      item.kind === 'folder'
        ? { ...item, children: item.children.map((c) => ({ ...c })) }
        : { ...item },
    ),
  );
}

/** 当前页上的 App / 文件夹，缺页当空。 */
export function currentPageItems(view: AppGridView): GridItem[] {
  return view.pages[view.pageIndex] ?? [];
}

/** 空文件夹删除；只剩 1 个 App 则拆开回到网格 */
function collapseFolder(folder: FolderItem, children: AppItem[]): GridItem[] {
  if (children.length === 0) return [];
  if (children.length === 1) return [children[0]!];
  return [{ ...folder, children }];
}

function addApp(view: AppGridView, app: AppItem): AppGridView {
  const all = flattenPages(view.pages);
  all.push(app);
  return {
    ...view,
    pageIndex: Math.max(0, Math.ceil(all.length / PAGE_CAPACITY) - 1),
    pages: rewritePages(all),
  };
}

function ended(view: AppGridView): AppGridView {
  return { ...view, dragSnapshot: null, activeId: null };
}

/** 两颗 App 收进同一文件夹。id 由本 module 发，调用方不得自造。 */
function mergeApps(view: AppGridView, fromId: string, ontoId: string): AppGridView {
  const all = flattenPages(view.pages);
  const fromIdx = all.findIndex((i) => i.id === fromId);
  const ontoIdx = all.findIndex((i) => i.id === ontoId);
  if (fromIdx < 0 || ontoIdx < 0) return ended(view);
  const fromItem = all[fromIdx];
  const ontoItem = all[ontoIdx];
  if (!fromItem || !ontoItem) return ended(view);
  if (fromItem.kind !== 'app' || ontoItem.kind !== 'app') return ended(view);

  const folder: FolderItem = {
    id: newId(),
    kind: 'folder',
    name: '文件夹',
    children: [ontoItem, fromItem],
  };
  const next = all.filter((i) => i.id !== fromId && i.id !== ontoId);
  next.splice(Math.min(fromIdx, ontoIdx), 0, folder);
  return ended({ ...view, pages: rewritePages(next) });
}

function dropIntoFolder(view: AppGridView, appId: string, folderId: string): AppGridView {
  const all = flattenPages(view.pages);
  const appIdx = all.findIndex((i) => i.id === appId);
  const folderIdx = all.findIndex((i) => i.id === folderId);
  if (appIdx < 0 || folderIdx < 0) return ended(view);
  const app = all[appIdx];
  const folder = all[folderIdx];
  if (!app || app.kind !== 'app' || !folder || folder.kind !== 'folder') {
    return ended(view);
  }

  const next = all
    .filter((i) => i.id !== appId)
    .map((i) =>
      i.id === folderId && i.kind === 'folder'
        ? { ...i, children: [...i.children, app] }
        : i,
    );
  return ended({ ...view, pages: rewritePages(next) });
}

function reorderPageByIds(view: AppGridView, order: string[]): AppGridView {
  const page = view.pages[view.pageIndex] ?? [];
  const byId = new Map(page.map((item) => [item.id, item]));
  const nextPage: GridItem[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item) continue;
    nextPage.push(item);
    byId.delete(id);
  }
  for (const item of page) {
    if (byId.has(item.id)) nextPage.push(item);
  }
  const pages = view.pages.map((p, i) => (i === view.pageIndex ? nextPage : p));
  return { ...view, pages };
}

function beginDragSession(view: AppGridView, itemId: string): AppGridView {
  return {
    ...view,
    activeId: itemId,
    dragSnapshot: {
      pages: clonePages(view.pages),
      pageIndex: view.pageIndex,
      openFolder: cloneFolder(view.openFolder),
    },
  };
}

function cancelDragSession(view: AppGridView): AppGridView {
  const snap = view.dragSnapshot;
  if (!snap) return ended(view);
  return ended({
    ...view,
    pages: snap.pages,
    pageIndex: snap.pageIndex,
    openFolder: snap.openFolder,
  });
}

function pageFlipDuringDrag(view: AppGridView, toPage: number): AppGridView {
  const id = view.activeId;
  if (!id) return view;
  const fromPage = view.pageIndex;
  if (toPage < 0 || toPage >= view.pages.length || toPage === fromPage) return view;
  const item = (view.pages[fromPage] ?? []).find((i) => i.id === id);
  if (!item) return view;
  const dest = view.pages[toPage] ?? [];
  // 目标页已满则拒绝翻页，否则会超过每页 19 格。
  if (dest.filter((x) => x.id !== id).length >= PAGE_CAPACITY) return view;
  const pages = view.pages.map((page, i) => {
    if (i === fromPage) return page.filter((x) => x.id !== id);
    if (i === toPage) return [...page.filter((x) => x.id !== id), item];
    return page;
  });
  return { ...view, pages, pageIndex: toPage };
}

function reorderFolderChildren(
  view: AppGridView,
  folderId: string,
  children: AppItem[],
): AppGridView {
  const pages = view.pages.map((page) =>
    page.flatMap((item) => {
      if (item.id !== folderId || item.kind !== 'folder') return [item];
      return collapseFolder(item, children);
    }),
  );

  let openFolder = view.openFolder;
  if (openFolder?.id === folderId) {
    if (children.length <= 1) openFolder = null;
    else openFolder = { ...openFolder, children };
  }

  return { ...view, pages, openFolder };
}

function findFolder(pages: GridItem[][], folderId: string): FolderItem | null {
  for (const page of pages) {
    for (const item of page) {
      if (item.kind === 'folder' && item.id === folderId) return item;
    }
  }
  return null;
}

function openFolderItem(view: AppGridView, folderId: string): AppGridView {
  const folder = findFolder(view.pages, folderId);
  if (!folder) return view;
  if (folder.children.length <= 1) {
    const pages = view.pages.map((page) =>
      page.flatMap((item) => {
        if (item.id !== folder.id || item.kind !== 'folder') return [item];
        return collapseFolder(item, item.children);
      }),
    );
    return { ...view, pages, openFolder: null };
  }
  return { ...view, openFolder: folder };
}

/** 文件夹拖出：insertAt 由指针 module 算好。 */
function ejectFromFolderAt(
  view: AppGridView,
  folderId: string,
  appId: string,
  insertAt: number,
): AppGridView {
  let ejected: AppItem | undefined;
  const pages = view.pages.map((p) => {
    const next: GridItem[] = [];
    for (const item of p) {
      if (item.id === folderId && item.kind === 'folder') {
        const hit = item.children.find((c) => c.id === appId);
        if (hit) ejected = hit;
        const children = item.children.filter((c) => c.id !== appId);
        next.push(...collapseFolder(item, children));
      } else {
        next.push(item);
      }
    }
    return next;
  });
  if (!ejected) return ended({ ...view, openFolder: null });

  const pi = view.pageIndex;
  const nextPages = pages.map((p, i) => {
    if (i !== pi) return p;
    const without = p.filter((x) => x.id !== ejected!.id);
    const at = Math.max(0, Math.min(insertAt, without.length));
    const out = [...without];
    out.splice(at, 0, ejected!);
    return out;
  });

  return ended({
    ...view,
    openFolder: null,
    pages: nextPages,
  });
}

function renameFolder(view: AppGridView, folderId: string, name: string): AppGridView {
  const pages = view.pages.map((page) =>
    page.map((item) =>
      item.id === folderId && item.kind === 'folder' ? { ...item, name } : item,
    ),
  );
  let openFolder = view.openFolder;
  if (openFolder?.id === folderId) {
    openFolder = { ...openFolder, name };
  }
  return { ...view, pages, openFolder };
}

/** 删除不把后页图标往前挤，只丢掉因此变空的页。 */
function dropEmptyPages(pages: GridItem[][], pageIndex: number): Pick<AppGridView, 'pages' | 'pageIndex'> {
  const next = pages.filter((p) => p.length > 0);
  const pagesOut = next.length ? next : [[]];
  return { pages: pagesOut, pageIndex: Math.min(pageIndex, pagesOut.length - 1) };
}

/** 按 id 改 App；文件夹内外和打开中的文件夹一起改。 */
function updateApp(view: AppGridView, app: AppItem): AppGridView {
  const pages = view.pages.map((page) =>
    page.map((item) => {
      if (item.kind === 'app' && item.id === app.id) return app;
      if (item.kind === 'folder') {
        return { ...item, children: item.children.map((c) => (c.id === app.id ? app : c)) };
      }
      return item;
    }),
  );
  let openFolder = view.openFolder;
  if (openFolder) {
    openFolder = { ...openFolder, children: openFolder.children.map((c) => (c.id === app.id ? app : c)) };
  }
  return { ...view, pages, openFolder };
}

/** 网格或文件夹内删除 App；删到只剩 1 个则拆文件夹。 */
function removeApp(view: AppGridView, appId: string): AppGridView {
  const pages = view.pages.map((page) =>
    page.flatMap((item) => {
      if (item.kind === 'app') return item.id === appId ? [] : [item];
      return collapseFolder(
        item,
        item.children.filter((c) => c.id !== appId),
      );
    }),
  );
  let openFolder = view.openFolder;
  if (openFolder?.children.some((c) => c.id === appId)) {
    const children = openFolder.children.filter((c) => c.id !== appId);
    openFolder = children.length <= 1 ? null : { ...openFolder, children };
  }
  return { ...view, ...dropEmptyPages(pages, view.pageIndex), openFolder };
}

/** 删除文件夹，其中的 App 一并去掉。 */
function removeFolder(view: AppGridView, folderId: string): AppGridView {
  const pages = view.pages.map((page) => page.filter((item) => item.id !== folderId));
  const openFolder = view.openFolder?.id === folderId ? null : view.openFolder;
  return { ...view, ...dropEmptyPages(pages, view.pageIndex), openFolder };
}

function setPageIndex(view: AppGridView, pageIndex: number): AppGridView {
  const max = Math.max(0, view.pages.length - 1);
  return { ...view, pageIndex: Math.max(0, Math.min(pageIndex, max)) };
}

function closeFolder(view: AppGridView): AppGridView {
  return { ...view, openFolder: null };
}

function reorderFolderByIds(view: AppGridView, order: string[]): AppGridView {
  const folderId = view.openFolder?.id;
  if (!folderId) return view;
  const folder = findFolder(view.pages, folderId);
  if (!folder) return view;
  const byId = new Map(folder.children.map((c) => [c.id, c]));
  const children: AppItem[] = [];
  for (const id of order) {
    const child = byId.get(id);
    if (!child) continue;
    children.push(child);
    byId.delete(id);
  }
  for (const child of folder.children) {
    if (byId.has(child.id)) children.push(child);
  }
  return reorderFolderChildren(view, folderId, children);
}

function ejectActive(view: AppGridView, appId: string, insertAt: number): AppGridView {
  const folderId = view.openFolder?.id;
  if (!folderId) return ended({ ...view, openFolder: null });
  return ejectFromFolderAt(view, folderId, appId, insertAt);
}

function pagesEqual(a: GridItem[][], b: GridItem[][]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function shouldPersist(prev: AppGridView, next: AppGridView, canceled: boolean): boolean {
  if (next.dragSnapshot) return false;
  if (canceled) return false;
  const baseline = prev.dragSnapshot?.pages ?? prev.pages;
  return !pagesEqual(baseline, next.pages);
}

function reduce(view: AppGridView, event: AppGridEvent): AppGridView {
  switch (event.type) {
    case 'add':
      return addApp(view, event.app);
    case 'update':
      return updateApp(view, event.app);
    case 'removeApp':
      return removeApp(view, event.appId);
    case 'removeFolder':
      return removeFolder(view, event.folderId);
    case 'renameFolder':
      return renameFolder(view, event.folderId, event.name);
    case 'merge':
      return mergeApps(view, event.fromId, event.ontoId);
    case 'intoFolder':
      return dropIntoFolder(view, event.appId, event.folderId);
    case 'reorderPage':
      return reorderPageByIds(view, event.order);
    case 'reorderFolder':
      return reorderFolderByIds(view, event.order);
    case 'pageFlip':
      return pageFlipDuringDrag(view, event.toPage);
    case 'eject':
      return ejectActive(view, event.appId, event.insertAt);
    case 'openFolder':
      return openFolderItem(view, event.folderId);
    case 'closeFolder':
      return closeFolder(view);
    case 'beginDrag':
      return beginDragSession(view, event.itemId);
    case 'endDrag':
      return ended(view);
    case 'cancelDrag':
      return cancelDragSession(view);
    case 'setPageIndex':
      return setPageIndex(view, event.pageIndex);
  }
}

/**
 * App 网格唯一对外口。拖着（view 上仍有 dragSnapshot）不 persist；
 * Esc 回滚对照快照，也不 persist。松手清快照后，pages 相对快照（或上一份 pages）有变才 persist。
 */
export function apply(view: AppGridView, event: AppGridEvent): AppGridApplyResult {
  const next = reduce(view, event);
  return { view: next, persist: shouldPersist(view, next, event.type === 'cancelDrag') };
}
