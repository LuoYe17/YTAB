<script lang="ts">
  import { tick } from 'svelte';

  export type SegOption = { value: string; label: string; collapsed?: boolean };

  let {
    labelledBy,
    value,
    options,
    fill = false,
    onChange,
  }: {
    labelledBy?: string;
    value: string;
    options: SegOption[];
    /** 吃掉标题右侧剩余宽度，六项这种挤在一行时用。 */
    fill?: boolean;
    onChange: (next: string) => void;
  } = $props();

  let track = $state<HTMLElement | null>(null);
  let pill = $state({ left: 0, width: 0 });
  let pillSlide = $state(false);
  let pillOn = $state(false);
  let sliding = $state(false);
  /** 滑到别的项后，起始按钮仍可能冒出 click，会把选择弹回去。 */
  let didSlide = $state(false);

  const PILL_MS = 280;
  let lastCollapseSig: string | null = null;
  let placed = false;
  let snapTimer = 0;

  const colTemplate = $derived(
    options.map((o) => (o.collapsed ? '0fr' : 'minmax(0, 1fr)')).join(' '),
  );

  function collapseSig(list: SegOption[]): string {
    return list.map((o) => (o.collapsed ? '1' : '0')).join('');
  }

  function selectedButton(): HTMLElement | null {
    if (!track) return null;
    const on = track.querySelector<HTMLElement>(
      `:scope > button[data-seg="${CSS.escape(value)}"]:not(.collapsed)`,
    );
    if (on) return on;
    return track.querySelector<HTMLElement>(':scope > button:not(.collapsed)');
  }

  /** 格子收完后选中项会停在哪。跟 grid 同一拍滑过去，避免去量还在 0 宽的钮。 */
  function predictedPill(
    list: SegOption[],
    selected: string,
  ): { left: number; width: number } | null {
    if (!track) return null;
    const visible = list.filter((o) => !o.collapsed);
    if (!visible.length) return null;
    let idx = visible.findIndex((o) => o.value === selected);
    if (idx < 0) idx = 0;
    const cs = getComputedStyle(track);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const inner = Math.max(0, track.clientWidth - padL - padR);
    const width = inner / visible.length;
    return { left: padL + idx * width, width };
  }

  function syncPillFromDom() {
    const btn = selectedButton();
    if (!btn || btn.offsetWidth < 2) return;
    pill = { left: btn.offsetLeft, width: btn.offsetWidth };
    pillOn = true;
  }

  $effect(() => {
    const opts = options;
    const selected = value;
    const sig = collapseSig(opts);
    let alive = true;
    void tick().then(() => {
      if (!alive) return;
      const collapseChanged = lastCollapseSig !== null && lastCollapseSig !== sig;
      lastCollapseSig = sig;
      if (collapseChanged) {
        pillSlide = true;
        const next = predictedPill(opts, selected);
        if (next) {
          pill = next;
          pillOn = true;
        }
        clearTimeout(snapTimer);
        snapTimer = window.setTimeout(() => {
          if (!alive) return;
          syncPillFromDom();
        }, PILL_MS);
        return;
      }
      syncPillFromDom();
      if (!placed) {
        requestAnimationFrame(() => {
          if (!alive) return;
          placed = true;
          pillSlide = true;
        });
        return;
      }
      pillSlide = true;
    });
    return () => {
      alive = false;
      clearTimeout(snapTimer);
    };
  });

  function optionAtX(clientX: number): string | undefined {
    if (!track) return;
    const buttons = [...track.querySelectorAll<HTMLElement>(':scope > button')].filter(
      (btn) => !btn.classList.contains('collapsed') && btn.offsetWidth > 2,
    );
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

  function onClick(next: string, collapsed: boolean) {
    if (collapsed || didSlide) return;
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
  style:--seg-cols={colTemplate}
>
  <div
    class="pill"
    class:on={pillOn}
    class:slide={pillSlide}
    style:left="{pill.left}px"
    style:width="{pill.width}px"
  ></div>
  {#each options as opt}
    <button
      type="button"
      data-seg={opt.value}
      role="radio"
      aria-checked={value === opt.value && !opt.collapsed}
      aria-hidden={opt.collapsed ? true : undefined}
      tabindex={opt.collapsed ? -1 : 0}
      class:on={value === opt.value && !opt.collapsed}
      class:collapsed={opt.collapsed}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onclick={() => onClick(opt.value, !!opt.collapsed)}
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
    overflow: hidden;
    opacity: 1;
    transition:
      color 0.16s ease,
      opacity 0.16s ease 0.12s;
  }
  .seg.drag button {
    cursor: grabbing;
  }
  button.on {
    color: #fff;
  }
  button.collapsed {
    opacity: 0;
    padding-left: 0;
    padding-right: 0;
    pointer-events: none;
    /* 收的时候字先淡，不要等格子收完。 */
    transition:
      color 0.16s ease,
      opacity 0.16s ease;
  }
  .fill {
    display: grid;
    grid-template-columns: var(--seg-cols);
    transition: grid-template-columns 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    width: auto;
    flex: 1;
    min-width: 0;
    flex-wrap: nowrap;
  }
  .fill button {
    min-width: 0;
    padding-left: 0.2rem;
    padding-right: 0.2rem;
    text-align: center;
    white-space: nowrap;
  }
  .fill button.collapsed {
    padding-left: 0;
    padding-right: 0;
  }
</style>
