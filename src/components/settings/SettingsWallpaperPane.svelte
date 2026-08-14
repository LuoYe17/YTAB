<script lang="ts">
  // 壁纸 tab 的伞形面板，不是 Wallhaven 专用壳。以后加非 Wallhaven 源时在其下新增平级子组件，命名参照 SettingsWallhavenKey / SettingsWallhavenFilters。滚动与 fade 由 SettingsModal 的 .body 包。
  import type { Snippet } from 'svelte';
  import { foldMax } from '../../lib/foldMax';
  import { plainNotice } from '../../lib/notice';
  import { applyFilter, type FilterAction } from '../../lib/settingsFilters';
  import type { Settings } from '../../lib/types';
  import type { WallpaperFailFocus } from '../../lib/wallpaperFail';
  import SettingsWallhavenFilters from './SettingsWallhavenFilters.svelte';
  import SettingsWallhavenKey from './SettingsWallhavenKey.svelte';

  const SITE_URL = 'https://wallhaven.cc';

  let {
    settings,
    highlight = null,
    onChange,
    onPatch,
    helpMark,
  }: {
    settings: Settings;
    highlight?: WallpaperFailFocus | null;
    onChange: (next: Settings, invalidatePool?: boolean) => void;
    onPatch: (partial: Partial<Settings>) => void;
    helpMark: Snippet<[string]>;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  let glow = $state<WallpaperFailFocus | null>(highlight ?? null);
  /* svelte-ignore state_referenced_locally */
  let wallhavenOpen = $state(Boolean(highlight));

  $effect(() => {
    if (!highlight) return;
    wallhavenOpen = true;
    glow = highlight;
  });

  $effect(() => {
    if (!glow) return;
    const id = window.setTimeout(() => {
      glow = null;
    }, 1500);
    return () => window.clearTimeout(id);
  });

  const hasKey = $derived((settings.wallhavenApiKey ?? '').trim().length > 0);

  function commitFilter(action: FilterAction) {
    const result = applyFilter(settings, action);
    if (result.notice) plainNotice('fail', result.notice);
    onChange(result.settings, result.invalidatePool);
  }
</script>

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

<div class="st-block fold-card">
  <div
    class="st-head st-fold"
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
      <a class="wh-home" href={SITE_URL} target="_blank" rel="noreferrer" aria-label="打开 Wallhaven 官网">
        {@render wallhavenMark()}
      </a>
      <span class="st-title">Wallhaven</span>
    </span>
    <span class="st-fold-help">
      {@render helpMark('拉壁纸用的站。密钥选填；尺度、分类、标签都在这里。')}
    </span>
    <span class="st-chev" class:open={wallhavenOpen} aria-hidden="true">
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
  <div class="st-fold-body" class:open={wallhavenOpen} use:foldMax={wallhavenOpen}>
    <div class="fold-clip">
      <SettingsWallhavenKey
        {settings}
        {hasKey}
        glowApiKey={glow === 'apiKey'}
        onCommitFilter={commitFilter}
        {onPatch}
        {helpMark}
      />
      <SettingsWallhavenFilters
        {settings}
        {hasKey}
        glowFilters={glow === 'filters'}
        onCommitFilter={commitFilter}
        {helpMark}
      />
    </div>
  </div>
</div>

<style>
  .fold-card {
    gap: 0;
    padding: 0;
    overflow: hidden;
  }
  .fold-card > .st-head.st-fold {
    position: relative;
    z-index: 1;
    padding: 0.58rem 0.75rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
  }
  .fold-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .fold-brand .st-title {
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
  .fold-clip {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.15rem 0.75rem 0.7rem;
  }
</style>
