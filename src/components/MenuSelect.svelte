<script lang="ts">
  import { tick } from 'svelte';
  import { dropdownOpensUp } from '../lib/dropdownPlacement';

  let {
    value,
    options,
    onChange,
    labelledBy,
  }: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    labelledBy?: string;
  } = $props();

  let open = $state(false);
  let up = $state(false);
  let btnEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let menuStyle = $state('');

  const current = $derived(options.find((o) => o.value === value)?.label ?? '');

  function place() {
    if (!btnEl) return;
    const r = btnEl.getBoundingClientRect();
    const menuH = menuEl?.offsetHeight ?? options.length * 36 + 8;
    up = dropdownOpensUp(r, menuH, window.innerHeight);
    const width = Math.max(r.width, 160);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    if (up) {
      menuStyle = `left:${left}px;bottom:${window.innerHeight - r.top + 6}px;width:${width}px;`;
    } else {
      menuStyle = `left:${left}px;top:${r.bottom + 6}px;width:${width}px;`;
    }
  }

  function toggle() {
    open = !open;
    if (open) {
      void tickPlace();
    }
  }

  async function tickPlace() {
    await tick();
    place();
  }

  function pick(v: string) {
    onChange(v);
    open = false;
    btnEl?.focus();
  }

  function optionButtons(): HTMLButtonElement[] {
    return [...(menuEl?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
  }

  function focusOption(i: number) {
    const opts = optionButtons();
    if (!opts.length) return;
    opts[Math.max(0, Math.min(i, opts.length - 1))]?.focus();
  }

  function onDoc(e: PointerEvent) {
    const t = e.target as Node | null;
    if (btnEl?.contains(t) || menuEl?.contains(t)) return;
    open = false;
  }

  $effect(() => {
    if (!open) return;
    void menuEl;
    void tick().then(() => {
      place();
      const opts = optionButtons();
      const i = opts.findIndex((o) => o.getAttribute('aria-selected') === 'true');
      (i >= 0 ? opts[i] : opts[0])?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        open = false;
        btnEl?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const opts = optionButtons();
      if (!opts.length) return;
      e.preventDefault();
      if (e.key === 'Home') {
        focusOption(0);
        return;
      }
      if (e.key === 'End') {
        focusOption(opts.length - 1);
        return;
      }
      const i = opts.indexOf(document.activeElement as HTMLButtonElement);
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = i < 0 ? (dir > 0 ? 0 : opts.length - 1) : (i + dir + opts.length) % opts.length;
      focusOption(next);
    };
    const onWin = () => place();
    document.addEventListener('pointerdown', onDoc, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onWin);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onWin);
    };
  });

  /** 设置 sheet 有 backdrop-filter，fixed 子孙会被裁切，菜单必须挂到 body。 */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }
</script>

<button
  bind:this={btnEl}
  type="button"
  class="trigger"
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-labelledby={labelledBy}
  onclick={toggle}
>
  <span>{current}</span>
  <span class="chev" class:up={open && up} aria-hidden="true"></span>
</button>

  {#if open}
  <div use:portal class="menu" class:up={up} bind:this={menuEl} style={menuStyle} role="listbox">
    {#each options as opt}
      <button
        type="button"
        class="opt"
        class:on={opt.value === value}
        role="option"
        aria-selected={opt.value === value}
        onclick={() => pick(opt.value)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .trigger {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    min-width: 7.5rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.28);
    color: inherit;
    border-radius: 8px;
    padding: 0.42rem 0.65rem;
    font: inherit;
    font-size: 0.86rem;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    border-color: rgba(255, 255, 255, 0.28);
    background: rgba(0, 0, 0, 0.38);
  }
  .chev {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid rgba(255, 255, 255, 0.55);
    transition: transform 0.18s ease;
  }
  .chev.up {
    transform: rotate(180deg);
  }
  .menu {
    position: fixed;
    z-index: 80;
    padding: 0.28rem;
    border-radius: 10px;
    background: rgba(28, 28, 32, 0.92);
    backdrop-filter: blur(20px) saturate(1.2);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    animation: menu-in 0.16s ease;
  }
  .opt {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    border-radius: 7px;
    padding: 0.42rem 0.6rem;
    font: inherit;
    font-size: 0.86rem;
    cursor: pointer;
    transition: background 0.12s ease;
  }
  .opt:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .opt.on {
    background: rgba(255, 255, 255, 0.16);
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .menu.up {
    animation-name: menu-in-up;
  }
  @keyframes menu-in-up {
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
