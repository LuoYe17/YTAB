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
  import GhostTip from '../../components/GhostTip.svelte';
  import {
    apply,
    createAppGridView,
    currentPageItems,
    paginate,
    type AppGridEvent,
    type AppGridView,
  } from '../../lib/appGrid';
  import { readGridMetrics } from '../../lib/gridInsertGeometry';
  import type { PageDropTarget } from '../../lib/gridDrag';
  import { fetchHitokoto, type HitokotoFetchResult } from '../../lib/hitokoto';
  import { loadState, saveState } from '../../lib/storage';
  import { downloadBlob, exportYtab, importYtab } from '../../lib/backup';
  import { applyImportedState } from '../../lib/importApply';
  import {
    createEmptyState,
    type AppItem,
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
  import { plainNotice, showNotice } from '../../lib/notice';
  import NoticeHost from '../../components/NoticeHost.svelte';

  let ready = $state(false);
  let loadFailed = $state(false);
  let ytab = $state(createEmptyState());
  /** live pages 只在这里；persist 时才写回 ytab.pages */
  let grid = $state<AppGridView>(createAppGridView());
  let settingsOpen = $state(false);
  let settingsHighlight = $state<WallpaperFailFocus | null>(null);
  let addOpen = $state(false);
  let editingApp = $state<AppItem | null>(null);
  /** 上屏 URL；准备阶段仍是旧图，提交后才换成新图。 */
  let displayUrl = $state('');
  let mainEl = $state<HTMLElement | null>(null);
  let pageGridEl = $state<HTMLElement | null>(null);
  let settingsBtnEl = $state<HTMLButtonElement | null>(null);
  let settingsOrigin = $state({ x: 40, y: 40 });

  /** 文件夹里拖出来时落到主网格哪一格；壳已隐藏，落点带仍是整个 main。 */
  function readPageDropTarget(excludeId: string): PageDropTarget | null {
    const metrics = pageGridEl ? readGridMetrics(pageGridEl) : null;
    if (!metrics || !mainEl) return null;
    const r = mainEl.getBoundingClientRect();
    return {
      metrics,
      band: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      occupiedCount: currentPageItems(grid).filter((i) => i.id !== excludeId).length,
    };
  }

  function openSettings(focus: WallpaperFailFocus | null = null) {
    const r = settingsBtnEl?.getBoundingClientRect();
    if (r) settingsOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    settingsHighlight = focus;
    settingsOpen = true;
  }

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
    grid = createAppGridView(ytab.pages, 0);
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
    if (!next.ok) return;
    await persist((prev) => ({ ...prev, hitokoto: next.value }));
  }

  async function changeHitokoto(): Promise<HitokotoFetchResult> {
    const next = await fetchHitokoto();
    if (!next.ok) return next;
    await persist((prev) => ({ ...prev, hitokoto: next.value }));
    return next;
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

  function dispatchGrid(event: AppGridEvent) {
    const { view, persist: write } = apply(grid, event);
    grid = view;
    if (write) {
      void persist((prev) => ({ ...prev, pages: view.pages })).catch(() => {
        // 网格已上屏；落盘失败必须说出来，否则拖完刷新会丢
        plainNotice('fail', '保存失败了');
      });
    }
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
    grid = createAppGridView(paginate(result.apps), 0);
    if (result.wallpaper) {
      displayUrl = result.wallpaper.imageUrl;
      wallpaperPool.rememberCurrent(result.wallpaper.wallhavenId);
    }
    schedulePoolFill(ytab.settings);
  }

  function openApp(app: AppItem) {
    if (ytab.settings.openTarget === 'new') {
      window.open(app.url, '_blank', 'noopener,noreferrer');
    } else {
      location.href = app.url;
    }
  }

  function addApp(app: AppItem) {
    dispatchGrid({ type: 'add', app });
    addOpen = false;
    editingApp = null;
  }

  function saveEditedApp(app: AppItem) {
    dispatchGrid({ type: 'update', app });
    editingApp = null;
    addOpen = false;
  }

  async function onSettingsChange(settings: Settings, invalidatePool = false) {
    await persist((p) => ({ ...p, settings }));
    if (invalidatePool) {
      wallpaperPool.clear();
      schedulePoolFill(settings);
    }
  }

  async function landImported(applied: ReturnType<typeof applyImportedState>) {
    if (applied.invalidatePool) wallpaperPool.clear();
    await persist(() => applied.state);
    displayUrl = applied.displayUrl;
    settingsOpen = false;
    settingsHighlight = null;
    grid = createAppGridView(applied.state.pages, 0);
  }

  async function onImportState(next: YtabState) {
    const applied = applyImportedState(next);
    await landImported(applied);
    schedulePoolFill(applied.state.settings);
  }

  async function onExportFile(opts: { includeIcons: boolean; includeApiKey: boolean }) {
    const snap = $state.snapshot(ytab);
    const blob = await exportYtab({ ...snap, pages: $state.snapshot(grid).pages }, opts);
    downloadBlob(blob, `ytab-${new Date().toISOString().slice(0, 10)}.ytab`);
  }

  async function onImportFile(file: File) {
    const state = await importYtab(file);
    await onImportState(state);
  }

  async function onResetAll() {
    await landImported(applyImportedState(createEmptyState(), { endFirstRun: false }));
    addOpen = false;
    editingApp = null;
    plainNotice('ok', '已重置');
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
    <main bind:this={mainEl}>
      <Clock />
      <HitokotoLine text={ytab.hitokoto.text} from={ytab.hitokoto.from} onRefresh={changeHitokoto} />
      <SearchBox endpoint={ytab.settings.bingEndpoint} />
      {#if ytab.onboardingDone}
        <div class="grid-slot">
          <AppGrid
            items={currentPageItems(grid)}
            pageIndex={grid.pageIndex}
            pageCount={grid.pages.length}
            onOpenApp={openApp}
            onAdd={() => {
              editingApp = null;
              addOpen = true;
            }}
            onEditApp={(app) => {
              addOpen = false;
              editingApp = app;
            }}
            onEvent={dispatchGrid}
            hitRoot={mainEl}
            bind:gridEl={pageGridEl}
          />
        </div>
      {/if}
    </main>

    <div class="settings-slot">
      <GhostTip label="设置" placement="ne">
        <button
          bind:this={settingsBtnEl}
          type="button"
          class="ghost-btn"
          onclick={() => openSettings()}
          aria-label="设置"
        >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.65 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.77 14.5a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.4.3.62.22l2.39-.96c.5.39 1.04.71 1.62.94l.36 2.54c.05.23.25.41.48.41h4c.24 0 .43-.17.48-.41l.36-2.54c.59-.23 1.13-.55 1.62-.94l2.39.96c.22.08.5 0 .62-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
        />
      </svg>
        </button>
      </GhostTip>
    </div>
    {#if ytab.onboardingDone}
      <WallpaperRefreshControl
        onPrepare={prepareWallpaperRefresh}
        onCommit={commitWallpaperRefresh}
        onFail={(hint) =>
          showNotice({
            tone: 'fail',
            before: hint.before,
            action: { text: hint.link, focus: hint.focus },
            after: hint.after,
          })
        }
      />
    {/if}
  </div>

  {#if !ytab.onboardingDone}
    <FirstRun settings={ytab.settings} onChoose={onFirstRun} />
  {/if}

  {#if addOpen || editingApp}
    {#key editingApp?.id ?? 'new'}
      <AddAppDialog
        initial={editingApp}
        onSave={editingApp ? saveEditedApp : addApp}
        onCancel={() => {
          addOpen = false;
          editingApp = null;
        }}
      />
    {/key}
  {/if}

  {#if settingsOpen}
    <SettingsModal
      settings={ytab.settings}
      highlight={settingsHighlight}
      origin={settingsOrigin}
      onClose={() => {
        settingsOpen = false;
        settingsHighlight = null;
      }}
      onChange={onSettingsChange}
      onExport={onExportFile}
      onImport={onImportFile}
      onResetAll={onResetAll}
    />
  {/if}

  {#if grid.openFolder}
    <FolderOverlay
      folder={grid.openFolder}
      onClose={() => dispatchGrid({ type: 'closeFolder' })}
      onOpenApp={openApp}
      onRename={(name) =>
        dispatchGrid({ type: 'renameFolder', folderId: grid.openFolder!.id, name })
      }
      onEvent={dispatchGrid}
      onEditApp={(app) => {
        addOpen = false;
        editingApp = app;
      }}
      onDeleteApp={(app) => dispatchGrid({ type: 'removeApp', appId: app.id })}
      {readPageDropTarget}
    />
  {/if}
  {/if}

  <NoticeHost onAction={(focus) => openSettings(focus)} />
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
  .settings-slot {
    position: fixed;
    z-index: 5;
    left: 1rem;
    bottom: 1.1rem;
  }
</style>
