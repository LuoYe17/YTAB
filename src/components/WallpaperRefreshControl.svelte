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

  type Phase = 'idle' | 'scan' | 'success' | 'error';
  let phase = $state<Phase>('idle');
  /** 进态才加，离场层留下给缩放交接，下次进再挂以重播内部动效。 */
  let scanGen = $state(0);
  let okGen = $state(0);
  let errGen = $state(0);

  function enter(next: Phase) {
    if (next === 'scan') scanGen += 1;
    if (next === 'success') okGen += 1;
    if (next === 'error') errGen += 1;
    phase = next;
  }

  async function refresh() {
    if (phase !== 'idle') return;
    enter('scan');
    const started = Date.now();
    try {
      const prepared = await onPrepare();
      const left = 700 - (Date.now() - started);
      if (left > 0) await new Promise<void>((r) => setTimeout(r, left));
      if (prepared.ok) {
        enter('success');
        await Promise.all([onCommit(), new Promise<void>((r) => setTimeout(r, 650))]);
      } else if (prepared.reason === 'busy') {
        phase = 'idle';
        return;
      } else {
        enter('error');
        onFail(wallpaperFailHint(prepared.reason));
        await new Promise<void>((r) => setTimeout(r, 480));
      }
    } catch {
      enter('error');
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
      aria-busy={phase === 'scan'}
      onclick={refresh}
      aria-label="换一张"
    >
    <span class="layer" class:on={phase === 'idle'} aria-hidden={phase !== 'idle'}>
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          class="idle-stroke"
          d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"
        />
        <path class="idle-stroke" d="M21 3v5h-5" />
      </svg>
    </span>

    <span class="layer" class:on={phase === 'scan'} aria-hidden={phase !== 'scan'}>
      {#key scanGen}
        {#if scanGen > 0}
          <FaceScan color="#fff" size={28} />
        {/if}
      {/key}
    </span>

    <span class="layer" class:on={phase === 'success'} aria-hidden={phase !== 'success'}>
      {#key okGen}
        {#if okGen > 0}
          <OkTick size={28} />
        {/if}
      {/key}
    </span>

    <span class="layer fail" class:on={phase === 'error'} aria-hidden={phase !== 'error'}>
      {#key errGen}
        {#if errGen > 0}
          <svg viewBox="0 0 64 64" width="28" height="28">
            <circle class="fail-ring" cx="32" cy="32" r="22" />
            <path class="fail-x" fill="none" stroke="#ff3b30" stroke-width="3.2" stroke-linecap="round" d="M24 24 40 40" />
            <path class="fail-x" fill="none" stroke="#ff3b30" stroke-width="3.2" stroke-linecap="round" d="M40 24 24 40" />
          </svg>
        {/if}
      {/key}
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
  .idle-stroke {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.85;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .layer {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    pointer-events: none;
    opacity: 0;
    transform: scale(0.62);
    transition:
      opacity 0.24s ease,
      transform 0.32s cubic-bezier(0.22, 1.4, 0.36, 1);
  }
  .layer.on {
    opacity: 1;
    transform: scale(1);
  }
  .layer:not(.on) :global(svg *) {
    animation-play-state: paused;
  }
  .layer.on.fail svg {
    animation: fail-shake 0.45s ease;
  }
  .fail-ring {
    fill: none;
    stroke: #ff3b30;
    stroke-width: 3;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
  }
  .layer.on .fail-ring {
    animation: fx-ring-draw 0.42s ease forwards;
  }
  .fail-x {
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
  }
  .layer.on .fail-x {
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
