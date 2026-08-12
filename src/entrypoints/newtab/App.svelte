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
    paginate,
    renameFolder as gridRenameFolder,
    reorderFolderChildren as gridReorderFolderChildren,
    reorderPage as gridReorderPage,
    type AppGridDragSnapshot,
    type AppGridView,
  } from '../../lib/appGrid';
  import {
    hitEdgeRelative,
    insertIndexFromHit,
    normalizedInRect,
  } from '../../lib/gridInsertGeometry';
  import { fetchHitokoto } from '../../lib/hitokoto';
  import { loadState, saveState } from '../../lib/storage';
  import { downloadBlob, exportYtab, importYtab } from '../../lib/backup';
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
    schedulePoolFill,
    wallpaperPool,
    wallpaperSession,
    type WallpaperItem,
  } from '../../lib/wallpaper';

  let ready = $state(false);
  let ytab = $state(createEmptyState());
  let pageIndex = $state(0);
  let settingsOpen = $state(false);
  let addOpen = $state(false);
  let openFolder = $state<FolderItem | null>(null);
  /** Esc / 取消跨页拖时整表回滚 */
  let dragPagesSnapshot = $state<AppGridDragSnapshot | null>(null);
  /** 上屏 URL；准备阶段仍是旧图，提交后才换成新图。 */
  let displayUrl = $state('');

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

  async function applyCommittedWallpaper(item: WallpaperItem) {
    displayUrl = item.imageUrl;
    await persistWallpaper(item);
    schedulePoolFill(ytab.settings);
  }

  async function refreshHitokoto() {
    const next = await fetchHitokoto();
    if (!next) return;
    await persist((prev) => ({ ...prev, hitokoto: next }));
  }

  async function ensureWallpaper(force: boolean) {
    const result = await wallpaperSession.ensure(ytab.settings, ytab.wallpaper, force);
    if (result.kind === 'keep') {
      displayUrl = ytab.wallpaper.imageUrl;
      return;
    }
    if (result.kind === 'switched') await applyCommittedWallpaper(result.item);
  }

  /** 准备阶段：只拉取/解码，不上屏。 */
  function prepareWallpaperRefresh(): Promise<boolean> {
    return wallpaperSession.prepare(ytab.settings);
  }

  /** 提交阶段：与绿勾同时上屏并落盘。 */
  async function commitWallpaperRefresh(): Promise<void> {
    const item = wallpaperSession.commit();
    if (!item) return;
    await applyCommittedWallpaper(item);
    await sleep(450);
  }

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  function gridView(): AppGridView {
    return {
      pages: ytab.pages,
      pageIndex,
      openFolder,
      dragSnapshot: dragPagesSnapshot,
    };
  }

  function applyGridView(next: AppGridView) {
    pageIndex = next.pageIndex;
    openFolder = next.openFolder;
    dragPagesSnapshot = next.dragSnapshot;
  }

  async function applyGrid(next: AppGridView) {
    applyGridView(next);
    await persist((prev) => ({ ...prev, pages: next.pages }));
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

  function currentPageItems(): GridItem[] {
    return gridCurrentPageItems(gridView());
  }

  function openApp(app: AppItem) {
    if (ytab.settings.openTarget === 'new') {
      window.open(app.url, '_blank', 'noopener,noreferrer');
    } else {
      location.href = app.url;
    }
  }

  async function addApp(app: AppItem) {
    await applyGrid(gridAddApp(gridView(), app));
    addOpen = false;
  }

  async function mergeApps(fromId: string, ontoId: string) {
    await applyGrid(gridMergeApps(gridView(), fromId, ontoId));
  }

  async function dropIntoFolder(appId: string, folderId: string) {
    await applyGrid(gridDropIntoFolder(gridView(), appId, folderId));
  }

  async function reorderPage(pageItems: GridItem[]) {
    await applyGrid(gridReorderPage(gridView(), pageItems));
  }

  function onGridDragSessionStart() {
    applyGridView(beginDragSession(gridView()));
  }

  async function onGridDragSessionCancel() {
    if (!dragPagesSnapshot) return;
    await applyGrid(cancelDragSession(gridView()));
  }

  async function pageFlipDuringDrag(
    toPage: number,
    fromPageWithoutItem: GridItem[],
    item: GridItem,
  ) {
    await applyGrid(gridPageFlipDuringDrag(gridView(), toPage, fromPageWithoutItem, item));
  }

  async function reorderFolderChildren(folderId: string, children: AppItem[]) {
    await applyGrid(gridReorderFolderChildren(gridView(), folderId, children));
  }

  async function openFolderItem(folder: FolderItem) {
    const next = gridOpenFolderItem(gridView(), folder);
    if (folder.children.length <= 1) {
      await applyGrid(next);
      return;
    }
    applyGridView(next);
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
    await applyGrid(gridEjectFromFolderAt(gridView(), folderId, appId, insertAt));
  }

  /** 主网格落点：边缘插前/后；中心则插在目标后；未命中则追加（DOM 解析 + 共享几何） */
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

    const { nx, ny } = normalizedInRect(clientX, clientY, tile.getBoundingClientRect());
    return insertIndexFromHit(targetIndex, hitEdgeRelative(nx, ny), 'after') ?? page.length;
  }

  async function renameFolder(folderId: string, name: string) {
    await applyGrid(gridRenameFolder(gridView(), folderId, name));
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

  async function onExportBackup(opts: { includeIcons: boolean; includeApiKey: boolean }) {
    const blob = await exportYtab(ytab, opts);
    downloadBlob(blob, `ytab-backup-${new Date().toISOString().slice(0, 10)}.ytab`);
  }

  async function onImportBackup(file: File) {
    const state = await importYtab(file);
    await onImportState(state);
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
          dnd={{
            onMerge: mergeApps,
            onDropIntoFolder: dropIntoFolder,
            onReorderPage: reorderPage,
            onPageFlip: pageFlipDuringDrag,
            onDragSessionStart: onGridDragSessionStart,
            onDragSessionCancel: onGridDragSessionCancel,
          }}
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
      onClose={() => (settingsOpen = false)}
      onChange={onSettingsChange}
      onPrepareWallpaper={prepareWallpaperRefresh}
      onCommitWallpaper={commitWallpaperRefresh}
      onExport={onExportBackup}
      onImport={onImportBackup}
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
