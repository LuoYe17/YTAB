<script lang="ts">
  import type { Snippet } from 'svelte';
  import { placeFloatingTip } from '../lib/dropdownPlacement';

  let {
    label = '',
    wrap = false,
    children,
    tip,
  }: {
    label?: string;
    wrap?: boolean;
    children: Snippet;
    /** 比纯文案更富的内容（起始面板作者默认列表）。有则盖过 label。 */
    tip?: Snippet;
  } = $props();

  let show = $state(false);
  let timer = 0;
  let host = $state<HTMLElement | null>(null);
  let tipEl = $state<HTMLElement | null>(null);
  let pos = $state({ top: 0, left: 0, openUp: true });
  let caret = $state(0);

  function enter() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      show = true;
    }, 400); // 划过不闪；停住才出提示
  }

  function leave() {
    window.clearTimeout(timer);
    show = false;
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  $effect(() => {
    if (!show || !host || !tipEl) return;
    const place = () => {
      if (!host || !tipEl) return;
      const hostBox = host.getBoundingClientRect();
      const tipBox = tipEl.getBoundingClientRect();
      const next = placeFloatingTip(hostBox, tipBox, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      pos = next;
      const mid = hostBox.left + hostBox.width / 2;
      caret = Math.max(10, Math.min(tipBox.width - 10, mid - next.left));
    };
    place();
  });
</script>

<div bind:this={host} class="wrap" role="group" onpointerenter={enter} onpointerleave={leave}>
  {@render children()}
</div>
{#if show}
  <span
    bind:this={tipEl}
    use:portal
    class="tip"
    class:long={wrap}
    class:above={pos.openUp}
    class:below={!pos.openUp}
    role="tooltip"
    style:top="{pos.top}px"
    style:left="{pos.left}px"
    style:--caret="{caret}px"
  >
    {#if tip}
      {@render tip()}
    {:else}
      {label}
    {/if}
  </span>
{/if}

<style>
  .wrap {
    position: relative;
    display: inline-grid;
  }
  .tip {
    position: fixed;
    z-index: 80;
    padding: 0.45rem 0.55rem;
    border-radius: 10px;
    background: rgba(36, 36, 40, 0.78);
    backdrop-filter: blur(28px) saturate(1.4);
    color: #f5f5f7;
    font-size: 0.68rem;
    font-weight: 400;
    line-height: 1.45;
    white-space: nowrap;
    pointer-events: none;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.12),
      0 10px 28px rgba(0, 0, 0, 0.32);
    animation: tip-in 0.15s ease;
  }
  .long {
    white-space: normal;
    width: max-content;
    max-width: min(280px, 72vw);
    overflow-wrap: anywhere;
    text-align: left;
  }
  .tip::after {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    background: rgba(36, 36, 40, 0.78);
    backdrop-filter: blur(28px) saturate(1.4);
    transform: rotate(45deg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .tip.above::after {
    top: calc(100% - 5px);
    left: var(--caret, 50%);
    margin-left: -4px;
  }
  .tip.below::after {
    bottom: calc(100% - 5px);
    left: var(--caret, 50%);
    margin-left: -4px;
  }
  .above {
    animation-name: tip-in-up;
  }
  .below {
    animation-name: tip-in-down;
  }
  @keyframes tip-in-up {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes tip-in-down {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
