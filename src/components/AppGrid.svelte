<script lang="ts">
  import type { AppItem, FolderItem, GridItem } from '../lib/types';
  import IconSortGrid from './IconSortGrid.svelte';

  let {
    items,
    pageIndex = 0,
    pageCount = 1,
    onOpenApp,
    onOpenFolder,
    onPageChange,
    onAdd,
    onMerge,
    onDropIntoFolder,
    onReorderPage,
    onPageFlip,
    onDragSessionStart,
    onDragSessionCancel,
  }: {
    items: GridItem[];
    pageIndex?: number;
    pageCount?: number;
    onOpenApp: (app: AppItem) => void;
    onOpenFolder: (folder: FolderItem) => void;
    onPageChange?: (index: number) => void;
    onAdd: () => void;
    onMerge: (fromId: string, ontoId: string) => void;
    onDropIntoFolder: (appId: string, folderId: string) => void;
    onReorderPage: (pageItems: GridItem[]) => void;
    onPageFlip: (toPage: number, fromPageWithoutItem: GridItem[], item: GridItem) => void;
    onDragSessionStart: () => void;
    onDragSessionCancel: () => void;
  } = $props();

  let menu = $state<{ x: number; y: number } | null>(null);

  function onActivate(item: GridItem) {
    menu = null;
    if (item.kind === 'app') onOpenApp(item);
    else onOpenFolder(item);
  }

  function onGridContextMenu(e: MouseEvent) {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY };
  }

  function closeMenu() {
    menu = null;
  }

  function addFromMenu() {
    menu = null;
    onAdd();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="grid-wrap" role="presentation" onclick={closeMenu}>
  <IconSortGrid
    {items}
    {pageIndex}
    {pageCount}
    enableMerge={true}
    {onActivate}
    onReorder={onReorderPage}
    {onMerge}
    {onDropIntoFolder}
    {onPageFlip}
    {onDragSessionStart}
    {onDragSessionCancel}
    {onGridContextMenu}
  />

  {#if pageCount > 1 && onPageChange}
    <div class="dots" role="tablist" aria-label="App 页">
      {#each Array.from({ length: pageCount }, (_, i) => i) as i}
        <button
          type="button"
          class="dot"
          class:active={i === pageIndex}
          aria-label={`第 ${i + 1} 页`}
          onclick={() => onPageChange(i)}
        ></button>
      {/each}
    </div>
  {/if}
</div>

{#if menu}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="menu-backdrop" onclick={closeMenu} role="presentation"></div>
  <div class="ctx-menu" style:left={`${menu.x}px`} style:top={`${menu.y}px`} role="menu">
    <button type="button" role="menuitem" onclick={addFromMenu}>添加 App</button>
  </div>
{/if}

<style>
  .grid-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: min(880px, 94vw);
  }
  .dots {
    display: flex;
    gap: 0.45rem;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 0;
    padding: 0;
    background: rgba(255, 255, 255, 0.35);
    cursor: pointer;
  }
  .dot.active {
    background: #fff;
  }
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
  }
  .ctx-menu {
    position: fixed;
    z-index: 61;
    min-width: 132px;
    padding: 0.3rem;
    border-radius: 10px;
    background: rgba(40, 40, 42, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  }
  .ctx-menu button {
    appearance: none;
    width: 100%;
    border: 0;
    background: transparent;
    color: #f5f5f7;
    text-align: left;
    padding: 0.45rem 0.65rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .ctx-menu button:hover {
    background: #0a84ff;
  }
</style>
