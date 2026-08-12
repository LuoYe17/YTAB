<script lang="ts">
  import type { AppItem, FolderItem, GridItem } from '../lib/types';
  import IconSortGrid from './IconSortGrid.svelte';

  let {
    folder,
    onClose,
    onOpenApp,
    onRename,
    onReorderChildren,
    onEjectAt,
  }: {
    folder: FolderItem;
    onClose: () => void;
    onOpenApp: (app: AppItem) => void;
    onRename: (name: string) => void;
    onReorderChildren: (folderId: string, children: AppItem[]) => void;
    /** 拖出关窗后松手：按坐标落到主网格 */
    onEjectAt: (folderId: string, appId: string, clientX: number, clientY: number) => void;
  } = $props();

  let editing = $state(false);
  /* svelte-ignore state_referenced_locally */
  let name = $state(folder.name);
  let panelEl = $state<HTMLElement | null>(null);
  /** 拖出空白停住后：隐藏壳，拖拽浮层继续跟手 */
  let shellDismissed = $state(false);

  function commitName() {
    editing = false;
    const n = name.trim() || '文件夹';
    name = n;
    onRename(n);
  }

  function onActivate(item: GridItem) {
    if (item.kind === 'app') onOpenApp(item);
  }

  function onReorder(next: GridItem[]) {
    const children = next.filter((i): i is AppItem => i.kind === 'app');
    onReorderChildren(folder.id, children);
  }

  function onOutsideDwell() {
    shellDismissed = true;
  }

  function onOutsideDrop(appId: string, clientX: number, clientY: number) {
    onEjectAt(folder.id, appId, clientX, clientY);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="overlay"
  class:dismissed={shellDismissed}
  onclick={shellDismissed ? undefined : onClose}
  role="presentation"
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="panel"
    bind:this={panelEl}
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    {#if editing}
      <input
        class="title-input"
        bind:value={name}
        onblur={commitName}
        onkeydown={(e) => e.key === 'Enter' && commitName()}
      />
    {:else}
      <button type="button" class="title" onclick={() => (editing = true)}>{folder.name}</button>
    {/if}
    <IconSortGrid
      items={folder.children}
      enableMerge={false}
      compact={true}
      outsideRoot={panelEl}
      {onActivate}
      {onReorder}
      {onOutsideDwell}
      {onOutsideDrop}
    />
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 35;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(10px);
  }
  /* 壳关掉：遮罩/面板隐去，事件穿透；跟手浮层保持可见 */
  .overlay.dismissed {
    pointer-events: none;
    background: transparent;
    backdrop-filter: none;
  }
  .overlay.dismissed .panel {
    visibility: hidden;
  }
  .overlay.dismissed :global([data-dnd-overlay]) {
    visibility: visible !important;
  }
  .panel {
    width: min(480px, 92vw);
    max-height: 70vh;
    overflow: auto;
    background: rgba(40, 40, 42, 0.88);
    border-radius: 18px;
    padding: 1.1rem 1rem 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .title,
  .title-input {
    display: block;
    width: 100%;
    text-align: center;
    margin-bottom: 1rem;
    color: #fff;
    background: transparent;
    border: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }
  .title {
    cursor: text;
  }
  .title-input {
    outline: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.25);
    padding-bottom: 0.25rem;
  }
</style>
