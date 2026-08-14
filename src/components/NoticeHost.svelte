<script lang="ts">
  import { onMount } from 'svelte';
  import {
    dismissNotice,
    noticeAnimationEnded,
    subscribeNotice,
    type Notice,
  } from '../lib/notice';
  import type { WallpaperFailFocus } from '../lib/wallpaperFail';

  let { onAction }: { onAction: (focus: WallpaperFailFocus) => void } = $props();

  let shown = $state<Notice | null>(null);
  let phase = $state<'in' | 'out'>('in');

  function onCardClick() {
    if (shown) dismissNotice(shown.id);
  }

  function onLink(e: MouseEvent, focus: WallpaperFailFocus) {
    e.stopPropagation();
    if (shown) dismissNotice(shown.id);
    onAction(focus);
  }

  onMount(() =>
    subscribeNotice((view) => {
      shown = view.notice;
      phase = view.phase;
    }),
  );
</script>

{#if shown}
  {@const n = shown}
  {@const action = n.action}
  <div
    class="notice"
    class:ok={n.tone === 'ok'}
    class:fail={n.tone === 'fail'}
    class:arrive={phase === 'in'}
    class:slip={phase === 'out'}
    onanimationend={(e) => noticeAnimationEnded(e.animationName)}
  >
    <button type="button" class="dismiss" aria-label="关闭通知" onclick={onCardClick}></button>
    <span class="mark" aria-hidden="true">
      {#if n.tone === 'ok'}
        <svg viewBox="0 0 24 24" width="20" height="20">
          <circle class="ring" cx="12" cy="12" r="9" />
          <path
            class="glyph"
            d="M7.2 12.2 10.4 15.4 16.8 8.6"
          />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="20" height="20">
          <circle class="ring" cx="12" cy="12" r="9" />
          <path class="glyph" d="M8.4 8.4 15.6 15.6M15.6 8.4 8.4 15.6" />
        </svg>
      {/if}
    </span>
    <span class="copy">
      {n.before}{#if action}<button type="button" class="link" onclick={(e) => onLink(e, action.focus)}
        >{action.text}</button
      >{/if}{#if n.after}{n.after}{/if}
    </span>
  </div>
{/if}

<style>
  .notice {
    position: fixed;
    top: 14px;
    left: 50%;
    z-index: 120;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    max-width: min(520px, calc(100vw - 2rem));
    padding: 0.38rem 0.9rem 0.38rem 0.55rem;
    border-radius: 999px;
    overflow: hidden;
    isolation: isolate;
    /* squircle 在矮条子上更像方的；通知用半圆胶囊。 */
    clip-path: inset(0 round 999px);
    font-size: 0.86rem;
    line-height: 1.45;
    cursor: pointer;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    transform: translateX(-50%);
  }
  .notice::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    pointer-events: none;
    backdrop-filter: blur(16px) saturate(1.2);
  }
  .notice.ok::before {
    background: rgba(22, 80, 44, 0.88);
    box-shadow: inset 0 0 0 1px rgba(52, 199, 89, 0.45);
  }
  .notice.fail::before {
    background: rgba(80, 22, 28, 0.9);
    box-shadow: inset 0 0 0 1px rgba(255, 59, 48, 0.45);
  }
  .dismiss {
    appearance: none;
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }
  .mark {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    display: grid;
    pointer-events: none;
  }
  .ring {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
  }
  .glyph {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .copy {
    position: relative;
    z-index: 1;
    pointer-events: none;
  }
  .notice.ok {
    color: #d8ffe6;
  }
  .notice.ok .mark {
    color: #34c759;
  }
  .notice.fail {
    color: #ffd6d6;
  }
  .notice.fail .mark {
    color: #ff3b30;
  }
  .notice.arrive {
    animation: arrive 0.58s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .notice.slip {
    animation: slip 0.42s cubic-bezier(0.7, 0, 1, 0.15) forwards;
  }
  .link {
    appearance: none;
    border: 0;
    padding: 0;
    background: none;
    color: #7ecbff;
    cursor: pointer;
    font: inherit;
    pointer-events: auto;
  }
  @keyframes arrive {
    from {
      transform: translateX(calc(-50% - 100vw));
    }
    to {
      transform: translateX(-50%);
    }
  }
  @keyframes slip {
    from {
      transform: translateX(-50%);
    }
    to {
      transform: translateX(calc(-50% + 100vw));
    }
  }
</style>
