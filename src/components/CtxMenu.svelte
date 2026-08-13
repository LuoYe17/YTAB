<script lang="ts">
  import { tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  export type CtxMenuIcon = 'add' | 'edit' | 'delete';

  let {
    x,
    y,
    items,
    onClose,
  }: {
    x: number;
    y: number;
    items: { label: string; icon?: CtxMenuIcon; danger?: boolean; onPick: () => void }[];
    onClose: () => void;
  } = $props();

  let menuEl = $state<HTMLDivElement | null>(null);
  /* svelte-ignore state_referenced_locally */
  let left = $state(x);
  /* svelte-ignore state_referenced_locally */
  let top = $state(y);

  $effect(() => {
    left = x;
    top = y;
    void menuEl;
    void tick().then(() => {
      if (!menuEl) return;
      const r = menuEl.getBoundingClientRect();
      left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
      top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
      menuEl.querySelector('button')?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const btns = [...(menuEl?.querySelectorAll('button') ?? [])];
      if (!btns.length) return;
      e.preventDefault();
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = (Math.max(i, 0) + dir + btns.length) % btns.length;
      btns[next]?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="menu-backdrop"
  onclick={onClose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onClose();
  }}
  role="presentation"
  transition:fade={{ duration: 100 }}
></div>
<div
  bind:this={menuEl}
  class="ctx-menu ios-menu"
  style:left="{left}px"
  style:top="{top}px"
  role="menu"
  tabindex="-1"
  in:scale={{ duration: 160, start: 0.92, easing: cubicOut }}
>
  {#each items as item, i}
    {#if item.danger && i > 0}
      <div class="sep" role="separator"></div>
    {/if}
    <button
      type="button"
      role="menuitem"
      class:danger={item.danger}
      onclick={() => {
        onClose();
        item.onPick();
      }}
    >
      <span class="ico" aria-hidden="true">
        {#if item.icon === 'add'}
          <svg viewBox="0 0 16 16" width="15" height="15">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              d="M8 3v10M3 8h10"
            />
          </svg>
        {:else if item.icon === 'edit'}
          <svg viewBox="0 0 16 16" width="15" height="15">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9.2 3.6 12.4 6.8 6 13.2H2.8V10Z"
            />
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              d="m8.1 4.7 3.2 3.2"
            />
          </svg>
        {:else if item.icon === 'delete'}
          <svg viewBox="0 0 16 16" width="15" height="15">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3.2 4.4h9.6M6 4.4V3.2h4v1.2M5.2 6.2l.4 6.2h4.8l.4-6.2"
            />
          </svg>
        {/if}
      </span>
      {item.label}
    </button>
  {/each}
</div>

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
  }
  .ctx-menu {
    position: fixed;
    z-index: 61;
    width: max-content;
    min-width: 7.25rem;
    max-width: 10rem;
    padding: 0.22rem;
    background: rgba(36, 36, 40, 0.78);
    backdrop-filter: blur(28px) saturate(1.4);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
    display: flex;
    flex-direction: column;
    transform-origin: 0 0;
    outline: none;
  }
  .sep {
    height: 1px;
    margin: 0.18rem 0.35rem;
    background: rgba(255, 255, 255, 0.12);
  }
  .ctx-menu button {
    appearance: none;
    width: 100%;
    border: 0;
    background: transparent;
    color: #f5f5f7;
    text-align: left;
    padding: 0.38rem 0.5rem;
    border-radius: 8px;
    font: inherit;
    font-size: 0.82rem;
    line-height: 1.2;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.42rem;
    transition: background 0.12s ease;
  }
  .ico {
    display: grid;
    place-items: center;
    width: 15px;
    height: 15px;
    flex: none;
    opacity: 0.9;
  }
  .ctx-menu button:hover,
  .ctx-menu button:focus-visible {
    background: rgba(255, 255, 255, 0.14);
    outline: none;
  }
  .ctx-menu button.danger {
    color: #ff8a80;
  }
  .ctx-menu button.danger:hover,
  .ctx-menu button.danger:focus-visible {
    background: rgba(255, 59, 48, 0.18);
  }
</style>
