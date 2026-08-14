<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { DEFAULT_SETTINGS, type Settings, type WallhavenSorting, type YtabState } from '../lib/types';
  import type { WallpaperFailFocus } from '../lib/wallpaperFail';
  import { plainNotice } from '../lib/notice';
  import { applyFilter, visibleTagPresets, type FilterAction } from '../lib/settingsFilters';
  import { testWallhavenKey } from '../lib/wallhavenKey';
  import { fetchBackup, deleteBackup } from '../lib/accountApi';
  import { signIn } from '../lib/accountAuth';
  import { accountConfigured } from '../lib/accountConfig';
  import { setPassphraseAndUpload, unlockBundle } from '../lib/accountBackup';
  import { passphraseOk } from '../lib/accountCrypto';
  import {
    clearSession,
    formatBackupAt,
    ensureAvatar,
    loadSession,
    saveSession,
    sessionFromAuth,
    sessionUnlocked,
    type AccountSession,
  } from '../lib/accountSession';
  import CapsuleSwitch from './CapsuleSwitch.svelte';
  import CustomScroll from './CustomScroll.svelte';
  import GhostTip from './GhostTip.svelte';
  import SegmentedControl from './SegmentedControl.svelte';

  type Tab = 'general' | 'wallpaper' | 'account';
  type Sheet = 'reset' | 'set' | 'unlock' | 'change' | 'choose' | 'delete' | null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: '通用' },
    { id: 'wallpaper', label: '壁纸' },
  ];

  const REPO_URL = 'https://github.com/LuoYe17/YTAB';
  const VERSION = 'v0.1.0';
  const KEY_URL = 'https://wallhaven.cc/settings/account';
  const SITE_URL = 'https://wallhaven.cc';
  const SORTING_OPTIONS: { value: WallhavenSorting; label: string }[] = [
    { value: 'random', label: '随机' },
    { value: 'date_added', label: '最新' },
    { value: 'relevance', label: '相关' },
    { value: 'views', label: '浏览' },
    { value: 'favorites', label: '收藏' },
    { value: 'toplist', label: '热门' },
  ];

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
  /* svelte-ignore state_referenced_locally */
  let glow = $state<WallpaperFailFocus | null>(highlight ?? null);
  let accountBusy = $state(false);
  let sheet = $state<Sheet>(null);
  let session = $state<AccountSession | null>(null);
  let passA = $state('');
  let passB = $state('');
  let passOld = $state('');
  let apiKeyEl = $state<HTMLInputElement | null>(null);
  let navEl = $state<HTMLElement | null>(null);
  let pill = $state({ top: 0, height: 0 });
  let pillSlide = $state(false);
  let revealKey = $state(false);
  let keyFlash = $state<'ok' | 'fail' | null>(null);
  let testBusy = $state(false);
  /* svelte-ignore state_referenced_locally */
  let wallhavenOpen = $state(Boolean(highlight));
  let tagsOpen = $state(false);

  const hasKey = $derived((settings.wallhavenApiKey ?? '').trim().length > 0);
  const keyOk = $derived(hasKey && settings.wallhavenKeyOk);
  const tagPresets = $derived(visibleTagPresets(settings.wallhavenCategories));
  const sortingOptions = $derived(
    SORTING_OPTIONS.map((o) => ({
      ...o,
      collapsed: o.value === 'relevance' && (settings.wallhavenTags?.length ?? 0) === 0,
    })),
  );
  const unlocked = $derived(sessionUnlocked(session));

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
    wallhavenOpen = true;
    glow = highlight;
  });

  $effect(() => {
    if (!glow) return;
    const id = window.setTimeout(() => {
      glow = null;
    }, 1500);
    if (glow === 'apiKey') {
      void tick().then(() => apiKeyEl?.focus());
    }
    return () => window.clearTimeout(id);
  });

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (sheet) sheet = null;
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  $effect(() => {
    void tab;
    const slide = untrack(() => pillSlide);
    void tick().then(() => {
      const btn = navEl?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      if (!btn) return;
      // offset* 是 layout 坐标。getBoundingClientRect 会吃到 sheet 的 scale，指示条会飞到顶上。
      pill = { top: btn.offsetTop, height: btn.offsetHeight };
      if (!slide) {
        requestAnimationFrame(() => {
          pillSlide = true;
        });
      }
    });
  });

  function patch(partial: Partial<Settings>) {
    onChange({ ...settings, ...partial });
  }

  function commitFilter(action: FilterAction) {
    const result = applyFilter(settings, action);
    if (result.notice) plainNotice('fail', result.notice);
    onChange(result.settings, result.invalidatePool);
  }

  function setPurity(key: 'sfw' | 'sketchy' | 'nsfw', on: boolean) {
    commitFilter({ type: 'purity', key, on });
  }

  function setCategory(key: 'general' | 'anime' | 'people', on: boolean) {
    commitFilter({ type: 'category', key, on });
  }

  function setTag(id: string, on: boolean) {
    commitFilter({ type: 'tag', id, on });
  }

  function onKeyInput(value: string) {
    commitFilter({ type: 'setKey', value });
  }

  async function testKey() {
    if (testBusy || !hasKey) return;
    testBusy = true;
    keyFlash = null;
    const key = settings.wallhavenApiKey;
    const result = await testWallhavenKey(key);
    testBusy = false;
    if (settings.wallhavenApiKey !== key) return;
    if (result === 'ok') {
      patch({ wallhavenKeyOk: true });
      keyFlash = 'ok';
      window.setTimeout(() => {
        if (keyFlash === 'ok') keyFlash = null;
      }, 800);
      return;
    }
    patch({ wallhavenKeyOk: false });
    keyFlash = 'fail';
    plainNotice('fail', result === 'invalid' ? '密钥无效' : '网络出现异常 请稍后再试');
    window.setTimeout(() => {
      if (keyFlash === 'fail') keyFlash = null;
    }, 450);
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

  /** 按真实高度过渡。写死很大的 max-height 会让展开只走前一截、收起先空转。 */
  function foldMax(node: HTMLElement, open: boolean) {
    const inner = () => node.firstElementChild as HTMLElement | null;
    const apply = (isOpen: boolean, instant: boolean) => {
      const h = inner()?.scrollHeight ?? 0;
      node.style.transitionDuration = instant ? '0s' : isOpen ? '0.48s' : '0.24s';
      if (isOpen) {
        node.style.maxHeight = `${h}px`;
        return;
      }
      if (instant) {
        node.style.maxHeight = '0px';
        return;
      }
      node.style.maxHeight = `${h}px`;
      node.getBoundingClientRect();
      node.style.maxHeight = '0px';
    };
    apply(open, true);
    const ro = new ResizeObserver(() => {
      if (!open) return;
      node.style.maxHeight = `${inner()?.scrollHeight ?? 0}px`;
    });
    const child = inner();
    if (child) ro.observe(child);
    return {
      update(isOpen: boolean) {
        open = isOpen;
        apply(isOpen, false);
      },
      destroy() {
        ro.disconnect();
      },
    };
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

{#snippet userMark()}
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="2" />
    <path
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      d="M5.2 19.2c.9-3.2 3.6-4.8 6.8-4.8s5.9 1.6 6.8 4.8"
    />
  </svg>
{/snippet}

{#snippet resetRow()}
  <div class="inline-row">
    <div class="head">
      <span class="title">重置本机</span>
      {@render helpMark('清掉本机全部数据，回到第一次打开。此设备登录会忘掉。云端还在。')}
    </div>
    <button type="button" class="danger" onclick={() => (sheet = 'reset')}>重置</button>
  </div>
{/snippet}

{#snippet wallhavenMark()}
  <svg class="wh-mark" viewBox="0 0 1024 1024" width="16" height="16" aria-hidden="true">
    <defs>
      <linearGradient id="ytab-wh-plate" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f0f0f0" />
        <stop offset="1" stop-color="#d0d0d0" />
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="180" ry="180" fill="url(#ytab-wh-plate)" />
    <g transform="translate(512 512) scale(1.08) translate(-537 -483)">
      <path
        fill="#2a2a2a"
        d="M216.8 776.4c-7.2-2-14-4.4-15.2-5.6-4-4 2-16.8 14-30l12-12.8h85.6l13.2-14.4c32-33.6 57.2-86.4 75.6-158.8 22.4-86.4 33.6-127.6 46.4-166 7.2-22.4 12-41.6 10.4-43.2-3.6-4-98.8 17.6-110 24.8-14.8 9.6-18 24-20.4 91.6l-2.4 64-11.6 1.2c-19.2 2.4-29.2-2.4-34-15.6-7.2-20.4-5.2-63.6 3.6-89.6 18-52.8 39.6-74 88.4-87.6 14-3.6 44-12 66.4-18.8 48.4-14 66-14.8 77.2-3.6 4.4 4.4 8 9.6 8 11.2s-9.2 24.4-20.4 50c-12.8 30-22.4 59.6-26 81.2-3.2 19.2-5.6 34.8-4.8 35.6 3.2 2.4 112.4 14 134 14h24.8l2.4-14.8c4.8-30.4 38.8-144 50.4-168.8 14.8-32 46.4-74.8 71.2-97.2 28.4-25.6 64-37.6 105.6-36 11.6 0.8 14.8 2.4 14.8 8.4 0 14.4-18.8 27.6-51.2 34.8-50.4 11.6-58.4 17.2-76.4 52.8-8.4 16.8-18.4 41.6-22.4 54.8s-12 40.4-18.4 60c-6.4 20-14.8 53.2-19.2 74s-12.4 55.2-18 76c-12.8 51.6-30.4 146.8-30.4 164.8 0 20 8.4 25.2 54.4 33.2 43.6 8 50.8 11.6 40 20-11.2 8.4-38.4 12-98.4 12h-54l-1.2-18c-0.4-10 2.8-34 7.2-54 20.4-90.4 36.4-171.2 34.4-173.2-1.2-0.8-26-3.6-55.2-5.6s-63.6-4.8-76.4-6.4c-15.2-2-24.4-1.6-26.4 0.8s-7.2 17.2-12 32.4c-11.6 39.6-41.2 98.8-59.6 118.8-8.4 9.6-23.6 28-33.6 41.2-28 36.4-41.6 49.6-58 56.4-17.2 7.6-65.6 10.8-84.4 6z"
      />
    </g>
  </svg>
{/snippet}

{#snippet tabIcon(id: Tab)}
  {#if id === 'general'}
    <!-- Lucide settings，ISC https://lucide.dev -->
    <svg class="tab-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
    </svg>
  {:else}
    <!-- Lucide image，ISC https://lucide.dev -->
    <svg class="tab-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" stroke="currentColor" stroke-width="2" />
      <circle cx="9" cy="9" r="2" stroke="currentColor" stroke-width="2" />
      <path
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
      />
    </svg>
  {/if}
{/snippet}

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-label="设置"
  transition:fade={{ duration: 180 }}
>
  <button type="button" class="backdrop" aria-label="关闭设置" onclick={onClose}></button>
  <div class="sheet ios-sheet" in:popFrom={{ x: origin.x, y: origin.y }} out:popFrom={{ x: origin.x, y: origin.y }}>
    <aside>
      {#if accountConfigured()}
        <button
          type="button"
          class="who"
          class:on={tab === 'account'}
          onclick={() => (tab = 'account')}
        >
          {#if session?.avatar}
            <img class="who-ava" src={session.avatar} alt="" />
          {:else}
            <span class="who-ava ph">{@render userMark()}</span>
          {/if}
          <span class="who-name">{session ? session.label : '登录'}</span>
        </button>
        <div class="who-rule"></div>
      {/if}
      <nav bind:this={navEl}>
        <div
          class="pill"
          class:on={pill.height > 0}
          class:slide={pillSlide}
          style:top="{pill.top}px"
          style:height="{pill.height}px"
        ></div>
        {#each TABS as item}
          <button
            type="button"
            data-tab={item.id}
            class:active={tab === item.id}
            onclick={() => (tab = item.id)}
          >
            {@render tabIcon(item.id)}
            {item.label}
          </button>
        {/each}
      </nav>
      <div class="foot">
        <div class="foot-start">
          <GhostTip label="GitHub">
            <a class="icon" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub">
              {@render githubMark()}
            </a>
          </GhostTip>
        </div>
        <span class="ver">{VERSION}</span>
        <div class="foot-end"></div>
      </div>
    </aside>
    <section>
      <header>
        <button type="button" class="close" onclick={onClose} aria-label="关闭">×</button>
      </header>

      <div class="pane">
        {#if tab === 'general'}
          <div class="body" in:fade={{ duration: 160 }} out:fade={{ duration: 120 }}>
            <CustomScroll>
              <div class="block inline">
                <div class="head">
                  <span id="lbl-open" class="title">打开方式</span>
                  {@render helpMark('点 App 时用当前这一页打开，还是另开一个标签。搜索框和页脚链接不受影响。')}
                </div>
                <SegmentedControl
                  labelledBy="lbl-open"
                  value={settings.openTarget}
                  options={[
                    { value: 'current', label: '当前标签' },
                    { value: 'new', label: '新标签' },
                  ]}
                  onChange={(v) => patch({ openTarget: v as Settings['openTarget'] })}
                />
              </div>
              <div class="block inline">
                <div class="head">
                  <span id="lbl-bing" class="title">搜索地区</span>
                  {@render helpMark('搜索框用国内 Bing 还是国际 Bing。国内更贴中文结果。')}
                </div>
                <SegmentedControl
                  labelledBy="lbl-bing"
                  value={settings.bingEndpoint}
                  options={[
                    { value: 'cn', label: '国内' },
                    { value: 'www', label: '国际' },
                  ]}
                  onChange={(v) => patch({ bingEndpoint: v as Settings['bingEndpoint'] })}
                />
              </div>
              {#if !accountConfigured()}
                <div class="block">
                  {@render resetRow()}
                </div>
              {/if}
            </CustomScroll>
          </div>
        {:else if tab === 'wallpaper'}
          <div class="body" in:fade={{ duration: 160 }} out:fade={{ duration: 120 }}>
            <CustomScroll>
              <div class="block fold-card">
                <div
                  class="head fold"
                  role="button"
                  tabindex="0"
                  aria-expanded={wallhavenOpen}
                  aria-label={wallhavenOpen ? '收起 Wallhaven' : '展开 Wallhaven'}
                  onclick={(e) => {
                    if ((e.target as HTMLElement).closest('.help, .wh-home')) return;
                    wallhavenOpen = !wallhavenOpen;
                  }}
                  onkeydown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    if ((e.target as HTMLElement).closest('.help, .wh-home')) return;
                    e.preventDefault();
                    wallhavenOpen = !wallhavenOpen;
                  }}
                >
                  <span class="fold-brand">
                    <a
                      class="wh-home"
                      href={SITE_URL}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="打开 Wallhaven 官网"
                    >
                      {@render wallhavenMark()}
                    </a>
                    <span class="title">Wallhaven</span>
                  </span>
                  <span class="fold-help">
                    {@render helpMark('拉壁纸用的站。密钥选填；尺度、分类、标签都在这里。')}
                  </span>
                  <span class="chev" class:open={wallhavenOpen} aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="14" height="14">
                      <path
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M4 6.5 8 10.5 12 6.5"
                      />
                    </svg>
                  </span>
                </div>
                <div class="fold-body" class:open={wallhavenOpen} use:foldMax={wallhavenOpen}>
                  <div class="fold-clip">
                    <div class="head" class:glow={glow === 'apiKey'}>
                      {#if keyOk}
                        <span class="key-ok" transition:scale={{ duration: 220, start: 0.45 }} aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="16" height="16">
                            <path
                              fill="none"
                              stroke="#34c759"
                              stroke-width="2.4"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M5 12.5 9.5 17 19 7"
                            />
                          </svg>
                        </span>
                      {/if}
                      <span class="title">密钥</span>
                      {@render helpMark('选填。填了拉图更稳，想看「少儿不宜」内容必须先填。')}
                      <a class="get" href={KEY_URL} target="_blank" rel="noreferrer">去获取</a>
                    </div>
                    <div class="key-row">
                      <div
                        class="key-field"
                        class:flash-ok={keyFlash === 'ok'}
                        class:flash-fail={keyFlash === 'fail'}
                      >
                        <input
                          bind:this={apiKeyEl}
                          type={revealKey ? 'text' : 'password'}
                          value={settings.wallhavenApiKey}
                          placeholder="可选"
                          autocomplete="off"
                          oninput={(e) => onKeyInput((e.currentTarget as HTMLInputElement).value)}
                        />
                        <button
                          type="button"
                          class="eye"
                          onclick={() => (revealKey = !revealKey)}
                          aria-label={revealKey ? '隐藏密钥' : '显示密钥'}
                        >
                          {#if revealKey}
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                              <path
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                d="M3 3l18 18M9.9 4.2A9 9 0 0 1 12 4c5.2 0 9.5 3.4 11 8.5a12 12 0 0 1-1.8 2.8M6.1 6.1C4 7.6 2.4 9.6 1 12.5 2.5 17.6 6.8 21 12 21c1.7 0 3.3-.4 4.7-1"
                              />
                            </svg>
                          {:else}
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                              <path
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M1 12.5C2.5 7.4 6.8 4 12 4s9.5 3.4 11 8.5C21.5 17.6 17.2 21 12 21S2.5 17.6 1 12.5Z"
                              />
                              <circle cx="12" cy="12.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
                            </svg>
                          {/if}
                        </button>
                      </div>
                      {#if hasKey}
                        <button type="button" class="action" disabled={testBusy} onclick={testKey}>测试</button>
                      {/if}
                    </div>
                  <div class="wh-row" class:glow={glow === 'filters'}>
                    <div class="head">
                      <span class="title">尺度</span>
                      {@render helpMark('想看少儿不宜的图。至少留一项。没密钥不能开「少儿不宜」。')}
                    </div>
                    <div class="caps tight">
                      <CapsuleSwitch
                        label="安全"
                        tile
                        on={settings.wallhavenPurity.sfw}
                        onChange={(on) => setPurity('sfw', on)}
                      />
                      <CapsuleSwitch
                        label="擦边"
                        tile
                        on={settings.wallhavenPurity.sketchy}
                        onChange={(on) => setPurity('sketchy', on)}
                      />
                      <CapsuleSwitch
                        label="少儿不宜"
                        tile
                        on={settings.wallhavenPurity.nsfw}
                        disabled={!hasKey}
                        onChange={(on) => setPurity('nsfw', on)}
                      />
                    </div>
                  </div>
                  <div class="wh-row" class:glow={glow === 'filters'}>
                    <div class="head">
                      <span class="title">分类</span>
                      {@render helpMark('壁纸属于哪一类。至少留一项。')}
                    </div>
                    <div class="caps tight">
                      <CapsuleSwitch
                        label="常规"
                        tile
                        on={settings.wallhavenCategories.general}
                        onChange={(on) => setCategory('general', on)}
                      />
                      <CapsuleSwitch
                        label="动漫"
                        tile
                        on={settings.wallhavenCategories.anime}
                        onChange={(on) => setCategory('anime', on)}
                      />
                      <CapsuleSwitch
                        label="人物"
                        tile
                        on={settings.wallhavenCategories.people}
                        onChange={(on) => setCategory('people', on)}
                      />
                    </div>
                  </div>
                  <div class="wh-row">
                    <div class="head">
                      <span id="wallpaper-sorting" class="title">排序</span>
                      {@render helpMark('按什么顺序抽图。「热门」看近一个月。勾了标签才出现「相关」；从随机或最新勾上第一个标签会改到相关。')}
                    </div>
                    <SegmentedControl
                      labelledBy="wallpaper-sorting"
                      value={settings.wallhavenSorting || DEFAULT_SETTINGS.wallhavenSorting}
                      options={sortingOptions}
                      fill
                      onChange={(v) => commitFilter({ type: 'sorting', value: v as WallhavenSorting })}
                    />
                  </div>
                    <div
                      class="head fold"
                      role="button"
                      tabindex="0"
                      aria-expanded={tagsOpen}
                      aria-label={tagsOpen ? '收起标签' : '展开标签'}
                      onclick={(e) => {
                        if ((e.target as HTMLElement).closest('.help')) return;
                        tagsOpen = !tagsOpen;
                      }}
                      onkeydown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        if ((e.target as HTMLElement).closest('.help')) return;
                        e.preventDefault();
                        tagsOpen = !tagsOpen;
                      }}
                    >
                      <span class="title">标签</span>
                      <span class="fold-help">
                        {@render helpMark('可选。跟着上面分类换。多选一起搜，全关就不限题材。')}
                      </span>
                      <span class="chev" class:open={tagsOpen} aria-hidden="true">
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <path
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M4 6.5 8 10.5 12 6.5"
                          />
                        </svg>
                      </span>
                    </div>
                    <div class="fold-body" class:open={tagsOpen} use:foldMax={tagsOpen}>
                      <div class="caps fill">
                        {#each tagPresets as tag (tag.id)}
                          <CapsuleSwitch
                            label={tag.label}
                            tile
                            on={(settings.wallhavenTags ?? []).includes(tag.id)}
                            onChange={(on) => setTag(tag.id, on)}
                          />
                        {/each}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CustomScroll>
          </div>
        {:else if tab === 'account'}
          <div class="body" in:fade={{ duration: 160 }} out:fade={{ duration: 120 }}>
            <CustomScroll>
              {#if !session}
                <div class="block inline">
                  <div class="head">
                    <span class="title">云端备份</span>
                    {@render helpMark('登录后改完自己传到云端。卸扩展或换机再登录，用恢复口令解开。可以不登。传到云端的是加密后的整份，服务器只见密文。口令忘了只能删掉重来。')}
                  </div>
                  <button type="button" class="action with-mark" disabled={accountBusy} onclick={() => login()}>
                    {@render githubMark()}
                    {accountBusy ? '登录中…' : '用 GitHub 登录'}
                  </button>
                </div>
              {:else if session}
                <div class="block">
                  <div class="inline-row">
                    <div class="head">
                      <span class="title">云端备份</span>
                      {@render helpMark('改完会自己传。后写盖住先写。传到云端的是加密后的整份，服务器只见密文。退出后本机留下，不再上传。')}
                    </div>
                    <span class="when">
                      {#if session.uploadedAt}
                        {formatBackupAt(session.uploadedAt)}
                      {:else if session.hasBackup}
                        {unlocked ? '云端有一份' : '未解开'}
                      {:else}
                        还没传过
                      {/if}
                    </span>
                  </div>
                  <div class="acts">
                    {#if unlocked}
                      <button type="button" class="ghost" disabled={accountBusy} onclick={() => (sheet = 'change')}>
                        改口令
                      </button>
                    {:else if session.hasBackup !== false}
                      <button type="button" class="action" disabled={accountBusy} onclick={() => (sheet = 'unlock')}>
                        解开
                      </button>
                    {:else}
                      <button type="button" class="action" disabled={accountBusy} onclick={() => (sheet = 'set')}>
                        设口令
                      </button>
                    {/if}
                    <button type="button" class="ghost" disabled={accountBusy} onclick={() => logout()}>退出</button>
                  </div>
                </div>
              {/if}
              <div class="block">
                {#if session}
                  <div class="inline-row">
                    <div class="head">
                      <span class="title">删除云端</span>
                      {@render helpMark('只丢掉服务器上的密文。本机不动。')}
                    </div>
                    <button type="button" class="danger" disabled={accountBusy} onclick={() => (sheet = 'delete')}>
                      删除
                    </button>
                  </div>
                {/if}
                {@render resetRow()}
              </div>
            </CustomScroll>
          </div>
        {/if}
      </div>
    </section>

    {#if sheet === 'choose'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="head">
            <span class="title">选一份</span>
          </div>
          <p>云端有一份，这台也有。用哪边？</p>
          <div class="confirm-row">
            <button type="button" class="ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="ghost" disabled={accountBusy} onclick={() => (sheet = 'set')}>
              用这台的
            </button>
            <button type="button" class="action" disabled={accountBusy} onclick={() => (sheet = 'unlock')}>
              用云端的
            </button>
          </div>
        </div>
      </div>
    {:else if sheet === 'set'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="head">
            <span class="title">恢复口令</span>
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
            <button type="button" class="ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="action" disabled={accountBusy} onclick={confirmSet}>
              确定
            </button>
          </div>
        </div>
      </div>
    {:else if sheet === 'unlock'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="head">
            <span class="title">解开云端</span>
            {@render helpMark('输入当时设的恢复口令。')}
          </div>
          <p>解开后这台会记住，退出或卸扩展才忘。</p>
          <input class="pass" type="password" autocomplete="current-password" placeholder="恢复口令" bind:value={passA} />
          <div class="confirm-row">
            <button type="button" class="ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="action" disabled={accountBusy} onclick={confirmUnlock}>
              解开
            </button>
          </div>
        </div>
      </div>
    {:else if sheet === 'change'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <div class="head">
            <span class="title">改口令</span>
            {@render helpMark('要先对上现在的口令。')}
          </div>
          <p>新口令至少 8 位。</p>
          <input class="pass" type="password" autocomplete="current-password" placeholder="现在的口令" bind:value={passOld} />
          <input class="pass" type="password" autocomplete="new-password" placeholder="新口令，至少 8 位" bind:value={passA} />
          <input class="pass" type="password" autocomplete="new-password" placeholder="再输入一次" bind:value={passB} />
          <div class="confirm-row">
            <button type="button" class="ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="action" disabled={accountBusy} onclick={confirmChange}>确定</button>
          </div>
        </div>
      </div>
    {:else if sheet === 'delete'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <p>删掉云端那份密文。本机网格不动。此操作不可撤销。</p>
          <div class="confirm-row">
            <button type="button" class="ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="danger" disabled={accountBusy} onclick={confirmDeleteCloud}>确定删除</button>
          </div>
        </div>
      </div>
    {:else if sheet === 'reset'}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <p>将清除全部 App、文件夹、设置、壁纸与一言缓存，并回到首次启动。这台登录会忘掉。云端还在。此操作不可撤销。</p>
          <div class="confirm-row">
            <button type="button" class="ghost" onclick={closeSheet}>取消</button>
            <button type="button" class="danger" onclick={confirmReset}>确定重置</button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: grid;
    place-items: center;
  }
  .backdrop {
    appearance: none;
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.28);
    cursor: default;
  }
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
  aside {
    position: relative;
    z-index: 2;
    background: rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .who {
    appearance: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    margin: 0.55rem 0.5rem 0;
    padding: 0.85rem 0.5rem 0.65rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    min-width: 0;
  }
  .who:hover:not(.on) {
    background: rgba(255, 255, 255, 0.06);
  }
  .who.on {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }
  .who-rule {
    height: 1px;
    margin: 0.4rem 1.2rem 0;
    background: rgba(255, 255, 255, 0.12);
    flex-shrink: 0;
  }
  .who-ava {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.08);
  }
  .who-ava.ph {
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.5);
  }
  .who-ava.ph :global(svg) {
    width: 22px;
    height: 22px;
  }
  .who-name {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.82rem;
    text-align: center;
  }
  nav {
    position: relative;
    flex: 1;
    min-height: 0;
    padding: 0.75rem 0.5rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .pill {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    pointer-events: none;
    opacity: 0;
  }
  .pill.on {
    opacity: 1;
  }
  .pill.slide {
    transition:
      top 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      height 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
  nav button {
    appearance: none;
    display: flex;
    align-items: center;
    gap: 0.42rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 0.45rem 0.7rem;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    z-index: 1;
    transition: color 0.15s ease;
  }
  nav button.active {
    color: #fff;
  }
  .tab-ico {
    flex-shrink: 0;
    opacity: 0.78;
  }
  nav button.active .tab-ico {
    opacity: 1;
  }
  .foot {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    margin-top: auto;
    padding: 0.45rem 0.6rem 0.7rem;
    background-image: linear-gradient(rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.12));
    background-size: calc(100% - 2.4rem) 1px;
    background-position: top center;
    background-repeat: no-repeat;
  }
  .foot-start {
    justify-self: start;
  }
  .foot-end {
    justify-self: end;
  }
  .ver {
    justify-self: center;
    font-size: 0.72rem;
    letter-spacing: 0.02em;
    opacity: 0.45;
    user-select: none;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.48);
    text-decoration: none;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }
  a.icon:hover {
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.08);
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
  .block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.7rem 0.8rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
  }
  .fold-card {
    gap: 0;
    padding: 0;
    overflow: hidden;
  }
  .fold-card > .head.fold {
    position: relative;
    z-index: 1;
    padding: 0.58rem 0.75rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
  }
  .block.inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .block.inline .head {
    flex-wrap: nowrap;
    flex-shrink: 0;
  }
  .block.inline .action {
    align-self: center;
    flex-shrink: 0;
  }
  .head.fold {
    width: 100%;
    cursor: pointer;
    border-radius: 8px;
    user-select: none;
  }
  .head.fold:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .fold-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .fold-brand .title {
    line-height: 1;
  }
  .wh-home {
    display: grid;
    flex-shrink: 0;
    line-height: 0;
    border-radius: 0.28em;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    transition:
      transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
      filter 0.18s ease,
      box-shadow 0.18s ease;
  }
  .wh-home:hover {
    transform: scale(1.18);
    filter: brightness(1.22);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  }
  .wh-home:focus-visible {
    outline: 2px solid rgba(126, 203, 255, 0.7);
    outline-offset: 2px;
  }
  .wh-mark {
    display: block;
    width: 1em;
    height: 1em;
    overflow: hidden;
    border-radius: 0.28em;
  }
  .fold-help {
    display: inline-flex;
  }
  .chev {
    margin-left: auto;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.55);
    display: grid;
    place-items: center;
    flex-shrink: 0;
    pointer-events: none;
  }
  .chev svg {
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .chev.open svg {
    transform: rotate(180deg);
  }
  .fold-body {
    overflow: hidden;
    max-height: 0;
    transition-property: max-height;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  .fold-clip {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.15rem 0.75rem 0.7rem;
  }
  .wh-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    padding: 0.15rem 0;
    border-radius: 8px;
  }
  .caps.tight {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.22rem 0.5rem;
  }
  .title {
    font-weight: 600;
  }
  .when {
    margin: 0;
    color: rgba(255, 255, 255, 0.48);
    font-size: 0.78rem;
    flex-shrink: 0;
  }
  .inline-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
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
  .get {
    margin-left: auto;
    color: #7ecbff;
    text-decoration: none;
    font-size: 0.8rem;
  }
  .get:hover {
    text-decoration: underline;
  }
  .key-ok {
    display: inline-grid;
    place-items: center;
    color: #34c759;
  }
  .caps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .caps.fill {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.4rem;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .key-field {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .key-field input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    border-radius: 8px;
    padding: 0.45rem 2.1rem 0.45rem 0.65rem;
    font: inherit;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .key-field input:focus {
    border-color: rgba(126, 203, 255, 0.55);
  }
  .key-field.flash-ok input {
    border-color: #34c759;
    box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.35);
  }
  .key-field.flash-fail {
    animation: shake 0.4s ease;
  }
  .key-field.flash-fail input {
    border-color: #ff3b30;
  }
  .eye {
    appearance: none;
    position: absolute;
    right: 0.28rem;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.42);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .eye:hover {
    color: rgba(255, 255, 255, 0.9);
  }
  .action,
  .danger,
  .ghost {
    appearance: none;
    border: 0;
    align-self: flex-start;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    font: inherit;
    transition:
      background 0.15s ease,
      transform 0.15s ease;
  }
  .action {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }
  .action.with-mark {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .action.with-mark svg {
    flex-shrink: 0;
  }
  .action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.24);
  }
  .action:disabled {
    opacity: 0.6;
  }
  .danger {
    background: #ff3b30;
    color: #fff;
  }
  .danger:hover {
    background: #e0352b;
  }
  .ghost {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.16);
  }
  .glow {
    box-shadow: 0 0 0 2px rgba(126, 203, 255, 0.85);
    animation: glow-fade 1.5s ease forwards;
  }
  @keyframes glow-fade {
    0% {
      box-shadow: 0 0 0 2px rgba(126, 203, 255, 0.95);
    }
    100% {
      box-shadow: 0 0 0 2px rgba(126, 203, 255, 0);
    }
  }
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    20% {
      transform: translateX(-6px);
    }
    40% {
      transform: translateX(6px);
    }
    60% {
      transform: translateX(-4px);
    }
    80% {
      transform: translateX(4px);
    }
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
  .confirm-row .action {
    background: #fff;
    color: #111;
  }
  .confirm-row .action:hover:not(:disabled) {
    background: #f2f2f7;
  }
  .confirm-row .action:disabled {
    opacity: 0.45;
  }
</style>
