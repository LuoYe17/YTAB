/** 网格视图控制器：页索引 / 打开中文件夹 / 拖拽快照 + 全部网格操作的薄转发。 */

import {
  addApp as gridAddApp,
  beginDragSession,
  cancelDragSession,
  currentPageItems as gridCurrentPageItems,
  dropIntoFolder as gridDropIntoFolder,
  ejectFromFolderAt as gridEjectFromFolderAt,
  mergeApps as gridMergeApps,
  openFolderItem as gridOpenFolderItem,
  pageFlipDuringDrag as gridPageFlipDuringDrag,
  renameFolder as gridRenameFolder,
  reorderFolderChildren as gridReorderFolderChildren,
  reorderPage as gridReorderPage,
  type AppGridDragSnapshot,
  type AppGridView,
} from './appGrid';
import { insertIndexForDrop, resolveDropTile } from './dropPosition';
import type { AppItem, FolderItem, GridItem } from './types';

export type GridControllerDeps = {
  getPages: () => GridItem[][];
  persistPages: (pages: GridItem[][]) => Promise<void>;
};

export function createGridController(deps: GridControllerDeps) {
  let pageIndex = $state(0);
  let openFolder = $state<FolderItem | null>(null);
  /** Esc / 取消跨页拖时整表回滚 */
  let dragPagesSnapshot = $state<AppGridDragSnapshot | null>(null);

  function gridView(): AppGridView {
    return {
      pages: deps.getPages(),
      pageIndex,
      openFolder,
      dragSnapshot: dragPagesSnapshot,
    };
  }

  function applyGridView(next: AppGridView): void {
    pageIndex = next.pageIndex;
    openFolder = next.openFolder;
    dragPagesSnapshot = next.dragSnapshot;
  }

  async function applyGrid(next: AppGridView): Promise<void> {
    applyGridView(next);
    await deps.persistPages(next.pages);
  }

  function currentPageItems(): GridItem[] {
    return gridCurrentPageItems(gridView());
  }

  async function addApp(app: AppItem): Promise<void> {
    await applyGrid(gridAddApp(gridView(), app));
  }

  async function mergeApps(fromId: string, ontoId: string): Promise<void> {
    await applyGrid(gridMergeApps(gridView(), fromId, ontoId));
  }

  async function dropIntoFolder(appId: string, folderId: string): Promise<void> {
    await applyGrid(gridDropIntoFolder(gridView(), appId, folderId));
  }

  async function reorderPage(pageItems: GridItem[]): Promise<void> {
    await applyGrid(gridReorderPage(gridView(), pageItems));
  }

  function onGridDragSessionStart(): void {
    applyGridView(beginDragSession(gridView()));
  }

  async function onGridDragSessionCancel(): Promise<void> {
    if (!dragPagesSnapshot) return;
    await applyGrid(cancelDragSession(gridView()));
  }

  async function pageFlipDuringDrag(
    toPage: number,
    fromPageWithoutItem: GridItem[],
    item: GridItem,
  ): Promise<void> {
    await applyGrid(gridPageFlipDuringDrag(gridView(), toPage, fromPageWithoutItem, item));
  }

  async function reorderFolderChildren(folderId: string, children: AppItem[]): Promise<void> {
    await applyGrid(gridReorderFolderChildren(gridView(), folderId, children));
  }

  async function openFolderItem(folder: FolderItem): Promise<void> {
    const next = gridOpenFolderItem(gridView(), folder);
    if (folder.children.length <= 1) {
      await applyGrid(next);
      return;
    }
    applyGridView(next);
  }

  /** 文件夹拖出关窗后松手：按落点插入当前页。 */
  async function ejectFromFolderAt(
    folderId: string,
    appId: string,
    clientX: number,
    clientY: number,
  ): Promise<void> {
    const page = deps.getPages()[pageIndex] ?? [];
    const tile = resolveDropTile(document, page, clientX, clientY, appId);
    const insertAt = insertIndexForDrop(tile, page.length);
    await applyGrid(gridEjectFromFolderAt(gridView(), folderId, appId, insertAt));
  }

  async function renameFolder(folderId: string, name: string): Promise<void> {
    await applyGrid(gridRenameFolder(gridView(), folderId, name));
  }

  function setPageIndex(index: number): void {
    pageIndex = index;
  }

  function closeFolder(): void {
    openFolder = null;
  }

  return {
    get pageIndex() {
      return pageIndex;
    },
    get openFolder() {
      return openFolder;
    },
    currentPageItems,
    addApp,
    mergeApps,
    dropIntoFolder,
    reorderPage,
    onGridDragSessionStart,
    onGridDragSessionCancel,
    pageFlipDuringDrag,
    reorderFolderChildren,
    openFolderItem,
    ejectFromFolderAt,
    renameFolder,
    setPageIndex,
    closeFolder,
  };
}
