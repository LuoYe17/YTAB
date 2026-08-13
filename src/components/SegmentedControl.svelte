<script lang="ts">
  import { tick } from 'svelte';

  let {
    labelledBy,
    value,
    options,
    fill = false,
    onChange,
  }: {
    labelledBy?: string;
    value: string;
    options: { value: string; label: string }[];
    /** 吃掉标题右侧剩余宽度，六项这种挤在一行时用。 */
    fill?: boolean;
    onChange: (next: string) => void;
  } = $props();

  let track = $state<HTMLElement | null>(null);
  let pill = $state({ left: 0, width: 0 });
  let pillSlide = $state(false);
  let sliding = $state(false);
  /** 滑到别的项后，起始按钮仍可能冒出 click，会把选择弹回去。 */
  let didSlide = $state(false);

  $effect(() => {
    void value;
    void options;
    const slide = pillSlide;
    void tick().then(() => {
      const btn = track?.querySelector<HTMLElement>(`[data-seg="${value}"]`);
      if (!btn) return;
      pill = { left: btn.offsetLeft, width: btn.offsetWidth };
      if (!slide) {
        requestAnimationFrame(() => {
          pillSlide = true;
        });
      }
    });
  });

  function optionAtX(clientX: number): string | undefined {
    if (!track) return;
    const buttons = [...track.querySelectorAll<HTMLElement>(':scope > button')];
    if (!buttons.length) return;
    for (const btn of buttons) {
      const r = btn.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return btn.dataset.seg;
    }
    if (clientX < buttons[0]!.getBoundingClientRect().left) return buttons[0]!.dataset.seg;
    return buttons[buttons.length - 1]!.dataset.seg;
  }

  function pickAt(clientX: number) {
    const next = optionAtX(clientX);
    if (!next || next === value) return;
    onChange(next);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    didSlide = false;
    sliding = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pickAt(e.clientX);
  }

  function onPointerMove(e: PointerEvent) {
    if (!sliding) return;
    const next = optionAtX(e.clientX);
    if (next && next !== value) didSlide = true;
    pickAt(e.clientX);
  }

  function onPointerUp() {
    sliding = false;
  }

  function onClick(next: string) {
    if (didSlide) return;
    if (next === value) return;
    onChange(next);
  }
</script>

<div
  class="seg"
  class:fill
  class:drag={sliding}
  bind:this={track}
  role="radiogroup"
  aria-labelledby={labelledBy}
>
  <div
    class="pill"
    class:on={pill.width > 0}
    class:slide={pillSlide}
    style:left="{pill.left}px"
    style:width="{pill.width}px"
  ></div>
  {#each options as opt}
    <button
      type="button"
      data-seg={opt.value}
      role="radio"
      aria-checked={value === opt.value}
      class:on={value === opt.value}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onclick={() => onClick(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    position: relative;
    display: flex;
    width: max-content;
    flex-shrink: 0;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.28);
    padding: 2px;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
  }
  .seg.drag {
    cursor: grabbing;
  }
  .pill {
    position: absolute;
    top: 2px;
    height: calc(100% - 4px);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.16);
    pointer-events: none;
    opacity: 0;
  }
  .pill.on {
    opacity: 1;
  }
  .pill.slide {
    transition:
      left 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
  button {
    appearance: none;
    position: relative;
    z-index: 1;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.62);
    border-radius: 6px;
    padding: 0.28rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: grab;
    touch-action: none;
    transition: color 0.16s ease;
  }
  .seg.drag button {
    cursor: grabbing;
  }
  button.on {
    color: #fff;
  }
  .fill {
    width: auto;
    flex: 1;
    min-width: 0;
    flex-wrap: nowrap;
  }
  .fill button {
    flex: 1 1 0;
    min-width: 0;
    padding-left: 0.2rem;
    padding-right: 0.2rem;
    text-align: center;
    white-space: nowrap;
  }
</style>
