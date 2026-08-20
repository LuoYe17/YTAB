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
  import { paginate } from '../../lib/appGrid';
  import { createGridController } from '../../lib/gridController.svelte';
  import { createWallpaperController } from '../../lib/wallpaperController.svelte';
  import { fetchHitokoto } from '../../lib/hitokoto';
  import { loadState, saveState } from '../../lib/storage';
  import { schedulePoolFill, wallpaperPool, type WallpaperItem } from '../../lib/wallpaper';
  import {
    createEmptyState,
    type AppItem,
    type HitokotoState,
    type Settings,
    type WallpaperState,
    type YtabState,
  } from '../../lib/types';

  let ready = $state(false);
  let ytab = $state(createEmptyState());
  let settingsOpen = $state(false);
  let addOpen = $state(false);

  const wallpaper = createWallpaperController({
    getSettings: () => ytab.settings,
    getWallpaper: () => ytab.wallpaper,
    persistWallpaper: async (item: WallpaperItem) => {
      const wp: WallpaperState = {
        imageUrl: item.imageUrl,
        fetchedOn: item.fetchedOn,
        wallhavenId: item.wallhavenId,
      };
      await persist((prev) => ({ ...prev, wallpaper: wp }));
      wallpaperPool.rememberCurrent(item.wallhavenId);
    },
  });

  const grid = createGridController({
    getPages: () => ytab.pages,
    persistPages: async (pages) => {
      await persist((prev) => ({ ...prev, pages }));
    },
  });

  onMount(() => {
    void bootstrap();
  });

  async function bootstrap() {
    ytab = await loadState();
    wallpaper.setDisplayUrl(ytab.wallpaper.imageUrl);
    ready = true;
    if (!ytab.onboardingDone) return;
    await refreshHitokoto();
    await wallpaper.ensureWallpaper(false);
    wallpaper.rememberCurrent(ytab.wallpaper.wallhavenId);
    schedulePoolFill(ytab.settings);
  }

  async function persist(updater: (prev: YtabState) => YtabState) {
    ytab = updater(ytab);
    await saveState(ytab);
  }

  async function refreshHitokoto() {
    const next = await fetchHitokoto();
    if (!next) return;
    await persist((prev) => ({ ...prev, hitokoto: next }));
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
      wallpaper.setDisplayUrl(result.wallpaper.imageUrl);
      wallpaper.rememberCurrent(result.wallpaper.wallhavenId);
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

  async function addApp(app: AppItem) {
    await grid.addApp(app);
    addOpen = false;
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
    wallpaper.setDisplayUrl(next.wallpaper.imageUrl);
    settingsOpen = false;
    grid.setPageIndex(0);
    schedulePoolFill(next.settings);
  }

  async function onResetAll() {
    wallpaperPool.clear();
    await persist(() => createEmptyState());
    wallpaper.setDisplayUrl('');
    settingsOpen = false;
    grid.setPageIndex(0);
    grid.closeFolder();
    addOpen = false;
  }
</script>

{#if ready}
  <div class="page">
    <WallpaperStage url={wallpaper.displayUrl} />
    <div class="shade"></div>
    <main>
      <Clock />
      <HitokotoLine text={ytab.hitokoto.text} from={ytab.hitokoto.from} />
      <SearchBox endpoint={ytab.settings.bingEndpoint} />
      {#if ytab.onboardingDone}
        <AppGrid
          items={grid.currentPageItems()}
          pageIndex={grid.pageIndex}
          pageCount={ytab.pages.length}
          onOpenApp={openApp}
          onOpenFolder={grid.openFolderItem}
          onPageChange={grid.setPageIndex}
          onAdd={() => (addOpen = true)}
          onMerge={grid.mergeApps}
          onDropIntoFolder={grid.dropIntoFolder}
          onReorderPage={grid.reorderPage}
          onPageFlip={grid.pageFlipDuringDrag}
          onDragSessionStart={grid.onGridDragSessionStart}
          onDragSessionCancel={grid.onGridDragSessionCancel}
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
      onPrepareWallpaper={wallpaper.prepareWallpaperRefresh}
      onCommitWallpaper={wallpaper.commitWallpaperRefresh}
      onImportState={onImportState}
      onResetAll={onResetAll}
    />
  {/if}

  {#if grid.openFolder}
    <FolderOverlay
      folder={grid.openFolder}
      onClose={grid.closeFolder}
      onOpenApp={openApp}
      onRename={(name) => grid.renameFolder(grid.openFolder!.id, name)}
      onReorderChildren={grid.reorderFolderChildren}
      onEjectAt={grid.ejectFromFolderAt}
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
