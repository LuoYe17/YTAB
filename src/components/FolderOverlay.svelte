<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { AppItem, FolderItem, GridItem } from '../lib/types';
  import type { AppGridEvent } from '../lib/appGrid';
  import CtxMenu from './CtxMenu.svelte';
  import IconSortGrid from './IconSortGrid.svelte';

  let {
    folder,
    onClose,
    onOpenApp,
    onRename,
    onEvent,
    onEditApp,
    onDeleteApp,
  }: {
    folder: FolderItem;
    onClose: () => void;
    onOpenApp: (app: AppItem) => void;
    onRename: (name: string) => void;
    onEvent: (event: AppGridEvent) => void;
    onEditApp: (app: AppItem) => void;
    onDeleteApp: (app: AppItem) => void;
  } = $props();

  let editing = $state(false);
  /* svelte-ignore state_referenced_locally */
  let name = $state(folder.name);
  let panelEl = $state<HTMLElement | null>(null);
  /** 拖出空白停住后：隐藏壳，拖拽浮层继续跟手 */
  let shellDismissed = $state(false);
  let menu = $state<{ x: number; y: number; app: AppItem } | null>(null);

  function commitName() {
    editing = false;
    const n = name.trim() || '文件夹';
    name = n;
    onRename(n);
  }

  function onActivate(item: GridItem) {
    menu = null;
    if (item.kind === 'app') onOpenApp(item);
  }

  function onGridContextMenu(e: MouseEvent, item: GridItem | null) {
    e.preventDefault();
    if (item?.kind !== 'app') {
      menu = null;
      return;
    }
    menu = { x: e.clientX, y: e.clientY, app: item };
  }

  function onGridEvent(event: AppGridEvent) {
    if (event.type === 'cancelDrag') {
      shellDismissed = false;
      onEvent(event);
      return;
    }
    if (event.type === 'endDrag' || event.type === 'beginDrag') {
      onEvent(event);
      return;
    }
    if (event.type === 'reorderFolder' || event.type === 'eject') {
      onEvent(event);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="overlay"
  class:dismissed={shellDismissed}
  onclick={shellDismissed ? undefined : onClose}
  oncontextmenu={(e) => e.preventDefault()}
  role="presentation"
  transition:fade={{ duration: 180 }}
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="panel"
    bind:this={panelEl}
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    transition:scale={{ duration: 200, start: 0.96 }}
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
      hitRoot={panelEl}
      {onActivate}
      onEvent={onGridEvent}
      onOutsideDwell={() => (shellDismissed = true)}
      {onGridContextMenu}
    />
  </div>
</div>

{#if menu}
  {@const app = menu.app}
  <CtxMenu
    x={menu.x}
    y={menu.y}
    onClose={() => (menu = null)}
    items={[
      { label: '编辑', icon: 'edit', onPick: () => onEditApp(app) },
      { label: '删除', icon: 'delete', danger: true, onPick: () => onDeleteApp(app) },
    ]}
  />
{/if}

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
    background: rgba(40, 40, 42, 0.55);
    backdrop-filter: blur(22px) saturate(1.2);
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
