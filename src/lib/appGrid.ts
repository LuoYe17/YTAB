/** App 网格：多页 + 文件夹 + 当前页 + 打开中文件夹 + 拖拽快照（纯逻辑，无 DOM / 无 persist）。 */

import { newId } from './defaults';
import type { AppItem, FolderItem, GridItem } from './types';

export const PAGE_CAPACITY = 19;

export type AppGridDragSnapshot = {
  pages: GridItem[][];
  pageIndex: number;
};

export type AppGridView = {
  pages: GridItem[][];
  pageIndex: number;
  openFolder: FolderItem | null;
  dragSnapshot: AppGridDragSnapshot | null;
};

export function createAppGridView(
  pages: GridItem[][] = [[]],
  pageIndex = 0,
): AppGridView {
  return {
    pages,
    pageIndex,
    openFolder: null,
    dragSnapshot: null,
  };
}

export function paginate(items: GridItem[]): GridItem[][] {
  if (items.length === 0) return [[]];
  const pages: GridItem[][] = [];
  for (let i = 0; i < items.length; i += PAGE_CAPACITY) {
    pages.push(items.slice(i, i + PAGE_CAPACITY));
  }
  return pages.length ? pages : [[]];
}

export function flattenPages(pages: GridItem[][]): GridItem[] {
  return pages.flat();
}

export function rewritePages(items: GridItem[]): GridItem[][] {
  return paginate(items);
}

export function clonePages(pages: GridItem[][]): GridItem[][] {
  return pages.map((page) =>
    page.map((item) =>
      item.kind === 'folder'
        ? { ...item, children: item.children.map((c) => ({ ...c })) }
        : { ...item },
    ),
  );
}

export function currentPageItems(view: AppGridView): GridItem[] {
  return view.pages[view.pageIndex] ?? [];
}

/** 空文件夹删除；只剩 1 个 App 则拆开回到网格 */
export function collapseFolder(folder: FolderItem, children: AppItem[]): GridItem[] {
  if (children.length === 0) return [];
  if (children.length === 1) return [children[0]!];
  return [{ ...folder, children }];
}

export function addApp(view: AppGridView, app: AppItem): AppGridView {
  const all = flattenPages(view.pages);
  all.push(app);
  return {
    ...view,
    pageIndex: Math.max(0, Math.ceil(all.length / PAGE_CAPACITY) - 1),
    pages: rewritePages(all),
  };
}

export function mergeApps(view: AppGridView, fromId: string, ontoId: string): AppGridView {
  const all = flattenPages(view.pages);
  const fromIdx = all.findIndex((i) => i.id === fromId);
  const ontoIdx = all.findIndex((i) => i.id === ontoId);
  if (fromIdx < 0 || ontoIdx < 0) return { ...view, dragSnapshot: null };
  const fromItem = all[fromIdx];
  const ontoItem = all[ontoIdx];
  if (!fromItem || !ontoItem) return { ...view, dragSnapshot: null };
  if (fromItem.kind !== 'app' || ontoItem.kind !== 'app') {
    return { ...view, dragSnapshot: null };
  }

  const folder: FolderItem = {
    id: newId(),
    kind: 'folder',
    name: '文件夹',
    children: [ontoItem, fromItem],
  };
  const next = all.filter((i) => i.id !== fromId && i.id !== ontoId);
  next.splice(Math.min(fromIdx, ontoIdx), 0, folder);
  return {
    ...view,
    dragSnapshot: null,
    pages: rewritePages(next),
  };
}

export function dropIntoFolder(
  view: AppGridView,
  appId: string,
  folderId: string,
): AppGridView {
  const all = flattenPages(view.pages);
  const appIdx = all.findIndex((i) => i.id === appId);
  const folderIdx = all.findIndex((i) => i.id === folderId);
  if (appIdx < 0 || folderIdx < 0) return { ...view, dragSnapshot: null };
  const app = all[appIdx];
  const folder = all[folderIdx];
  if (!app || app.kind !== 'app' || !folder || folder.kind !== 'folder') {
    return { ...view, dragSnapshot: null };
  }

  const next = all
    .filter((i) => i.id !== appId)
    .map((i) =>
      i.id === folderId && i.kind === 'folder'
        ? { ...i, children: [...i.children, app] }
        : i,
    );
  return {
    ...view,
    dragSnapshot: null,
    pages: rewritePages(next),
  };
}

export function reorderPage(view: AppGridView, pageItems: GridItem[]): AppGridView {
  const pages = view.pages.map((page, i) => (i === view.pageIndex ? pageItems : page));
  return {
    ...view,
    dragSnapshot: null,
    pages,
  };
}

export function beginDragSession(view: AppGridView): AppGridView {
  return {
    ...view,
    dragSnapshot: {
      pages: clonePages(view.pages),
      pageIndex: view.pageIndex,
    },
  };
}

export function cancelDragSession(view: AppGridView): AppGridView {
  const snap = view.dragSnapshot;
  if (!snap) return { ...view, dragSnapshot: null };
  return {
    ...view,
    pages: snap.pages,
    pageIndex: snap.pageIndex,
    dragSnapshot: null,
  };
}

export function pageFlipDuringDrag(
  view: AppGridView,
  toPage: number,
  fromPageWithoutItem: GridItem[],
  item: GridItem,
): AppGridView {
  const fromPage = view.pageIndex;
  const pages = view.pages.map((page, i) => {
    if (i === fromPage) return fromPageWithoutItem;
    if (i === toPage) {
      const without = page.filter((x) => x.id !== item.id);
      return [...without, item];
    }
    return page;
  });
  return {
    ...view,
    pages,
    pageIndex: toPage,
  };
}

export function reorderFolderChildren(
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

export function openFolderItem(view: AppGridView, folder: FolderItem): AppGridView {
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

/** 文件夹拖出：调用方已算好 insertAt（DOM 落点留在 UI）。 */
export function ejectFromFolderAt(
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
  if (!ejected) return { ...view, openFolder: null };

  const pi = view.pageIndex;
  const nextPages = pages.map((p, i) => {
    if (i !== pi) return p;
    const without = p.filter((x) => x.id !== ejected!.id);
    const at = Math.max(0, Math.min(insertAt, without.length));
    const out = [...without];
    out.splice(at, 0, ejected!);
    return out;
  });

  return {
    ...view,
    openFolder: null,
    pages: nextPages,
  };
}

export function renameFolder(view: AppGridView, folderId: string, name: string): AppGridView {
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

export function setPageIndex(view: AppGridView, pageIndex: number): AppGridView {
  return { ...view, pageIndex };
}

export function closeFolder(view: AppGridView): AppGridView {
  return { ...view, openFolder: null };
}
