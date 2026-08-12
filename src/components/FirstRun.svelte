<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import {
    AUTHOR_DEFAULT_APPS,
    buildAuthorDefaultAppsCached,
    faviconUrlFor,
  } from '../lib/defaults';
  import { bundledIconUrl } from '../lib/appIcons';
  import { fetchHitokoto } from '../lib/hitokoto';
  import type { AppItem, HitokotoState, Settings } from '../lib/types';
  import { fetchRandomWallpaper, type WallhavenFetchResult } from '../lib/wallpaper';

  let {
    settings,
    onChoose,
  }: {
    settings: Settings;
    onChoose: (result: {
      mode: 'author' | 'empty';
      apps: AppItem[];
      hitokoto: HitokotoState | null;
      wallpaper: WallhavenFetchResult | null;
    }) => void;
  } = $props();

  let selected = $state<'author' | 'empty'>('author');
  let phase = $state<'idle' | 'scan' | 'success'>('idle');

  async function confirm() {
    if (phase !== 'idle') return;
    phase = 'scan';
    const started = Date.now();
    try {
      const [apps, hitokoto, wallpaper] = await Promise.all([
        (selected === 'author'
          ? buildAuthorDefaultAppsCached()
          : Promise.resolve([] as AppItem[])
        ).catch(() => [] as AppItem[]),
        fetchHitokoto()
          .then((r) => (r.ok ? r.value : null))
          .catch(() => null),
        fetchRandomWallpaper(settings)
          .then((got) => (got.ok ? got.item : null))
          .catch(() => null),
      ]);

      // 至少播一会扫描动画，避免闪一下就没了
      const minMs = 700;
      const left = minMs - (Date.now() - started);
      if (left > 0) await sleep(left);

      phase = 'success';
      await sleep(650);
      onChoose({ mode: selected, apps, hitokoto, wallpaper });
    } catch {
      phase = 'idle';
    }
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  function pick(mode: 'author' | 'empty') {
    if (phase !== 'idle') return;
    selected = mode;
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="fr-title" transition:fade={{ duration: 160 }}>
  <div class="sheet" transition:scale={{ duration: 200, start: 0.96 }}>
    <header class="head">
      <h1 id="fr-title">欢迎使用 YTAB</h1>
      <p class="sub">选择起始配置</p>
    </header>

    <div
      class="choices"
      class:on-empty={selected === 'empty'}
      class:locked={phase !== 'idle'}
      role="radiogroup"
      aria-label="起始配置"
    >
      <div class="thumb" aria-hidden="true"></div>

      <button
        type="button"
        class="choice"
        class:selected={selected === 'author'}
        role="radio"
        aria-checked={selected === 'author'}
        aria-describedby="tip-author"
        disabled={phase !== 'idle'}
        onclick={() => pick('author')}
      >
        <span class="start">
          <span class="choice-title">作者默认</span>
          <span class="hint">
            <span class="q" aria-hidden="true">?</span>
            <span class="tip tip-rich" id="tip-author">
              <span class="tip-lead">一打开就有这些作者常用网站，您不喜欢以后随时能删、能改：</span>
              {#each AUTHOR_DEFAULT_APPS as site}
                <span class="tip-row">
                  <img src={bundledIconUrl(site.url) || faviconUrlFor(site.url)} alt="" width="14" height="14" />
                  <span>{site.name}</span>
                </span>
              {/each}
            </span>
          </span>
        </span>
        <span class="tick" aria-hidden="true"></span>
      </button>

      <button
        type="button"
        class="choice"
        class:selected={selected === 'empty'}
        role="radio"
        aria-checked={selected === 'empty'}
        aria-describedby="tip-empty"
        disabled={phase !== 'idle'}
        onclick={() => pick('empty')}
      >
        <span class="start">
          <span class="choice-title">从头再来</span>
          <span class="hint">
            <span class="q" aria-hidden="true">?</span>
            <span class="tip" id="tip-empty">什么网站都没有。</span>
          </span>
        </span>
        <span class="tick" aria-hidden="true"></span>
      </button>
    </div>

    <div class="footer">
      {#if phase === 'idle'}
        <button type="button" class="confirm" onclick={confirm} aria-label="确认">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5.5 12.5 10 17l8.5-9.5"
            />
          </svg>
        </button>
      {:else if phase === 'scan'}
        <div class="faceid" aria-label="准备中" aria-live="polite">
          <svg viewBox="0 0 64 64" width="44" height="44">
            <circle class="faceid-track" cx="32" cy="32" r="22" />
            <circle class="faceid-arc" cx="32" cy="32" r="22" />
            <g class="faceid-mark" fill="none" stroke="#0a84ff" stroke-linecap="round" stroke-linejoin="round">
              <path stroke-width="2.4" d="M22 26V22h4" />
              <path stroke-width="2.4" d="M42 22h4v4" />
              <path stroke-width="2.4" d="M46 42v4h-4" />
              <path stroke-width="2.4" d="M26 46h-4v-4" />
              <ellipse cx="32" cy="33" rx="7.5" ry="9" stroke-width="2" />
              <circle cx="29.2" cy="31.5" r="1.15" fill="#0a84ff" stroke="none" />
              <circle cx="34.8" cy="31.5" r="1.15" fill="#0a84ff" stroke="none" />
              <path stroke-width="1.8" d="M32 33.2v3.2" />
            </g>
          </svg>
        </div>
      {:else}
        <div class="success" aria-label="成功" aria-live="polite">
          <svg viewBox="0 0 64 64" width="44" height="44">
            <circle class="success-ring" cx="32" cy="32" r="22" />
            <path
              class="success-check"
              fill="none"
              stroke="#34c759"
              stroke-width="3.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M20 33.5 28.5 42 44 24"
            />
          </svg>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0 1rem max(3.25rem, calc(env(safe-area-inset-bottom, 0px) + 2.5rem));
    background: rgba(0, 0, 0, 0.5);
  }

  .sheet {
    width: min(360px, 100%);
    background: #f2f2f7;
    color: #1d1d1f;
    border-radius: 22px;
    padding: 0.85rem 0.85rem 0.7rem;
    margin-bottom: 0;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.32);
    overflow: visible;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "SF Pro Text",
      "Segoe UI",
      "PingFang SC",
      "Microsoft YaHei",
      sans-serif;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.65rem;
    padding: 0 0.15rem;
  }

  h1 {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  .sub {
    margin: 0;
    font-size: 0.72rem;
    color: #8e8e93;
    white-space: nowrap;
  }

  .choices {
    --gap: 0.5rem;
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--gap);
    overflow: visible;
  }

  /* 线框盖在选项之上平移，避免被白底挡住 */
  .thumb {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 4;
    width: calc((100% - var(--gap)) / 2);
    height: 100%;
    border-radius: 14px;
    border: 1.5px solid #0a84ff;
    background: transparent;
    box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.14);
    pointer-events: none;
    transition: transform 0.38s cubic-bezier(0.22, 0.9, 0.28, 1);
    will-change: transform;
  }

  .choices.on-empty .thumb {
    transform: translateX(calc(100% + var(--gap)));
  }

  .choice {
    appearance: none;
    position: relative;
    z-index: 1;
    border: 1.5px solid transparent;
    background: #fff;
    border-radius: 14px;
    padding: 0.7rem 0.65rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
    color: inherit;
    text-align: left;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
    transition: background-color 0.12s ease, box-shadow 0.12s ease;
  }

  .choice.selected {
    background: #f0f7ff;
    box-shadow: none;
  }

  .choice:hover:not(:disabled):not(.selected) {
    background: #f5f5f7;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
  }

  .choice:has(.hint:hover) {
    z-index: 6;
  }

  .choice:disabled {
    cursor: default;
  }

  .choices.locked .choice {
    opacity: 0.9;
  }

  .start {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    min-width: 0;
  }

  .choice-title {
    font-size: 0.84rem;
    font-weight: 600;
  }

  .hint {
    position: relative;
    display: inline-grid;
    place-items: center;
    cursor: help;
    flex-shrink: 0;
  }

  .q {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    font-size: 0.62rem;
    font-weight: 700;
    color: #8e8e93;
    background: #e5e5ea;
    line-height: 1;
  }

  .tip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translateX(-50%) translateY(4px);
    width: max-content;
    max-width: min(280px, 72vw);
    height: auto;
    padding: 0.45rem 0.55rem;
    border-radius: 10px;
    background: #1c1c1e;
    color: #f5f5f7;
    font-size: 0.68rem;
    font-weight: 400;
    line-height: 1.45;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.15s ease,
      transform 0.15s ease,
      visibility 0.15s;
    z-index: 20;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
  }

  .tip-rich {
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    min-width: 9.5rem;
  }

  .tip-lead {
    margin-bottom: 0.1rem;
    opacity: 0.92;
  }

  .tip-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .tip-row img {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.12);
  }

  .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border: 5px solid transparent;
    border-top-color: #1c1c1e;
  }

  .hint:hover .tip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
  }

  .tick {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1.5px solid #d1d1d6;
    flex-shrink: 0;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.22s cubic-bezier(0.2, 0.9, 0.2, 1.2);
  }

  .choice.selected .tick {
    border-color: #0a84ff;
    background: #0a84ff;
    box-shadow: inset 0 0 0 3px #fff;
    transform: scale(1.08);
  }

  .footer {
    margin-top: 0.75rem;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .confirm {
    appearance: none;
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 50%;
    background: #0a84ff;
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition:
      transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1.15),
      background 0.15s ease;
  }

  .confirm:hover {
    background: #0077ed;
    transform: scale(1.02);
  }

  .confirm:active {
    transform: scale(0.97);
  }

  .faceid,
  .success {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
  }

  .faceid-track {
    fill: none;
    stroke: rgba(10, 132, 255, 0.18);
    stroke-width: 3;
  }

  .faceid-arc {
    fill: none;
    stroke: #0a84ff;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 42 96;
    transform-origin: 32px 32px;
    animation: faceid-spin 0.9s linear infinite;
  }

  .faceid-mark {
    animation: faceid-pulse 0.9s ease-in-out infinite;
  }

  .success-ring {
    fill: none;
    stroke: #34c759;
    stroke-width: 3;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
    animation: ring-draw 0.42s ease forwards;
  }

  .success-check {
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
    animation: check-draw 0.32s 0.18s ease forwards;
  }

  @keyframes faceid-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes faceid-pulse {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes ring-draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes check-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
