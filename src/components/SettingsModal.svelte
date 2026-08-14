<script lang="ts">
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Settings, YtabState } from '../lib/types';
  import type { WallpaperFailFocus } from '../lib/wallpaperFail';
  import { plainNotice } from '../lib/notice';
  import { fetchBackup, deleteBackup } from '../lib/accountApi';
  import { signIn } from '../lib/accountAuth';
  import { accountConfigured } from '../lib/accountConfig';
  import { setPassphraseAndUpload, unlockBundle } from '../lib/accountBackup';
  import { passphraseOk } from '../lib/accountCrypto';
  import {
    clearSession,
    ensureAvatar,
    loadSession,
    saveSession,
    sessionFromAuth,
    type AccountSession,
  } from '../lib/accountSession';
  import CustomScroll from './CustomScroll.svelte';
  import DialogShell from './DialogShell.svelte';
  import GhostTip from './GhostTip.svelte';
  import SettingsAccountPane from './settings/SettingsAccountPane.svelte';
  import SettingsGeneralPane from './settings/SettingsGeneralPane.svelte';
  import SettingsNav from './settings/SettingsNav.svelte';
  import SettingsWallpaperPane from './settings/SettingsWallpaperPane.svelte';
  import './settings/settingsChrome.css';

  type Tab = 'general' | 'wallpaper' | 'account';
  type Sheet = 'reset' | 'set' | 'unlock' | 'change' | 'choose' | 'delete' | null;

  let {
    settings,
    highlight = null,
    origin = { x: 40, y: 40 },
    onClose,
    onChange,
    onboardingDone,
    packCurrent,
    onApplyState,
    onResetAll,
  }: {
    settings: Settings;
    highlight?: WallpaperFailFocus | null;
    origin?: { x: number; y: number };
    onClose: () => void;
    onChange: (next: Settings, invalidatePool?: boolean) => void;
    onboardingDone: boolean;
    packCurrent: () => YtabState;
    onApplyState: (state: YtabState) => void | Promise<void>;
    onResetAll: () => void;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  let tab = $state<Tab>(highlight ? 'wallpaper' : 'general');
  let accountBusy = $state(false);
  let sheet = $state<Sheet>(null);
  let session = $state<AccountSession | null>(null);
  let passA = $state('');
  let passB = $state('');
  let passOld = $state('');

  $effect(() => {
    if (!accountConfigured() && tab === 'account') tab = 'general';
  });

  $effect(() => {
    // 这里要画头像，缺了就顺手补一次；其余读会话的地方不该因此写盘。
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

  function closeSheet() {
    sheet = null;
    passA = '';
    passB = '';
    passOld = '';
  }

  function fail(err: unknown, fallback: string) {
    plainNotice('fail', err instanceof Error ? err.message : fallback);
  }

  async function login() {
    if (accountBusy) return;
    accountBusy = true;
    try {
      const auth = await signIn();
      const next = await sessionFromAuth(auth);
      await saveSession(next);
      session = next;
      if (auth.hasBackup) {
        sheet = onboardingDone ? 'choose' : 'unlock';
      } else if (onboardingDone) {
        sheet = 'set';
      } else {
        plainNotice('ok', '云端还没有，先选一种起始');
      }
    } catch (err) {
      fail(err, '登录失败');
    } finally {
      accountBusy = false;
    }
  }

  async function logout() {
    await clearSession();
    session = null;
    closeSheet();
    plainNotice('ok', '已登出');
  }

  async function confirmSet() {
    if (passA !== passB) {
      plainNotice('fail', '两次口令不一致');
      return;
    }
    if (!session) return;
    if (!passphraseOk(passA)) {
      plainNotice('fail', '恢复口令至少 8 位');
      return;
    }
    accountBusy = true;
    try {
      session = await setPassphraseAndUpload(packCurrent(), passA, session);
      closeSheet();
      plainNotice('ok', '已上传');
    } catch (err) {
      fail(err, '上传失败');
    } finally {
      accountBusy = false;
    }
  }

  async function confirmUnlock() {
    if (!session) return;
    if (!passA) {
      plainNotice('fail', '请输入恢复口令');
      return;
    }
    accountBusy = true;
    try {
      const bundle = await fetchBackup(session.token);
      if (!bundle) throw new Error('云端还没有');
      const got = await unlockBundle(bundle, passA);
      const next = {
        ...session,
        rawKey: got.rawKey,
        salt: got.salt,
        iter: got.iter,
        hasBackup: true,
        uploadedAt: session.uploadedAt,
      };
      await saveSession(next);
      session = next;
      await onApplyState(got.state);
      closeSheet();
      plainNotice('ok', '已恢复');
    } catch (err) {
      fail(err, '恢复失败');
    } finally {
      accountBusy = false;
    }
  }

  async function confirmChange() {
    if (passA !== passB) {
      plainNotice('fail', '两次口令不一致');
      return;
    }
    if (!session) return;
    if (!passphraseOk(passA)) {
      plainNotice('fail', '恢复口令至少 8 位');
      return;
    }
    accountBusy = true;
    try {
      // 解开只为验旧口令，明文随即丢弃；上传的内容以这台当前状态为准（后写盖住先写）。
      const bundle = await fetchBackup(session.token);
      if (bundle) await unlockBundle(bundle, passOld);
      session = await setPassphraseAndUpload(packCurrent(), passA, session);
      closeSheet();
      plainNotice('ok', '已改口令');
    } catch (err) {
      fail(err, '改口令失败');
    } finally {
      accountBusy = false;
    }
  }

  async function confirmDeleteCloud() {
    if (!session) return;
    accountBusy = true;
    try {
      await deleteBackup(session.token);
      const next = {
        ...session,
        rawKey: undefined,
        salt: undefined,
        iter: undefined,
        uploadedAt: undefined,
        hasBackup: false,
      };
      await saveSession(next);
      session = next;
      closeSheet();
      plainNotice('ok', '云端这份已删');
    } catch (err) {
      fail(err, '删除失败');
    } finally {
      accountBusy = false;
    }
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
  <GhostTip label={text} wrap>
    <button type="button" class="help" aria-label={text}>?</button>
  </GhostTip>
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
                {session}
                {accountBusy}
                onLogin={() => login()}
                onLogout={() => logout()}
                onOpenSheet={(s) => (sheet = s)}
                {helpMark}
                {githubMark}
                {resetRow}
              />
            </CustomScroll>
          </div>
        {/if}
      </div>
    </section>

    {#if sheet === 'choose'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="st-head">
            <span class="st-title">选一份</span>
          </div>
          <p>云端有一份，这台也有。用哪边？</p>
          <div class="confirm-row">
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
    {:else if sheet === 'set'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="st-head">
            <span class="st-title">恢复口令</span>
            {@render helpMark('用来加密云端这份。忘了就打不开，只能删掉重来。')}
          </div>
          <p>
            {session?.hasBackup
              ? '会用这台的内容盖住云端那份，旧口令随之作废。至少 8 位。'
              : '至少 8 位。再输入一次确认。'}
          </p>
          <input class="pass" type="password" autocomplete="new-password" placeholder="至少 8 位" bind:value={passA} />
          <input class="pass" type="password" autocomplete="new-password" placeholder="再输入一次" bind:value={passB} />
          <div class="confirm-row">
            <button type="button" class="st-ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="st-action" disabled={accountBusy} onclick={confirmSet}>
              确定
            </button>
          </div>
        </div>
      </div>
    {:else if sheet === 'unlock'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="st-head">
            <span class="st-title">解开云端</span>
            {@render helpMark('输入当时设的恢复口令。')}
          </div>
          <p>解开后这台会记住，退出或卸扩展才忘。</p>
          <input class="pass" type="password" autocomplete="current-password" placeholder="恢复口令" bind:value={passA} />
          <div class="confirm-row">
            <button type="button" class="st-ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="st-action" disabled={accountBusy} onclick={confirmUnlock}>
              解开
            </button>
          </div>
        </div>
      </div>
    {:else if sheet === 'change'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="st-head">
            <span class="st-title">改口令</span>
            {@render helpMark('要先对上现在的口令。')}
          </div>
          <p>新口令至少 8 位。</p>
          <input class="pass" type="password" autocomplete="current-password" placeholder="现在的口令" bind:value={passOld} />
          <input class="pass" type="password" autocomplete="new-password" placeholder="新口令，至少 8 位" bind:value={passA} />
          <input class="pass" type="password" autocomplete="new-password" placeholder="再输入一次" bind:value={passB} />
          <div class="confirm-row">
            <button type="button" class="st-ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="st-action" disabled={accountBusy} onclick={confirmChange}>确定</button>
          </div>
        </div>
      </div>
    {:else if sheet === 'delete'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <p>删掉云端那份密文。本机网格不动。此操作不可撤销。</p>
          <div class="confirm-row">
            <button type="button" class="st-ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="st-danger" disabled={accountBusy} onclick={confirmDeleteCloud}>确定删除</button>
          </div>
        </div>
      </div>
    {:else if sheet === 'reset'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <p>将清除全部 App、文件夹、设置、壁纸与一言缓存，并回到首次启动。这台登录会忘掉。云端还在。此操作不可撤销。</p>
          <div class="confirm-row">
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
  .help {
    appearance: none;
    width: 1rem;
    height: 1rem;
    margin: 0;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 50%;
    background: transparent;
    color: rgba(255, 255, 255, 0.48);
    font: inherit;
    font-size: 0.68rem;
    line-height: 1;
    cursor: help;
  }
  .help:hover {
    color: rgba(255, 255, 255, 0.88);
    border-color: rgba(255, 255, 255, 0.5);
  }
  .confirm {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.4);
    padding: 1rem;
  }
  .confirm-card {
    width: min(360px, 100%);
    background: rgba(28, 28, 32, 0.72);
    backdrop-filter: blur(28px) saturate(1.25);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    padding: 0.9rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    color: #f5f5f7;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
  }
  .confirm-card p {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .confirm-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .confirm-row .st-action {
    background: #fff;
    color: #111;
  }
  .confirm-row .st-action:hover:not(:disabled) {
    background: #f2f2f7;
  }
  .confirm-row .st-action:disabled {
    opacity: 0.45;
  }
</style>
