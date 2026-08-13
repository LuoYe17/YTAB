<script lang="ts">
  let {
    label,
    placement = 'ne',
    wrap = false,
    children,
  }: {
    label: string;
    /** ne / nw 在锚点上方，se 在下方（设置里问号说明朝下，免得被顶栏裁切）。 */
    placement?: 'ne' | 'nw' | 'se';
    wrap?: boolean;
    children: import('svelte').Snippet;
  } = $props();

  let show = $state(false);
  let timer = 0;

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
</script>

<div class="wrap" role="group" onpointerenter={enter} onpointerleave={leave}>
  {@render children()}
  {#if show}
    <span class="tip {placement}" class:long={wrap} role="tooltip">{label}</span>
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    display: inline-grid;
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 8px);
    z-index: 8;
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
  .ne {
    left: 50%;
  }
  .nw {
    right: 50%;
  }
  .se {
    top: calc(100% + 8px);
    bottom: auto;
    left: 50%;
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
