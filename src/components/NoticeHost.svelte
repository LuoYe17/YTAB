<script lang="ts">
  import { onMount } from 'svelte';
  import { dismissNotice, subscribeNotice, type Notice } from '../lib/notice';
  import type { WallpaperFailFocus } from '../lib/wallpaperFail';

  let { onAction }: { onAction: (focus: WallpaperFailFocus) => void } = $props();

  let shown = $state<Notice | null>(null);
  let phase = $state<'in' | 'out'>('in');
  let hold = 0;
  let pending: Notice | null = null;

  function clearHold() {
    window.clearTimeout(hold);
  }

  function armHold(id: number) {
    clearHold();
    hold = window.setTimeout(() => {
      if (shown?.id === id) dismissNotice(id);
    }, 2000);
  }

  function play(next: Notice | null) {
    // 新的来了先右溜旧的再砸新的；空则只出场。
    if (!next) {
      if (!shown) return;
      phase = 'out';
      return;
    }
    if (shown && shown.id !== next.id) {
      pending = next;
      phase = 'out';
      return;
    }
    shown = next;
    phase = 'in';
    armHold(next.id);
  }

  function onAnimEnd(e: AnimationEvent) {
    // drop 被换成 slip 时也会冒泡 animationend，只认右溜结束才卸。
    if (phase !== 'out' || e.animationName !== 'slip') return;
    shown = null;
    if (pending) {
      const n = pending;
      pending = null;
      shown = n;
      phase = 'in';
      armHold(n.id);
    }
  }

  function onCardClick() {
    if (shown) dismissNotice(shown.id);
  }

  function onLink(e: MouseEvent, focus: WallpaperFailFocus) {
    e.stopPropagation();
    if (shown) dismissNotice(shown.id);
    onAction(focus);
  }

  onMount(() => {
    const unsub = subscribeNotice((n) => play(n));
    return () => {
      unsub();
      clearHold();
    };
  });
</script>

{#if shown}
  {@const n = shown}
  {@const action = n.action}
  <div
    class="notice"
    class:ok={n.tone === 'ok'}
    class:fail={n.tone === 'fail'}
    class:drop={phase === 'in'}
    class:slip={phase === 'out'}
    onanimationend={(e) => onAnimEnd(e)}
  >
    <button type="button" class="dismiss" aria-label="关闭通知" onclick={onCardClick}></button>
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
    max-width: min(520px, calc(100vw - 2rem));
    padding: 0.55rem 0.9rem;
    border-radius: 12px;
    font-size: 0.86rem;
    line-height: 1.45;
    cursor: pointer;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(16px) saturate(1.2);
    transform: translateX(-50%);
  }
  .dismiss {
    appearance: none;
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }
  .copy {
    position: relative;
    pointer-events: none;
  }
  .notice.ok {
    background: rgba(22, 80, 44, 0.88);
    color: #d8ffe6;
    border: 1px solid rgba(52, 199, 89, 0.45);
  }
  .notice.fail {
    background: rgba(80, 22, 28, 0.9);
    color: #ffd6d6;
    border: 1px solid rgba(255, 59, 48, 0.45);
  }
  .notice.drop {
    animation: drop 0.62s cubic-bezier(0.22, 1.45, 0.36, 1) both;
  }
  .notice.slip {
    animation: slip 0.38s ease-in forwards;
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
  @keyframes drop {
    0% {
      transform: translate(-50%, -160%);
    }
    58% {
      transform: translate(-50%, 14px);
    }
    76% {
      transform: translate(-50%, -7px);
    }
    100% {
      transform: translate(-50%, 0);
    }
  }
  @keyframes slip {
    from {
      transform: translate(-50%, 0);
      opacity: 1;
    }
    to {
      transform: translate(110vw, 0);
      opacity: 0.35;
    }
  }
</style>
