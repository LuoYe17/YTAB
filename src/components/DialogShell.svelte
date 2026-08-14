<script lang="ts">
  // 遮罩 / Esc / role=dialog 只写在这里；调用方只提供 sheet。
  import { fade } from 'svelte/transition';

  let {
    labelledBy,
    ariaLabel,
    zIndex,
    fadeMs = 180,
    backdropLabel = '关闭',
    onClose,
    onEscape,
    children,
  }: {
    labelledBy?: string;
    ariaLabel?: string;
    zIndex: number;
    fadeMs?: number;
    backdropLabel?: string;
    onClose: () => void;
    onEscape?: () => void;
    children: import('svelte').Snippet;
  } = $props();

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      (onEscape ?? onClose)();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby={labelledBy}
  aria-label={ariaLabel}
  style:z-index={zIndex}
  transition:fade|global={{ duration: fadeMs }}
>
  <button type="button" class="backdrop" aria-label={backdropLabel} onclick={onClose}></button>
  {@render children()}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .backdrop {
    appearance: none;
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.28);
    cursor: default;
  }
</style>
