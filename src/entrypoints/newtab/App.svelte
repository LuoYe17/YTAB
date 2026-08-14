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
  import { applyImportedState, holdFirstRun } from '../../lib/importApply';
  import {
    cancelAccountBackup,
    flushAccountBackup,
    scheduleAccountBackup,
    setPassphraseAndUpload,
  } from '../../lib/accountBackup';
  import { backupInterest } from '../../lib/accountInterest';
  import { passphraseOk } from '../../lib/accountCrypto';
  import { clearSession, loadSession, needsFirstPassphrase } from '../../lib/accountSession';
  import {
    createEmptyState,
    type AppItem,
    type HitokotoState,
    type Settings,
    type YtabState,
  } from '../../lib/types';
  import {
    createWallpaperSurface,
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
  let needPass = $state(false);
  let passA = $state('');
  let passB = $state('');
  let passBusy = $state(false);

  const wallpaper = createWallpaperSurface({
    onDisplay: (url) => {
      displayUrl = url;
    },
    persist: (wp) => persist((prev) => ({ ...prev, wallpaper: wp })),
  });

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
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        flushAccountBackup();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    void bootstrap();
    return () => document.removeEventListener('visibilitychange', onHide);
  });

  function packCurrent(): YtabState {
    return { ...$state.snapshot(ytab), pages: $state.snapshot(grid).pages };
  }

  async function bootstrap() {
    try {
      ytab = await loadState();
    } catch {
      loadFailed = true;
      ready = true;
      return;
    }
    grid = createAppGridView(ytab.pages, 0);
    wallpaper.restore(ytab.wallpaper);
    ready = true;
    if (!ytab.onboardingDone) return;
    await refreshHitokoto();
    await wallpaper.ensureDaily(ytab.settings, ytab.wallpaper);
  }

  async function retryLoad() {
    loadFailed = false;
    ready = false;
    await bootstrap();
  }

  async function persist(updater: (prev: YtabState) => YtabState) {
    const before = backupInterest(packCurrent());
    ytab = updater(ytab);
    await saveState(ytab);
    const after = packCurrent();
    if (backupInterest(after) !== before) scheduleAccountBackup(after);
  }

  async function refreshHitokoto() {
    const next = await fetchHitokoto({ exclude: ytab.hitokoto.text });
    if (!next.ok) return;
    await persist((prev) => ({ ...prev, hitokoto: next.value }));
  }

  async function changeHitokoto(): Promise<HitokotoFetchResult> {
    const next = await fetchHitokoto({ exclude: ytab.hitokoto.text });
    if (!next.ok) return next;
    await persist((prev) => ({ ...prev, hitokoto: next.value }));
    return next;
  }

  /** 准备阶段：只拉取/解码，不上屏。 */
  function prepareWallpaperRefresh(): Promise<WallpaperPrepareResult> {
    return wallpaper.prepare(ytab.settings);
  }

  /** 提交阶段：上屏与绿勾同时，再等动画走完才交还按钮。 */
  async function commitWallpaperRefresh(): Promise<void> {
    await wallpaper.commit(ytab.settings);
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
    const pages = paginate(result.apps);
    // 先接网格再 persist：packCurrent 以 grid.pages 为准，反过来会把空桌面排进备份。
    grid = createAppGridView(pages, 0);
    await persist((prev) => {
      const next: YtabState = {
        ...prev,
        onboardingDone: false,
        pages,
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
    // 没拿到图也要备池：这一开页后面还要「换一张」。
    wallpaper.adopt(result.wallpaper, ytab.settings);
  }

  async function onFirstRunReveal() {
    await persist((prev) => ({ ...prev, onboardingDone: true }));
    const session = await loadSession();
    if (needsFirstPassphrase(session)) needPass = true;
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
    if (invalidatePool) wallpaper.onFiltersChanged(settings);
  }

  /** 整份换掉：先接网格再落盘。壁纸怎么接由调用方决定。 */
  async function landState(next: YtabState) {
    grid = createAppGridView(next.pages, 0);
    await persist(() => next);
    settingsOpen = false;
    settingsHighlight = null;
  }

  async function onImportState(next: YtabState) {
    const { state } = applyImportedState(next);
    await landState(state);
    wallpaper.adopt(state.wallpaper, state.settings);
  }

  async function onRestoreDuringFirstRun(next: YtabState) {
    const { state } = applyImportedState(next);
    await landState(holdFirstRun(state));
    wallpaper.adopt(state.wallpaper, state.settings);
  }

  async function onResetAll() {
    cancelAccountBackup();
    await clearSession();
    needPass = false;
    const { state } = applyImportedState(createEmptyState(), { endFirstRun: false });
    await landState(state);
    // 重置后人在首次启动界面，不该在后台替他拉壁纸。
    wallpaper.forget();
    addOpen = false;
    editingApp = null;
    plainNotice('ok', '已重置');
  }

  async function confirmFirstPass() {
    if (passA !== passB) {
      plainNotice('fail', '两次口令不一致');
      return;
    }
    if (passBusy) return;
    if (!passphraseOk(passA)) {
      plainNotice('fail', '恢复口令至少 8 位');
      return;
    }
    passBusy = true;
    try {
      const session = await loadSession();
      if (!session) {
        needPass = false;
        return;
      }
      await setPassphraseAndUpload(packCurrent(), passA, session);
      needPass = false;
      passA = '';
      passB = '';
      plainNotice('ok', '已上传');
    } catch (err) {
      plainNotice('fail', err instanceof Error ? err.message : '上传失败');
    } finally {
      passBusy = false;
    }
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
      <GhostTip label="设置">
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
    <FirstRun
      settings={ytab.settings}
      onChoose={onFirstRun}
      onRestored={onRestoreDuringFirstRun}
      onReveal={onFirstRunReveal}
    />
  {/if}

  {#if addOpen || editingApp}
    <!-- 不要套 {#key}：会把 outro 掐掉，开关看起来像闪一下。换编辑对象由对话框自己重建草稿。 -->
    <AddAppDialog
      initial={editingApp}
      onSave={editingApp ? saveEditedApp : addApp}
      onCancel={() => {
        addOpen = false;
        editingApp = null;
      }}
    />
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
      onboardingDone={ytab.onboardingDone}
      packCurrent={packCurrent}
      onApplyState={onImportState}
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

  {#if needPass}
    <div class="pass-gate" role="dialog" aria-modal="true" aria-labelledby="pass-title">
      <div class="pass-card">
        <h2 id="pass-title">恢复口令</h2>
        <p>用来加密云端这份。至少 8 位，忘了就打不开。</p>
        <input class="pass" type="password" autocomplete="new-password" placeholder="至少 8 位" bind:value={passA} />
        <input class="pass" type="password" autocomplete="new-password" placeholder="再输入一次" bind:value={passB} />
        <div class="pass-row">
          <button type="button" class="pass-skip" disabled={passBusy} onclick={() => (needPass = false)}>
            稍后
          </button>
          <button type="button" class="pass-go" disabled={passBusy} onclick={confirmFirstPass}>
            确定
          </button>
        </div>
      </div>
    </div>
  {/if}
  {/if}

  <NoticeHost onAction={(focus) => openSettings(focus)} />
{/if}

<style>
  .pass-gate {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.28);
  }
  .pass-card {
    width: min(360px, calc(100vw - 2rem));
    padding: 0.9rem 1rem 1rem;
    background: rgba(28, 28, 32, 0.72);
    backdrop-filter: blur(28px) saturate(1.25);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    color: #f5f5f7;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
  }
  .pass-card h2 {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .pass-card p {
    margin: 0 0 0.7rem;
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.55);
  }
  .pass {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 0.45rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    font: inherit;
    outline: none;
  }
  .pass:focus {
    border-color: rgba(126, 203, 255, 0.55);
  }
  .pass-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.2rem;
  }
  .pass-go,
  .pass-skip {
    appearance: none;
    flex: 1;
    border: 0;
    border-radius: 8px;
    padding: 0.5rem;
    font: inherit;
    cursor: pointer;
  }
  .pass-go {
    background: #fff;
    color: #111;
  }
  .pass-skip {
    background: rgba(255, 255, 255, 0.12);
    color: #f5f5f7;
  }
  .pass-go:disabled,
  .pass-skip:disabled {
    opacity: 0.45;
    cursor: default;
  }
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
