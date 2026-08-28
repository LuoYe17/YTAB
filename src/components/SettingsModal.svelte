<script lang="ts">
  // 设置壳：侧栏 + 分类内容 + 内层确认 frame。账号的活都在 SettingsAccountPane，
  // 口令卡的骨架在 PassphraseSheet；这里不出现口令字段，也不写会话。
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Settings, SettingsTab, YtabState } from '../lib/types';
  import type { WallpaperFailFocus } from '../lib/wallpaperFail';
  import { accountConfigured } from '../lib/accountConfig';
  import { ensureAvatar, loadSession, type AccountSession } from '../lib/accountSession';
  import type { PassphraseInput } from '../lib/passphrase';
  import CustomScroll from './CustomScroll.svelte';
  import DialogShell from './DialogShell.svelte';
  import HelpMark from './HelpMark.svelte';
  import PassphraseSheet from './PassphraseSheet.svelte';
  import SettingsAccountPane from './settings/SettingsAccountPane.svelte';
  import SettingsGeneralPane from './settings/SettingsGeneralPane.svelte';
  import SettingsNav from './settings/SettingsNav.svelte';
  import SettingsWallpaperPane from './settings/SettingsWallpaperPane.svelte';
  import './settings/settingsChrome.css';

  type Sheet = 'reset' | 'set' | 'unlock' | 'change' | 'choose' | 'delete' | null;

  let {
    settings,
    highlight = null,
    origin = { x: 40, y: 40 },
    onClose,
    onChange,
    onboardingDone,
    onApplyState,
    onBackup,
    onResetAll,
  }: {
    settings: Settings;
    highlight?: WallpaperFailFocus | null;
    origin?: { x: number; y: number };
    onClose: () => void;
    onChange: (next: Settings, invalidatePool?: boolean) => void;
    onboardingDone: boolean;
    onApplyState: (state: YtabState) => void | Promise<void>;
    /** 账号面板要上传时拿宿主整份的唯一切口；面板看不到 YtabState。 */
    onBackup: (passphrase: string, session: AccountSession) => Promise<AccountSession>;
    onResetAll: () => void;
  } = $props();

  // $state 初值读了 $props().highlight，编译器警告这只是一次快照。后面 highlight 由 $effect 同步，tab 也会被侧栏改掉，不能改成 $derived。
  /* svelte-ignore state_referenced_locally */
  let tab = $state<SettingsTab>(highlight ? 'wallpaper' : 'general');
  let sheet = $state<Sheet>(null);
  let session = $state<AccountSession | null>(null);
  let accountBusy = $state(false);
  let account: {
    submitPass(mode: 'set' | 'unlock' | 'change', input: PassphraseInput): Promise<void>;
    confirmDeleteCloud(): Promise<void>;
  } | null = $state(null);

  $effect(() => {
    if (!accountConfigured() && tab === 'account') tab = 'general';
  });

  $effect(() => {
    // 侧栏头像条在账号 tab 之外也要显示会话，所以加载放在壳层而不是账号面板；
    // 这里要画头像，缺了就顺手补一次，其余读会话的地方不该因此写盘。
    void (async () => {
      const read = await loadSession();
      session = read;
      const withAvatar = await ensureAvatar(read);
      // 补头像要走网络，回来时用户可能已经登出或换了账号。
      if (session === read) session = withAvatar;
    })();
  });

  $effect(() => {
    if (!highlight) return;
    tab = 'wallpaper';
  });

  function patch(partial: Partial<Settings>) {
    onChange({ ...settings, ...partial });
  }

  function onShellEscape() {
    if (sheet) closeSheet();
    else onClose();
  }

  // 内层 sheet 关掉即卸载，口令字段随 PassphraseSheet 一起清空。
  function closeSheet() {
    sheet = null;
  }

  function confirmReset() {
    closeSheet();
    onResetAll();
  }

  function popFrom(node: HTMLElement, params: { x: number; y: number }) {
    const run = (x: number, y: number) => {
      const r = node.getBoundingClientRect();
      node.style.transformOrigin = `${x - r.left}px ${y - r.top}px`;
    };
    run(params.x, params.y);
    return {
      duration: 280,
      easing: cubicOut,
      css: (t: number) => `transform: scale(${0.14 + 0.86 * t}); opacity: ${t}`,
    };
  }
</script>

{#snippet helpMark(text: string)}
  <HelpMark {text} />
{/snippet}

{#snippet githubMark()}
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
    />
  </svg>
{/snippet}

{#snippet resetRow()}
  <div class="st-inline-row">
    <div class="st-head">
      <span class="st-title">重置本机</span>
      {@render helpMark('清掉本机全部数据，回到第一次打开。此设备登录会忘掉。云端还在。')}
    </div>
    <button type="button" class="st-danger" onclick={() => (sheet = 'reset')}>重置</button>
  </div>
{/snippet}

<DialogShell ariaLabel="设置" zIndex={45} backdropLabel="关闭设置" {onClose} onEscape={onShellEscape}>
  <div class="sheet ios-sheet" in:popFrom={{ x: origin.x, y: origin.y }} out:popFrom={{ x: origin.x, y: origin.y }}>
    <SettingsNav {tab} {session} showWho={accountConfigured()} onSelectTab={(id) => (tab = id)} {githubMark} />
    <section>
      <header>
        <button type="button" class="close" onclick={onClose} aria-label="关闭">×</button>
      </header>

      <div class="pane">
        {#if tab === 'general'}
          <div class="body" in:fade={{ duration: 160 }} out:fade={{ duration: 120 }}>
            <CustomScroll>
              <SettingsGeneralPane
                {settings}
                showReset={!accountConfigured()}
                onPatch={patch}
                {helpMark}
                {resetRow}
              />
            </CustomScroll>
          </div>
        {:else if tab === 'wallpaper'}
          <div class="body" in:fade={{ duration: 160 }} out:fade={{ duration: 120 }}>
            <CustomScroll>
              <SettingsWallpaperPane {settings} {highlight} {onChange} onPatch={patch} {helpMark} />
            </CustomScroll>
          </div>
        {:else if tab === 'account'}
          <div class="body" in:fade={{ duration: 160 }} out:fade={{ duration: 120 }}>
            <CustomScroll>
              <SettingsAccountPane
                bind:session
                bind:busy={accountBusy}
                bind:this={account}
                {onboardingDone}
                onOpenSheet={(s) => (sheet = s)}
                onCloseSheet={closeSheet}
                {onApplyState}
                {onBackup}
                {helpMark}
                {githubMark}
                {resetRow}
              />
            </CustomScroll>
          </div>
        {/if}
      </div>
    </section>

    {#if sheet === 'set' || sheet === 'unlock' || sheet === 'change'}
      {@const mode = sheet}
      <PassphraseSheet
        {mode}
        hasBackup={session?.hasBackup ?? false}
        busy={accountBusy}
        onCancel={closeSheet}
        onSubmit={(input) => account?.submitPass(mode, input)}
      />
    {:else if sheet === 'choose'}
      <div class="st-confirm" transition:fade={{ duration: 140 }}>
        <div class="st-confirm-card">
          <div class="st-head">
            <span class="st-title">选一份</span>
          </div>
          <p>云端有一份，这台也有。用哪边？</p>
          <div class="st-confirm-row">
            <button type="button" class="st-ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="st-ghost" disabled={accountBusy} onclick={() => (sheet = 'set')}>
              用这台的
            </button>
            <button type="button" class="st-action" disabled={accountBusy} onclick={() => (sheet = 'unlock')}>
              用云端的
            </button>
          </div>
        </div>
      </div>
    {:else if sheet === 'delete'}
      <div class="st-confirm" transition:fade={{ duration: 140 }}>
        <div class="st-confirm-card">
          <p>删掉云端那份密文。本机网格不动。此操作不可撤销。</p>
          <div class="st-confirm-row">
            <button type="button" class="st-ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="st-danger" disabled={accountBusy} onclick={() => account?.confirmDeleteCloud()}>确定删除</button>
          </div>
        </div>
      </div>
    {:else if sheet === 'reset'}
      <div class="st-confirm" transition:fade={{ duration: 140 }}>
        <div class="st-confirm-card">
          <p>将清除全部 App、文件夹、设置、壁纸与一言缓存，并回到首次启动。这台登录会忘掉。云端还在。此操作不可撤销。</p>
          <div class="st-confirm-row">
            <button type="button" class="st-ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="st-danger" onclick={confirmReset}>确定重置</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</DialogShell>

<style>
  .sheet {
    position: relative;
    z-index: 1;
    width: min(640px, 94vw);
    height: min(420px, 80vh);
    display: grid;
    grid-template-columns: 148px 1fr;
    background: rgba(28, 28, 32, 0.52);
    backdrop-filter: blur(28px) saturate(1.25);
    color: #f5f5f7;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
    font-size: 0.9rem;
  }
  section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0.55rem 0.9rem 0.15rem;
  }
  .close {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.35rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }
  .close:hover {
    opacity: 1;
  }
  .pane {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
  .body {
    position: absolute;
    inset: 0;
  }
</style>
