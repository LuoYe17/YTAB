<script lang="ts">
  import { onMount } from 'svelte';
  import Clock from '../../components/Clock.svelte';
  import SearchBox from '../../components/SearchBox.svelte';
  import HitokotoLine from '../../components/HitokotoLine.svelte';
  import AppGrid from '../../components/AppGrid.svelte';
  import FirstRun from '../../components/FirstRun.svelte';
  import AddAppDialog from '../../components/AddAppDialog.svelte';
  import SettingsModal from '../../components/SettingsModal.svelte';
  import FolderOverlay from '../../components/FolderOverlay.svelte';
  import WallpaperStage from '../../components/WallpaperStage.svelte';
  import { newId } from '../../lib/defaults';
  import { fetchHitokoto } from '../../lib/hitokoto';
  import { loadState, saveState } from '../../lib/storage';
  import {
    createEmptyState,
    type AppItem,
    type FolderItem,
    type GridItem,
    type HitokotoState,
    type Settings,
    type WallpaperState,
    type YtabState,
  } from '../../lib/types';
  import {
    fetchRandomWallpaper,
    needsDailyWallpaper,
    schedulePoolFill,
    wallpaperPool,
    type WallpaperItem,
  } from '../../lib/wallpaper';

  const PAGE_CAPACITY = 19;

  let ready = $state(false);
  let ytab = $state(createEmptyState());
  let pageIndex = $state(0);
  let settingsOpen = $state(false);
  let addOpen = $state(false);
  let openFolder = $state<FolderItem | null>(null);
  /** Esc / 取消跨页拖时整表回滚 */
  let dragPagesSnapshot: { pages: GridItem[][]; pageIndex: number } | null = null;
  /** What WallpaperStage paints (may briefly be a preview before final). */
  let displayUrl = $state('');
  let wallpaperBusy = $state(false);

  onMount(() => {
    void bootstrap();
  });

  async function bootstrap() {
    ytab = await loadState();
    displayUrl = ytab.wallpaper.imageUrl;
    ready = true;
    if (!ytab.onboardingDone) return;
    await refreshHitokoto();
    await ensureWallpaper(false);
    wallpaperPool.rememberCurrent(ytab.wallpaper.wallhavenId);
    schedulePoolFill(ytab.settings);
  }

  async function persist(updater: (prev: YtabState) => YtabState) {
    ytab = updater(ytab);
    await saveState(ytab);
  }

  async function persistWallpaper(item: WallpaperItem) {
    const wp: WallpaperState = {
      imageUrl: item.imageUrl,
      fetchedOn: item.fetchedOn,
      wallhavenId: item.wallhavenId,
    };
    await persist((prev) => ({ ...prev, wallpaper: wp }));
    wallpaperPool.rememberCurrent(item.wallhavenId);
  }

  async function refreshHitokoto() {
    const next = await fetchHitokoto();
    if (!next) return;
    await persist((prev) => ({ ...prev, hitokoto: next }));
  }

  async function ensureWallpaper(force: boolean) {
    if (!force && !needsDailyWallpaper(ytab.wallpaper)) {
      displayUrl = ytab.wallpaper.imageUrl;
      return;
    }
    wallpaperPool.clear();
    await switchWallpaper();
  }

  let pendingRefresh: WallpaperItem | null = null;

  /** Scan 阶段：只拉取/解码，不上屏。 */
  async function prepareWallpaperRefresh(): Promise<boolean> {
    if (wallpaperBusy) return false;
    wallpaperBusy = true;
    pendingRefresh = null;
    try {
      const item = wallpaperPool.take() ?? (await fetchRandomWallpaper(ytab.settings));
      if (!item) {
        wallpaperBusy = false;
        return false;
      }
      await decodeImage(item.imageUrl);
      pendingRefresh = item;
      return true;
    } catch {
      wallpaperBusy = false;
      return false;
    }
  }

  /** Success 阶段：与绿勾同时上屏并落盘。 */
  async function commitWallpaperRefresh(): Promise<void> {
    const item = pendingRefresh;
    pendingRefresh = null;
    try {
      if (!item) return;
      displayUrl = item.imageUrl;
      await persistWallpaper(item);
      schedulePoolFill(ytab.settings);
      await sleep(450);
    } finally {
      wallpaperBusy = false;
    }
  }

  /** 日界等无 UI 路径：准备 + 提交一次做完。 */
  async function switchWallpaper(): Promise<boolean> {
    const ok = await prepareWallpaperRefresh();
    if (!ok) return false;
    await commitWallpaperRefresh();
    return true;
  }

  function decodeImage(src: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = src;
    });
  }

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  async function onFirstRun(result: {
    mode: 'author' | 'empty';
    apps: AppItem[];
    hitokoto: HitokotoState | null;
    wallpaper: WallpaperItem | null;
  }) {
    await persist((prev) => {
      const next: YtabState = {
        ...prev,
        onboardingDone: true,
        pages: paginate(result.apps),
      };
      if (result.hitokoto) next.hitokoto = result.hitokoto;
      if (result.wallpaper) {
        next.wallpaper = {
          imageUrl: result.wallpaper.imageUrl,
          fetchedOn: result.wallpaper.fetchedOn,
          wallhavenId: result.wallpaper.wallhavenId,
        };
      }
      return next;
    });
    if (result.wallpaper) {
      displayUrl = result.wallpaper.imageUrl;
      wallpaperPool.rememberCurrent(result.wallpaper.wallhavenId);
    }
    schedulePoolFill(ytab.settings);
  }

  function paginate(items: GridItem[]): GridItem[][] {
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

  function currentPageItems(): GridItem[] {
    return ytab.pages[pageIndex] ?? [];
  }

  function openApp(app: AppItem) {
    if (ytab.settings.openTarget === 'new') {
      window.open(app.url, '_blank', 'noopener,noreferrer');
    } else {
      location.href = app.url;
    }
  }

  async function addApp(app: AppItem) {
    await persist((prev) => {
      const all = flattenPages(prev.pages);
      all.push(app);
      pageIndex = Math.max(0, Math.ceil(all.length / PAGE_CAPACITY) - 1);
      return { ...prev, pages: rewritePages(all) };
    });
    addOpen = false;
  }

  async function mergeApps(fromId: string, ontoId: string) {
    dragPagesSnapshot = null;
    await persist((prev) => {
      const all = flattenPages(prev.pages);
      const fromIdx = all.findIndex((i) => i.id === fromId);
      const ontoIdx = all.findIndex((i) => i.id === ontoId);
      if (fromIdx < 0 || ontoIdx < 0) return prev;
      const fromItem = all[fromIdx];
      const ontoItem = all[ontoIdx];
      if (!fromItem || !ontoItem) return prev;
      if (fromItem.kind !== 'app' || ontoItem.kind !== 'app') return prev;

      const folder: FolderItem = {
        id: newId(),
        kind: 'folder',
        name: '文件夹',
        children: [ontoItem, fromItem],
      };
      const next = all.filter((i) => i.id !== fromId && i.id !== ontoId);
      next.splice(Math.min(fromIdx, ontoIdx), 0, folder);
      return { ...prev, pages: rewritePages(next) };
    });
  }

  async function dropIntoFolder(appId: string, folderId: string) {
    dragPagesSnapshot = null;
    await persist((prev) => {
      const all = flattenPages(prev.pages);
      const appIdx = all.findIndex((i) => i.id === appId);
      const folderIdx = all.findIndex((i) => i.id === folderId);
      if (appIdx < 0 || folderIdx < 0) return prev;
      const app = all[appIdx];
      const folder = all[folderIdx];
      if (!app || app.kind !== 'app' || !folder || folder.kind !== 'folder') return prev;

      const next = all
        .filter((i) => i.id !== appId)
        .map((i) =>
          i.id === folderId && i.kind === 'folder'
            ? { ...i, children: [...i.children, app] }
            : i,
        );
      return { ...prev, pages: rewritePages(next) };
    });
  }

  async function reorderPage(pageItems: GridItem[]) {
    dragPagesSnapshot = null;
    await persist((prev) => {
      const pages = prev.pages.map((page, i) => (i === pageIndex ? pageItems : page));
      return { ...prev, pages };
    });
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

  function onGridDragSessionStart() {
    dragPagesSnapshot = {
      pages: clonePages(ytab.pages),
      pageIndex,
    };
  }

  async function onGridDragSessionCancel() {
    const snap = dragPagesSnapshot;
    dragPagesSnapshot = null;
    if (!snap) return;
    pageIndex = snap.pageIndex;
    await persist((prev) => ({ ...prev, pages: snap.pages }));
  }

  async function pageFlipDuringDrag(
    toPage: number,
    fromPageWithoutItem: GridItem[],
    item: GridItem,
  ) {
    const fromPage = pageIndex;
    await persist((prev) => {
      const pages = prev.pages.map((page, i) => {
        if (i === fromPage) return fromPageWithoutItem;
        if (i === toPage) {
          const without = page.filter((x) => x.id !== item.id);
          return [...without, item];
        }
        return page;
      });
      return { ...prev, pages };
    });
    pageIndex = toPage;
  }

  async function reorderFolderChildren(folderId: string, children: AppItem[]) {
    await persist((prev) => ({
      ...prev,
      pages: prev.pages.map((page) =>
        page.flatMap((item) => {
          if (item.id !== folderId || item.kind !== 'folder') return [item];
          return collapseFolder(item, children);
        }),
      ),
    }));
    if (openFolder?.id === folderId) {
      if (children.length <= 1) openFolder = null;
      else openFolder = { ...openFolder, children };
    }
  }

  /** 空文件夹删除；只剩 1 个 App 则拆开回到网格 */
  function collapseFolder(folder: FolderItem, children: AppItem[]): GridItem[] {
    if (children.length === 0) return [];
    if (children.length === 1) return [children[0]!];
    return [{ ...folder, children }];
  }

  async function openFolderItem(folder: FolderItem) {
    if (folder.children.length <= 1) {
      await persist((prev) => ({
        ...prev,
        pages: prev.pages.map((page) =>
          page.flatMap((item) => {
            if (item.id !== folder.id || item.kind !== 'folder') return [item];
            return collapseFolder(item, item.children);
          }),
        ),
      }));
      return;
    }
    openFolder = folder;
  }

  /** 文件夹拖出关窗后松手：按落点插入当前页 */
  async function ejectFromFolderAt(
    folderId: string,
    appId: string,
    clientX: number,
    clientY: number,
  ) {
    const page = ytab.pages[pageIndex] ?? [];
    const insertAt = insertIndexOnPage(page, clientX, clientY, appId);

    openFolder = null;
    await persist((prev) => {
      let ejected: AppItem | undefined;
      const pages = prev.pages.map((p) => {
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
      if (!ejected) return prev;
      const pi = pageIndex;
      return {
        ...prev,
        pages: pages.map((p, i) => {
          if (i !== pi) return p;
          const without = p.filter((x) => x.id !== ejected!.id);
          const at = Math.max(0, Math.min(insertAt, without.length));
          const out = [...without];
          out.splice(at, 0, ejected!);
          return out;
        }),
      };
    });
  }

  /** 主网格落点：落在某图标边缘则插前/后，否则追加到末尾 */
  function insertIndexOnPage(
    page: GridItem[],
    clientX: number,
    clientY: number,
    excludeId: string,
  ): number {
    const el = document.elementFromPoint(clientX, clientY);
    const tile = el?.closest?.('[data-tile-id]') as HTMLElement | null;
    const targetId = tile?.dataset.tileId;
    if (!targetId || targetId === excludeId) return page.length;

    const targetIndex = page.findIndex((i) => i.id === targetId);
    if (targetIndex < 0) return page.length;

    const rect = tile.getBoundingClientRect();
    const nx = (clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (clientY - rect.top) / Math.max(rect.height, 1);
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const EDGE_MIN = 0.18;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < EDGE_MIN) {
      return targetIndex + 1;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx < 0 ? targetIndex : targetIndex + 1;
    }
    return dy < 0 ? targetIndex : targetIndex + 1;
  }

  async function renameFolder(folderId: string, name: string) {
    await persist((prev) => ({
      ...prev,
      pages: prev.pages.map((page: GridItem[]) =>
        page.map((item: GridItem) =>
          item.id === folderId && item.kind === 'folder' ? { ...item, name } : item,
        ),
      ),
    }));
    if (openFolder?.id === folderId) {
      openFolder = { ...openFolder, name };
    }
  }

  async function onSettingsChange(settings: Settings) {
    const prev = ytab.settings;
    const filterChanged =
      JSON.stringify(prev.wallhavenPurity) !== JSON.stringify(settings.wallhavenPurity) ||
      JSON.stringify(prev.wallhavenCategories) !== JSON.stringify(settings.wallhavenCategories);
    await persist((p) => ({ ...p, settings }));
    if (filterChanged) {
      wallpaperPool.clear();
      schedulePoolFill(settings);
    }
  }

  async function onImportState(next: YtabState) {
    wallpaperPool.clear();
    await persist(() => ({ ...next, onboardingDone: true }));
    displayUrl = next.wallpaper.imageUrl;
    settingsOpen = false;
    pageIndex = 0;
    schedulePoolFill(next.settings);
  }

  async function onResetAll() {
    wallpaperPool.clear();
    await persist(() => createEmptyState());
    displayUrl = '';
    settingsOpen = false;
    pageIndex = 0;
    openFolder = null;
    addOpen = false;
  }
</script>

{#if ready}
  <div class="page">
    <WallpaperStage url={displayUrl} />
    <div class="shade"></div>
    <main>
      <Clock />
      <HitokotoLine text={ytab.hitokoto.text} from={ytab.hitokoto.from} />
      <SearchBox endpoint={ytab.settings.bingEndpoint} />
      {#if ytab.onboardingDone}
        <AppGrid
          items={currentPageItems()}
          pageIndex={pageIndex}
          pageCount={ytab.pages.length}
          onOpenApp={openApp}
          onOpenFolder={openFolderItem}
          onPageChange={(i) => (pageIndex = i)}
          onAdd={() => (addOpen = true)}
          onMerge={mergeApps}
          onDropIntoFolder={dropIntoFolder}
          onReorderPage={reorderPage}
          onPageFlip={pageFlipDuringDrag}
          onDragSessionStart={onGridDragSessionStart}
          onDragSessionCancel={onGridDragSessionCancel}
        />
      {/if}
    </main>

    <button type="button" class="settings-btn" onclick={() => (settingsOpen = true)} title="设置" aria-label="设置">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.77 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.4.3.62.22l2.39-.96c.5.39 1.04.71 1.62.94l.36 2.54c.05.23.25.41.48.41h4c.24 0 .43-.17.48-.41l.36-2.54c.59-.23 1.13-.55 1.62-.94l2.39.96c.22.08.5 0 .62-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
        />
      </svg>
    </button>
  </div>

  {#if !ytab.onboardingDone}
    <FirstRun settings={ytab.settings} onChoose={onFirstRun} />
  {/if}

  {#if addOpen}
    <AddAppDialog onSave={addApp} onCancel={() => (addOpen = false)} />
  {/if}

  {#if settingsOpen}
    <SettingsModal
      settings={ytab.settings}
      getState={() => ytab}
      onClose={() => (settingsOpen = false)}
      onChange={onSettingsChange}
      onPrepareWallpaper={prepareWallpaperRefresh}
      onCommitWallpaper={commitWallpaperRefresh}
      onImportState={onImportState}
      onResetAll={onResetAll}
    />
  {/if}

  {#if openFolder}
    <FolderOverlay
      folder={openFolder}
      onClose={() => (openFolder = null)}
      onOpenApp={openApp}
      onRename={(name) => renameFolder(openFolder!.id, name)}
      onReorderChildren={reorderFolderChildren}
      onEjectAt={ejectFromFolderAt}
    />
  {/if}
{/if}

<style>
  .page {
    min-height: 100vh;
    position: relative;
    background-color: #1a1b1e;
    color: #fff;
  }
  .shade {
    position: absolute;
    inset: 0;
    z-index: 0;
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.45));
    pointer-events: none;
  }
  main {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.15rem;
    padding: 2.5rem 1rem 4.5rem;
    box-sizing: border-box;
  }
  .settings-btn {
    position: fixed;
    left: 1rem;
    bottom: 1rem;
    z-index: 5;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(0, 0, 0, 0.28);
    color: rgba(255, 255, 255, 0.88);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .settings-btn:hover {
    background: rgba(0, 0, 0, 0.4);
  }
</style>
