<script lang="ts">
  import { scrollbarThumb, scrollTopFromThumb } from '../lib/scrollbar';

  let { children }: { children: import('svelte').Snippet } = $props();

  let port = $state<HTMLElement | null>(null);
  let track = $state<HTMLElement | null>(null);
  let thumb = $state<{ top: number; height: number } | null>(null);
  let dragging = $state(false);
  let dragStartY = 0;
  let dragStartTop = 0;

  function measure() {
    if (!port) {
      thumb = null;
      return;
    }
    const trackH = track?.clientHeight ?? port.clientHeight;
    thumb = scrollbarThumb(port.clientHeight, port.scrollHeight, port.scrollTop, trackH);
  }

  $effect(() => {
    const el = port;
    const tr = track;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);
    if (tr) ro.observe(tr);
    return () => ro.disconnect();
  });

  function onThumbDown(e: PointerEvent) {
    if (e.button !== 0 || !thumb) return;
    e.stopPropagation();
    dragging = true;
    dragStartY = e.clientY;
    dragStartTop = thumb.top;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onThumbMove(e: PointerEvent) {
    if (!dragging || !port || !thumb || !track) return;
    port.scrollTop = scrollTopFromThumb(
      dragStartTop + (e.clientY - dragStartY),
      thumb.height,
      track.clientHeight,
      port.clientHeight,
      port.scrollHeight,
    );
    measure();
  }

  function onThumbUp() {
    dragging = false;
  }

  function onTrackDown(e: PointerEvent) {
    if (e.button !== 0 || !port || !track || !thumb) return;
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - track.getBoundingClientRect().top - thumb.height / 2;
    port.scrollTop = scrollTopFromThumb(
      y,
      thumb.height,
      track.clientHeight,
      port.clientHeight,
      port.scrollHeight,
    );
    measure();
  }
</script>

<div class="wrap">
  <div class="port" bind:this={port} onscroll={measure}>
    <div class="inner">
      {@render children()}
    </div>
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="track"
    class:on={!!thumb}
    class:drag={dragging}
    bind:this={track}
    aria-hidden="true"
    onpointerdown={onTrackDown}
  >
    {#if thumb}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="thumb"
        style:top="{thumb.top}px"
        style:height="{thumb.height}px"
        onpointerdown={onThumbDown}
        onpointermove={onThumbMove}
        onpointerup={onThumbUp}
        onpointercancel={onThumbUp}
      ></div>
    {/if}
  </div>
</div>

<style>
  .wrap {
    position: relative;
    height: 100%;
    min-height: 0;
  }
  /* 滚轮 / 触控 / 键盘仍走原生 scrollport，只藏系统滑块。 */
  .port {
    height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .port::-webkit-scrollbar {
    display: none;
  }
  .inner {
    padding: 0.35rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .track {
    position: absolute;
    top: 0.35rem;
    bottom: 0.35rem;
    right: 0.15rem;
    width: 10px;
    pointer-events: none;
  }
  .track.on {
    pointer-events: auto;
  }
  .thumb {
    position: absolute;
    left: 3px;
    width: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.3);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .thumb:hover,
  .track.drag .thumb {
    background: rgba(255, 255, 255, 0.5);
  }
  .track.drag .thumb {
    cursor: grabbing;
  }
</style>
