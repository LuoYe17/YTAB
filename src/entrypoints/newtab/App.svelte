<script lang="ts">
  import { onMount } from 'svelte';
  import Clock from '../../components/Clock.svelte';
  import SearchBox from '../../components/SearchBox.svelte';
  import HitokotoLine from '../../components/HitokotoLine.svelte';
  import AppGrid from '../../components/AppGrid.svelte';
  import FirstRun from '../../components/FirstRun.svelte';
  import AddAppDialog from '../../components/AddAppDialog.svelte';
  import SettingsModal from '../../components/SettingsModal.svelte';
  import WallpaperRefreshControl from '../../components/WallpaperRefreshControl.svelte';
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
    insertIndexForDropBand,
    readGridMetrics,
  } from '../../lib/gridInsertGeometry';
  import { fetchHitokoto } from '../../lib/hitokoto';
  import { loadState, saveState } from '../../lib/storage';
  import { applyBundledIcons, bundledIconDataUrls } from '../../lib/appIcons';
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
    type WallpaperPrepareResult,
  } from '../../lib/wallpaper';
  import type { WallpaperFailFocus } from '../../lib/wallpaperFail';

  let ready = $state(false);
  let loadFailed = $state(false);
  let ytab = $state(createEmptyState());
  let pageIndex = $state(0);
  let settingsOpen = $state(false);
  let settingsHighlight = $state<WallpaperFailFocus | null>(null);
  let addOpen = $state(false);
  let openFolder = $state<FolderItem | null>(null);
  /** Esc / 取消跨页拖时整表回滚 */
  let dragPagesSnapshot = $state<AppGridDragSnapshot | null>(null);
  /** 上屏 URL；准备阶段仍是旧图，提交后才换成新图。 */
  let displayUrl = $state('');
  let mainEl = $state<HTMLElement | null>(null);

  onMount(() => {
    void bootstrap();
  });

  async function bootstrap() {
    try {
      ytab = await loadState();
    } catch {
      loadFailed = true;
      ready = true;
      return;
    }
    if (!localStorage.getItem('ytab:icon-bundle-v8')) {
      try {
        const bundled = await bundledIconDataUrls();
        if (bundled.size > 0) {
          ytab = applyBundledIcons(ytab, bundled);
          await saveState(ytab);
        }
      } catch {
        /* 内置图升级失败不挡起始页 */
      }
      localStorage.setItem('ytab:icon-bundle-v8', '1');
    }
    displayUrl = ytab.wallpaper.imageUrl;
    ready = true;
    if (!ytab.onboardingDone) return;
    await refreshHitokoto();
    await ensureWallpaper(false);
    wallpaperPool.rememberCurrent(ytab.wallpaper.wallhavenId);
    schedulePoolFill(ytab.settings);
  }

  async function retryLoad() {
    loadFailed = false;
    ready = false;
    await bootstrap();
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
  function prepareWallpaperRefresh(): Promise<WallpaperPrepareResult> {
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

  /** 主网格落点：格子 + 左壁纸→首位 + 下/右→末尾。 */
  function insertIndexOnPage(
    page: GridItem[],
    clientX: number,
    clientY: number,
    excludeId: string,
  ): number {
    const grid = document.querySelector<HTMLElement>('[data-ytab-grid="page"]');
    const slot = document.querySelector<HTMLElement>('[data-ytab-drop-band]');
    const m = grid ? readGridMetrics(grid) : null;
    const host = slot ?? grid;
    if (m && host) {
      const occupied = page.filter((i) => i.id !== excludeId).length;
      const br = host.getBoundingClientRect();
      const at = insertIndexForDropBand(clientX, clientY, m, occupied, 'after', {
        left: br.left,
        top: br.top,
        right: br.right,
        bottom: br.bottom,
      });
      if (at != null) return at;
    }
    return page.length;
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
    settingsHighlight = null;
    pageIndex = 0;
    schedulePoolFill(next.settings);
  }

  async function onExportBackup(opts: { includeIcons: boolean; includeApiKey: boolean }) {
    const blob = await exportYtab($state.snapshot(ytab), opts);
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
    settingsHighlight = null;
    pageIndex = 0;
    openFolder = null;
    addOpen = false;
  }
</script>

{#if ready}
  {#if loadFailed}
    <div class="page">
      <div class="load-fail">
        <p>读取本地数据失败了 (｡•́︿•̀｡)</p>
        <button type="button" onclick={retryLoad}>重试</button>
      </div>
    </div>
  {:else}
  <div class="page">
    <WallpaperStage url={displayUrl} />
    <div class="shade"></div>
    <main bind:this={mainEl} data-ytab-drop-band>
      <Clock />
      <HitokotoLine text={ytab.hitokoto.text} from={ytab.hitokoto.from} />
      <SearchBox endpoint={ytab.settings.bingEndpoint} />
      {#if ytab.onboardingDone}
        <div class="grid-slot">
          <AppGrid
            items={currentPageItems()}
            pageIndex={pageIndex}
            pageCount={ytab.pages.length}
            onOpenApp={openApp}
            onOpenFolder={openFolderItem}
            onPageChange={(i) => (pageIndex = i)}
            onAdd={() => (addOpen = true)}
            hitRoot={mainEl}
            dnd={{
              onMerge: mergeApps,
              onDropIntoFolder: dropIntoFolder,
              onReorderPage: reorderPage,
              onPageFlip: pageFlipDuringDrag,
              onDragSessionStart: onGridDragSessionStart,
              onDragSessionCancel: onGridDragSessionCancel,
            }}
          />
        </div>
      {/if}
    </main>

    <button
      type="button"
      class="ghost-btn settings-btn"
      onclick={() => {
        settingsHighlight = null;
        settingsOpen = true;
      }}
      title="设置"
      aria-label="设置"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.77 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.4.3.62.22l2.39-.96c.5.39 1.04.71 1.62.94l.36 2.54c.05.23.25.41.48.41h4c.24 0 .43-.17.48-.41l.36-2.54c.59-.23 1.13-.55 1.62-.94l2.39.96c.22.08.5 0 .62-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
        />
      </svg>
    </button>
    {#if ytab.onboardingDone}
      <WallpaperRefreshControl
        onPrepare={prepareWallpaperRefresh}
        onCommit={commitWallpaperRefresh}
        onOpenSettings={(focus) => {
          settingsHighlight = focus;
          settingsOpen = true;
        }}
      />
    {/if}
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
      highlight={settingsHighlight}
      onClose={() => {
        settingsOpen = false;
        settingsHighlight = null;
      }}
      onChange={onSettingsChange}
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
{/if}

<style>
  .page {
    min-height: 100vh;
    position: relative;
    background-color: #1a1b1e;
    color: #fff;
  }
  .load-fail {
    min-height: 100vh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.75rem;
    position: relative;
    z-index: 1;
  }
  .load-fail p {
    margin: 0;
    color: rgba(255, 255, 255, 0.72);
    text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45);
  }
  .load-fail button {
    appearance: none;
    border: 0;
    padding: 0;
    background: transparent;
    color: #7ecbff;
    cursor: pointer;
    font: inherit;
  }
  .load-fail button:hover {
    text-decoration: underline;
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
    justify-content: flex-start;
    gap: 0.75rem;
    padding: 2.25rem 1rem 5rem;
    box-sizing: border-box;
  }
  .grid-slot {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: stretch;
    padding-top: 0.35rem;
  }
  .ghost-btn {
    position: fixed;
    z-index: 5;
    width: 40px;
    height: 40px;
    border: 0;
    padding: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.38);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .ghost-btn:hover {
    color: rgba(255, 255, 255, 0.92);
  }
  .settings-btn {
    left: 1rem;
    bottom: 1.1rem;
  }
</style>
