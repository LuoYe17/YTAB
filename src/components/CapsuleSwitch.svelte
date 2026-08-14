<script lang="ts">
  import OkTick from './OkTick.svelte';

  let {
    on = false,
    label,
    disabled = false,
    tile = false,
    onChange,
  }: {
    on: boolean;
    label: string;
    disabled?: boolean;
    /** 铺满格子的方块（纯度 / 分类 / 标签）；默认胶囊。 */
    tile?: boolean;
    onChange: (next: boolean) => void;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  let prevOn = $state(on);
  let celebrate = $state(false);
  let celeTimer = 0;

  $effect(() => {
    if (on && !prevOn) {
      celebrate = true;
      window.clearTimeout(celeTimer);
      celeTimer = window.setTimeout(() => {
        celebrate = false;
      }, 600);
    }
    prevOn = on;
  });

  function onClick() {
    if (disabled || celebrate) return;
    onChange(!on);
  }
</script>

<button
  type="button"
  class="cap"
  class:on
  class:dim={disabled}
  class:tile
  role="switch"
  aria-checked={on}
  aria-disabled={disabled}
  disabled={disabled}
  onclick={onClick}
>
  <span class="label">{label}</span>
  {#if celebrate}
    <span class="mask" aria-hidden="true"></span>
    <span class="burst" aria-hidden="true">
      <OkTick size={28} />
    </span>
  {/if}
</button>

<style>
  .cap {
    appearance: none;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.72);
    border-radius: 999px;
    padding: 0.32rem 0.75rem;
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    overflow: visible;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;
  }
  .cap:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }
  .cap.on {
    background: rgba(126, 203, 255, 0.28);
    border-color: rgba(126, 203, 255, 0.55);
    color: #fff;
  }
  .tile {
    width: 100%;
    border-radius: 8px;
    padding: 0.48rem 0.4rem;
    font-weight: 600;
    background: transparent;
    border-color: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.36);
  }
  .tile:hover:not(:disabled):not(.on) {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.55);
  }
  .tile.on,
  .tile.on:hover:not(:disabled) {
    background: #fff;
    border-color: #fff;
    color: #111;
  }
  .cap.dim {
    opacity: 0.42;
    cursor: not-allowed;
  }
  .label {
    position: relative;
    z-index: 1;
  }
  .mask {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(0, 0, 0, 0.45);
    z-index: 2;
  }
  .burst {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 3;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    pointer-events: none;
  }
</style>
