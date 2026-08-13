<script lang="ts">
  import { placeFloatingTip } from '../lib/dropdownPlacement';

  let {
    label,
    wrap = false,
    children,
  }: {
    label: string;
    wrap?: boolean;
    children: import('svelte').Snippet;
  } = $props();

  let show = $state(false);
  let timer = 0;
  let host = $state<HTMLElement | null>(null);
  let tipEl = $state<HTMLElement | null>(null);
  let pos = $state({ top: 0, left: 0 });

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
      pos = placeFloatingTip(host.getBoundingClientRect(), tipEl.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      });
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
    role="tooltip"
    style:top="{pos.top}px"
    style:left="{pos.left}px">{label}</span
  >
{/if}

<style>
  .wrap {
    position: relative;
    display: inline-grid;
  }
  .tip {
    position: fixed;
    z-index: 80;
    padding: 0.28rem 0.5rem;
    border-radius: 6px;
    background: rgba(20, 20, 24, 0.88);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.92);
    font-size: 0.75rem;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
    animation: tip-in 0.16s ease;
  }
  .long {
    white-space: normal;
    width: max-content;
    max-width: 16rem;
  }
  @keyframes tip-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
