<script lang="ts">
  import GhostTip from './GhostTip.svelte';
  import FaceScan from './FaceScan.svelte';
  import OkTick from './OkTick.svelte';
  import './effects.css';
  import type { WallpaperPrepareResult } from '../lib/wallpaper';
  import { wallpaperFailHint, type WallpaperFailHint } from '../lib/wallpaperFail';

  let {
    onPrepare,
    onCommit,
    onFail,
  }: {
    onPrepare: () => Promise<WallpaperPrepareResult>;
    onCommit: () => void | Promise<void>;
    onFail: (hint: WallpaperFailHint) => void;
  } = $props();

  let phase = $state<'idle' | 'scan' | 'success' | 'error'>('idle');

  async function refresh() {
    if (phase !== 'idle') return;
    phase = 'scan';
    const started = Date.now();
    try {
      const prepared = await onPrepare();
      const left = 700 - (Date.now() - started);
      if (left > 0) await new Promise<void>((r) => setTimeout(r, left));
      if (prepared.ok) {
        phase = 'success';
        await Promise.all([onCommit(), new Promise<void>((r) => setTimeout(r, 650))]);
      } else if (prepared.reason === 'busy') {
        phase = 'idle';
        return;
      } else {
        phase = 'error';
        onFail(wallpaperFailHint(prepared.reason));
        await new Promise<void>((r) => setTimeout(r, 480));
      }
    } catch {
      phase = 'error';
      onFail(wallpaperFailHint('network'));
      await new Promise<void>((r) => setTimeout(r, 480));
    } finally {
      phase = 'idle';
    }
  }
</script>

<div class="wrap">
  <GhostTip label="换一张">
    <button
      type="button"
      class="ghost"
      class:busy={phase !== 'idle'}
      disabled={phase !== 'idle'}
      onclick={refresh}
      aria-label="换一张"
    >
    <span class="idle" class:hide={phase !== 'idle'} aria-hidden={phase !== 'idle'}>
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          fill="currentColor"
          d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-8.9 3.1L6.7 17.5A7 7 0 0 0 19 13c0-3.87-3.13-7-7-7Zm-7 7c0-1.04.23-2.02.64-2.91L4.22 8.67A8.96 8.96 0 0 0 3 13a9 9 0 0 0 9 9v-2a7 7 0 0 1-7-7Z"
        />
      </svg>
    </span>

    <span class="glyph" class:show={phase === 'scan'} aria-hidden={phase !== 'scan'}>
      {#if phase === 'scan'}
        <FaceScan color="#fff" track="rgba(255, 255, 255, 0.22)" size={28} />
      {/if}
    </span>

    <span class="glyph" class:show={phase === 'success'} aria-hidden={phase !== 'success'}>
      {#if phase === 'success'}
        <OkTick size={28} />
      {/if}
    </span>

    <span class="glyph fail" class:show={phase === 'error'} aria-hidden={phase !== 'error'}>
      <svg viewBox="0 0 64 64" width="28" height="28">
        <circle class="fail-ring" cx="32" cy="32" r="22" />
        <path class="fail-x" fill="none" stroke="#ff3b30" stroke-width="3.2" stroke-linecap="round" d="M24 24 40 40" />
        <path class="fail-x" fill="none" stroke="#ff3b30" stroke-width="3.2" stroke-linecap="round" d="M40 24 24 40" />
      </svg>
    </span>
  </button>
  </GhostTip>
</div>

<style>
  .wrap {
    position: fixed;
    right: 1rem;
    bottom: 1.1rem;
    z-index: 5;
    display: grid;
    place-items: center;
  }
  .ghost {
    appearance: none;
    position: relative;
    width: 40px;
    height: 40px;
    border: 0;
    padding: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.38);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: color 0.15s ease, opacity 0.15s ease;
  }
  .ghost:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.92);
  }
  .ghost.busy {
    color: rgba(255, 255, 255, 0.7);
  }
  .idle {
    display: grid;
    place-items: center;
    transition: opacity 0.14s ease;
  }
  .idle.hide {
    opacity: 0;
  }
  .glyph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.14s ease;
  }
  .glyph.show {
    opacity: 1;
  }
  .glyph.fail.show {
    animation: fail-shake 0.45s ease;
  }
  .fail-ring {
    fill: none;
    stroke: #ff3b30;
    stroke-width: 3;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
  }
  .glyph.show .fail-ring {
    animation: fx-ring-draw 0.42s ease forwards;
  }
  .fail-x {
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
  }
  .glyph.show .fail-x {
    animation: fx-check-draw 0.32s 0.12s ease forwards;
  }
  @keyframes fail-shake {
    0%,
    100% {
      transform: translateX(0);
    }
    12% {
      transform: translateX(-5px);
    }
    25% {
      transform: translateX(5px);
    }
    37% {
      transform: translateX(-5px);
    }
    50% {
      transform: translateX(5px);
    }
    62% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }
</style>
