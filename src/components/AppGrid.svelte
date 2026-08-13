<script lang="ts">
  import type { AppItem, FolderItem, GridItem } from '../lib/types';
  import type { IconSortDragOutcome } from '../lib/iconSortDrag';
  import CtxMenu from './CtxMenu.svelte';
  import IconSortGrid from './IconSortGrid.svelte';

  /** 起始页对 App 网格拖拽结果的接线（由 IconSortDragOutcome 适配而来） */
  export type AppGridDnd = {
    onMerge: (fromId: string, ontoId: string, folderId: string) => void;
    onDropIntoFolder: (appId: string, folderId: string) => void;
    onReorderPage: (pageItems: GridItem[]) => void;
    onPageFlip: (toPage: number, fromPageWithoutItem: GridItem[], item: GridItem) => void;
    onDragSessionStart: () => void;
    onDragSessionCancel: () => void;
  };

  let {
    items,
    pageIndex = 0,
    pageCount = 1,
    onOpenApp,
    onOpenFolder,
    onPageChange,
    onAdd,
    onEditApp,
    onDeleteApp,
    onDeleteFolder,
    dnd,
    hitRoot = null,
  }: {
    items: GridItem[];
    pageIndex?: number;
    pageCount?: number;
    onOpenApp: (app: AppItem) => void;
    onOpenFolder: (folder: FolderItem) => void;
    onPageChange?: (index: number) => void;
    onAdd: () => void;
    onEditApp: (app: AppItem) => void;
    onDeleteApp: (app: AppItem) => void;
    onDeleteFolder: (folder: FolderItem) => void;
    dnd: AppGridDnd;
    /** 落点带；起始页传 main，这样时钟/搜索上方也能插到首位 */
    hitRoot?: HTMLElement | null;
  } = $props();

  let menu = $state<{ x: number; y: number; target: GridItem | null } | null>(null);
  let slotEl = $state<HTMLElement | null>(null);

  const menuItems = $derived.by(() => {
    if (!menu) return [];
    const target = menu.target;
    if (!target) {
      return [{ label: '添加 App', icon: 'add' as const, onPick: () => onAdd() }];
    }
    if (target.kind === 'app') {
      return [
        { label: '编辑', icon: 'edit' as const, onPick: () => onEditApp(target) },
        { label: '删除', icon: 'delete' as const, danger: true, onPick: () => onDeleteApp(target) },
      ];
    }
    return [
      { label: '删除', icon: 'delete' as const, danger: true, onPick: () => onDeleteFolder(target) },
    ];
  });

  function onActivate(item: GridItem) {
    menu = null;
    if (item.kind === 'app') onOpenApp(item);
    else onOpenFolder(item);
  }

  function onDragOutcome(outcome: IconSortDragOutcome) {
    switch (outcome.type) {
      case 'sessionStart':
        dnd.onDragSessionStart();
        break;
      case 'sessionCancel':
        dnd.onDragSessionCancel();
        break;
      case 'reorder':
        dnd.onReorderPage(outcome.items);
        break;
      case 'merge':
        dnd.onMerge(outcome.fromId, outcome.ontoId, outcome.folderId);
        break;
      case 'intoFolder':
        dnd.onDropIntoFolder(outcome.appId, outcome.folderId);
        break;
      case 'pageFlip':
        dnd.onPageFlip(outcome.toPage, outcome.fromPageWithoutItem, outcome.item);
        break;
      default:
        // 主网格不处理文件夹拖出（outsideDwell / outsideDrop）。
        break;
    }
  }

  function onGridContextMenu(e: MouseEvent, item: GridItem | null) {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, target: item };
  }

  function closeMenu() {
    menu = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="hit-root" bind:this={slotEl} role="presentation" onclick={closeMenu}>
  <div class="grid-wrap" role="presentation">
  <IconSortGrid
    {items}
    {pageIndex}
    {pageCount}
    enableMerge={true}
    {onActivate}
    {onDragOutcome}
    {onGridContextMenu}
    hitRoot={hitRoot ?? slotEl}
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
</div>

{#if menu}
  <CtxMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />
{/if}

<style>
  .hit-root {
    width: 100%;
    flex: 1;
    min-height: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
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
</style>
