<script lang="ts">
  import { flip } from 'svelte/animate';
  import { DragDropProvider, DragOverlay } from '@dnd-kit/svelte';
  import type { GridItem } from '../lib/types';
  import { displayAppIcon } from '../lib/appIcons';
  import type { IconSortDragOutcome } from '../lib/iconSortDrag';
  import {
    cellHit,
    hitEdgeRelative,
    insertIndexForDropBand,
    insertIndexFromHit,
    normalizedInRect,
    readGridMetrics,
  } from '../lib/gridInsertGeometry';
  import GridTile from './GridTile.svelte';

  let {
    items,
    enableMerge = true,
    compact = false,
    pageIndex = 0,
    pageCount = 1,
    onActivate,
    onDragOutcome,
    onGridContextMenu,
    outsideRoot = null,
    hitRoot = null,
  }: {
    items: GridItem[];
    /** false = 仅换位（文件夹内部） */
    enableMerge?: boolean;
    compact?: boolean;
    pageIndex?: number;
    pageCount?: number;
    onActivate: (item: GridItem) => void;
    onDragOutcome: (outcome: IconSortDragOutcome) => void;
    onGridContextMenu?: (e: MouseEvent) => void;
    /** 指针拖出此元素外并停住 → 仅视觉关窗，拖拽继续跟手 */
    outsideRoot?: HTMLElement | null;
    /** 比网格更宽的落点带；起始页为 grid-slot，文件夹为面板 */
    hitRoot?: HTMLElement | null;
  } = $props();

  const flipMs = 220;
  const MERGE_DWELL_MS = 400;
  const INSERT_DWELL_MS = 220;
  const OUTSIDE_DWELL_MS = 320;
  const PAGE_EDGE_PX = 44;
  const PAGE_FLIP_DWELL_MS = 400;
  const PAGE_FLIP_COOLDOWN_MS = 650;

  let localItems = $state<GridItem[]>([]);
  let activeId = $state<string | null>(null);
  let dwellTargetId = $state<string | null>(null);
  let mergeReady = $state(false);
  let pointer = $state({ x: 0, y: 0 });
  let suppressClick = $state(false);
  let orderDirty = $state(false);
  let edgeSide = $state<'left' | 'right' | null>(null);
  let didFlip = $state(false);
  /** 已触发「拖出关窗」，拖拽会话仍继续 */
  let outsideLocked = false;

  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let insertTimer: ReturnType<typeof setTimeout> | null = null;
  let edgeTimer: ReturnType<typeof setTimeout> | null = null;
  let outsideTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingInsert: { sourceId: string; targetId: string; insertAt: number } | null = null;
  let pendingEdge: 'left' | 'right' | null = null;
  let lastInsertKey = '';
  let orderAtDragStart: string[] = [];
  let flipCooldownUntil = 0;
  let gridEl = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!activeId) {
      localItems = items.map((i) => i);
      return;
    }
    // 拖拽中仅在跨页后（集合变了且仍含 active）才同步 props
    const propIds = new Set(items.map((i) => i.id));
    const localIds = new Set(localItems.map((i) => i.id));
    const sameSet = propIds.size === localIds.size && [...propIds].every((id) => localIds.has(id));
    if (!sameSet && propIds.has(activeId)) {
      localItems = items.map((i) => i);
      lastInsertKey = '';
      orderDirty = false;
      orderAtDragStart = localItems.map((i) => i.id);
    }
  });

  function clearDwell() {
    if (dwellTimer) clearTimeout(dwellTimer);
    dwellTimer = null;
    dwellTargetId = null;
    mergeReady = false;
  }

  function clearInsertPending() {
    if (insertTimer) clearTimeout(insertTimer);
    insertTimer = null;
    pendingInsert = null;
  }

  function clearEdgePending() {
    if (edgeTimer) clearTimeout(edgeTimer);
    edgeTimer = null;
    pendingEdge = null;
    edgeSide = null;
  }

  function clearOutsidePending() {
    if (outsideTimer) clearTimeout(outsideTimer);
    outsideTimer = null;
  }

  function activeItem(): GridItem | null {
    return localItems.find((i) => i.id === activeId) ?? null;
  }

  function canMerge(source: GridItem, target: GridItem): boolean {
    if (!enableMerge) return false;
    if (source.id === target.id) return false;
    if (source.kind !== 'app') return false;
    return target.kind === 'app' || target.kind === 'folder';
  }

  function startDwell(sourceId: string, targetId: string) {
    const source = localItems.find((i) => i.id === sourceId);
    const target = localItems.find((i) => i.id === targetId);
    if (!source || !target || !canMerge(source, target)) {
      clearDwell();
      return;
    }
    if (dwellTargetId === targetId && (dwellTimer || mergeReady)) return;
    if (dwellTimer) clearTimeout(dwellTimer);
    dwellTargetId = targetId;
    mergeReady = false;
    dwellTimer = setTimeout(() => {
      mergeReady = true;
    }, MERGE_DWELL_MS);
  }

  function insertBeforeIndex(sourceId: string, insertAt: number): boolean {
    const from = localItems.findIndex((i) => i.id === sourceId);
    if (from < 0) return false;
    let to = insertAt;
    if (from < to) to -= 1;
    to = Math.max(0, Math.min(to, localItems.length - 1));
    if (from === to) return false;
    const next = [...localItems];
    const [moved] = next.splice(from, 1);
    if (!moved) return false;
    next.splice(to, 0, moved);
    localItems = next;
    orderDirty = true;
    return true;
  }

  function scheduleInsert(sourceId: string, targetKey: string, insertAt: number) {
    const key = `${sourceId}:${targetKey}:${insertAt}`;
    if (key === lastInsertKey) {
      clearInsertPending();
      return;
    }
    if (
      pendingInsert &&
      pendingInsert.sourceId === sourceId &&
      pendingInsert.targetId === targetKey &&
      pendingInsert.insertAt === insertAt &&
      insertTimer
    ) {
      return;
    }
    clearInsertPending();
    pendingInsert = { sourceId, targetId: targetKey, insertAt };
    insertTimer = setTimeout(() => {
      const job = pendingInsert;
      insertTimer = null;
      pendingInsert = null;
      if (!job || job.sourceId !== activeId) return;
      if (insertBeforeIndex(job.sourceId, job.insertAt)) {
        lastInsertKey = `${job.sourceId}:${job.targetId}:${job.insertAt}`;
      }
    }, INSERT_DWELL_MS);
  }

  function coordsOf(event: {
    operation?: { position?: { x?: number; y?: number; current?: { x?: number; y?: number } } };
  }): { x: number; y: number } {
    const p = event.operation?.position;
    const cur = p && 'current' in p && p.current ? p.current : p;
    if (cur && typeof cur.x === 'number' && typeof cur.y === 'number') {
      return { x: cur.x, y: cur.y };
    }
    return pointer;
  }

  function onPointerTrack(e: PointerEvent) {
    pointer = { x: e.clientX, y: e.clientY };
  }

  function doPageFlip(side: 'left' | 'right') {
    if (!activeId || pageCount <= 1) return;
    const item = activeItem();
    if (!item) return;
    const toPage = pageIndex + (side === 'left' ? -1 : 1);
    if (toPage < 0 || toPage >= pageCount) return;
    const fromWithout = localItems.filter((i) => i.id !== activeId);
    clearEdgePending();
    clearDwell();
    clearInsertPending();
    flipCooldownUntil = Date.now() + PAGE_FLIP_COOLDOWN_MS;
    didFlip = true;
    onDragOutcome({
      type: 'pageFlip',
      toPage,
      fromPageWithoutItem: fromWithout,
      item,
    });
  }

  /** @returns true 若指针在翻页热区（并处理计时） */
  function tryPageEdge(): boolean {
    if (!activeId || pageCount <= 1) {
      clearEdgePending();
      return false;
    }
    if (Date.now() < flipCooldownUntil) {
      clearEdgePending();
      return false;
    }
    const x = pointer.x;
    const w = window.innerWidth;
    let side: 'left' | 'right' | null = null;
    if (x <= PAGE_EDGE_PX && pageIndex > 0) side = 'left';
    else if (x >= w - PAGE_EDGE_PX && pageIndex < pageCount - 1) side = 'right';

    if (!side) {
      clearEdgePending();
      return false;
    }

    clearDwell();
    clearInsertPending();
    edgeSide = side;
    if (pendingEdge === side && edgeTimer) return true;

    if (edgeTimer) clearTimeout(edgeTimer);
    pendingEdge = side;
    edgeTimer = setTimeout(() => {
      edgeTimer = null;
      pendingEdge = null;
      doPageFlip(side);
    }, PAGE_FLIP_DWELL_MS);
    return true;
  }

  /** 拖出 outsideRoot 外并停住：只通知关窗，拖拽与浮层继续跟手 */
  function tryOutsideDwell(): boolean {
    if (!activeId || !outsideRoot) {
      if (!outsideLocked) clearOutsidePending();
      return false;
    }
    if (outsideLocked) {
      clearDwell();
      clearInsertPending();
      clearEdgePending();
      return true;
    }

    const rect = outsideRoot.getBoundingClientRect();
    const { x, y } = pointer;
    const inside =
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (inside) {
      clearOutsidePending();
      return false;
    }

    clearDwell();
    clearInsertPending();
    clearEdgePending();
    if (outsideTimer) return true;

    outsideTimer = setTimeout(() => {
      outsideTimer = null;
      if (!activeId || outsideLocked) return;
      outsideLocked = true;
      clearDwell();
      clearInsertPending();
      clearEdgePending();
      onDragOutcome({ type: 'outsideDwell' });
    }, OUTSIDE_DWELL_MS);
    return true;
  }

  function onDragStart(event: { operation: { source?: { id: string | number } | null } }) {
    activeId = String(event.operation.source?.id ?? '');
    lastInsertKey = '';
    orderDirty = false;
    didFlip = false;
    outsideLocked = false;
    orderAtDragStart = localItems.map((i) => i.id);
    clearInsertPending();
    clearDwell();
    clearEdgePending();
    clearOutsidePending();
    suppressClick = false;
    onDragOutcome({ type: 'sessionStart' });
    window.addEventListener('pointermove', onPointerTrack, { passive: true });
  }

  function onDragMove(event: {
    operation: {
      source?: { id: string | number } | null;
      target?: { id: string | number } | null;
      position?: { x?: number; y?: number; current?: { x?: number; y?: number } };
    };
  }) {
    const c = coordsOf(event);
    if (c.x || c.y) pointer = c;
    applyHover();
  }

  function onDragOver(event: {
    operation: {
      source?: { id: string | number } | null;
      target?: { id: string | number } | null;
      position?: { x?: number; y?: number; current?: { x?: number; y?: number } };
    };
  }) {
    const c = coordsOf(event);
    if (c.x || c.y) pointer = c;
    applyHover();
  }

  function applyHover() {
    if (tryOutsideDwell()) return;
    if (tryPageEdge()) return;

    const sourceId = activeId;
    if (!sourceId) {
      clearDwell();
      clearInsertPending();
      return;
    }

    const { x, y } = pointer;
    const m = gridEl ? readGridMetrics(gridEl) : null;
    if (m) {
      const cell = cellHit(x, y, m);
      if (cell && cell.index < localItems.length) {
        const targetId = localItems[cell.index]?.id ?? null;
        if (!targetId || sourceId === targetId) {
          clearDwell();
          clearInsertPending();
          return;
        }
        const source = localItems.find((i) => i.id === sourceId);
        const target = localItems.find((i) => i.id === targetId);
        if (!source || !target) return;
        if (canMerge(source, target) && hitEdgeRelative(cell.nx, cell.ny) === 'center') {
          clearInsertPending();
          startDwell(sourceId, targetId);
          return;
        }
        clearDwell();
        const insertAt = insertIndexFromHit(cell.index, hitEdgeRelative(cell.nx, cell.ny), 'skip');
        if (insertAt == null) {
          clearInsertPending();
          return;
        }
        scheduleInsert(sourceId, targetId, insertAt);
        return;
      }
      const root = hitRoot ?? outsideRoot ?? gridEl;
      if (!root) {
        clearDwell();
        clearInsertPending();
        return;
      }
      const br = root.getBoundingClientRect();
      const at = insertIndexForDropBand(
        x,
        y,
        m,
        localItems.length,
        'skip',
        { left: br.left, top: br.top, right: br.right, bottom: br.bottom },
      );
      if (at == null) {
        clearDwell();
        clearInsertPending();
        return;
      }
      clearDwell();
      scheduleInsert(sourceId, at === 0 ? '__start' : '__end', at);
      return;
    }

    const targetEl = document.elementFromPoint(pointer.x, pointer.y);
    const tile = targetEl?.closest?.('[data-tile-id]') as HTMLElement | null;
    const targetId = tile?.dataset.tileId ?? null;

    if (!tile || !targetId || sourceId === targetId) {
      clearDwell();
      clearInsertPending();
      return;
    }

    const source = localItems.find((i) => i.id === sourceId);
    const target = localItems.find((i) => i.id === targetId);
    if (!source || !target) return;

    const { nx, ny } = normalizedInRect(x, y, tile.getBoundingClientRect());
    if (canMerge(source, target) && hitEdgeRelative(nx, ny) === 'center') {
      clearInsertPending();
      startDwell(sourceId, targetId);
      return;
    }

    clearDwell();
    const insertAt = insertIndexFromHit(
      localItems.findIndex((i) => i.id === targetId),
      hitEdgeRelative(nx, ny),
      'skip',
    );
    if (insertAt == null) {
      clearInsertPending();
      return;
    }
    scheduleInsert(sourceId, targetId, insertAt);
  }

  function onDragEnd(event: { canceled?: boolean }) {
    window.removeEventListener('pointermove', onPointerTrack);
    const sourceId = activeId;
    const ready = mergeReady;
    const dwellId = dwellTargetId;
    const dropX = pointer.x;
    const dropY = pointer.y;
    const wasOutside = outsideLocked;
    clearDwell();
    clearInsertPending();
    clearEdgePending();
    clearOutsidePending();
    outsideLocked = false;
    activeId = null;
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);

    if (wasOutside) {
      orderDirty = false;
      didFlip = false;
      if (event.canceled || !sourceId) return;
      onDragOutcome({
        type: 'outsideDrop',
        itemId: sourceId,
        clientX: dropX,
        clientY: dropY,
      });
      return;
    }

    if (event.canceled) {
      onDragOutcome({ type: 'sessionCancel' });
      orderDirty = false;
      didFlip = false;
      return;
    }

    if (ready && sourceId && dwellId && enableMerge) {
      const source = localItems.find((i) => i.id === sourceId) ?? items.find((i) => i.id === sourceId);
      const target = localItems.find((i) => i.id === dwellId) ?? items.find((i) => i.id === dwellId);
      if (source?.kind === 'app' && target?.kind === 'app') {
        onDragOutcome({ type: 'merge', fromId: sourceId, ontoId: dwellId });
      } else if (source?.kind === 'app' && target?.kind === 'folder') {
        onDragOutcome({ type: 'intoFolder', appId: sourceId, folderId: dwellId });
      }
      orderDirty = false;
      didFlip = false;
      return;
    }

    if (orderDirty || didFlip) {
      const same =
        !didFlip &&
        localItems.length === orderAtDragStart.length &&
        localItems.every((item, i) => item.id === orderAtDragStart[i]);
      if (!same) onDragOutcome({ type: 'reorder', items: localItems });
    }
    orderDirty = false;
    didFlip = false;
  }

  function onTileActivate(item: GridItem) {
    if (suppressClick || activeId) return;
    onActivate(item);
  }
</script>

<DragDropProvider {onDragStart} {onDragMove} {onDragOver} {onDragEnd}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    bind:this={gridEl}
    class="grid"
    class:compact
    data-ytab-grid={compact ? 'folder' : 'page'}
    role="presentation"
    oncontextmenu={onGridContextMenu}
  >
    {#each localItems as item (item.id)}
      <div animate:flip={{ duration: flipMs }}>
        <GridTile
          {item}
          merging={mergeReady && dwellTargetId === item.id}
          dwelling={!mergeReady && dwellTargetId === item.id}
          dragging={activeId === item.id}
          onActivate={() => onTileActivate(item)}
        />
      </div>
    {/each}
  </div>

  <DragOverlay>
    {#if activeItem()}
      {@const a = activeItem()!}
      <div class="overlay-tile" class:compact>
        <div class="icon" class:folder={a.kind === 'folder'}>
          {#if a.kind === 'folder'}
            <div class="folder-preview">
              {#each Array.from({ length: 4 }, (_, i) => a.children[i] ?? null) as child}
                {#if child?.icon}
                  <img src={displayAppIcon(child.url, child.icon)} alt="" />
                {:else if child}
                  <span class="ph"></span>
                {:else}
                  <span class="slot"></span>
                {/if}
              {/each}
            </div>
          {:else if a.kind === 'app' && displayAppIcon(a.url, a.icon)}
            <img src={displayAppIcon(a.url, a.icon)} alt="" />
          {:else}
            <span class="ph">{a.name.slice(0, 1)}</span>
          {/if}
        </div>
        <span class="label">{a.name}</span>
      </div>
    {/if}
  </DragOverlay>
</DragDropProvider>

{#if edgeSide}
  <div class="page-edge" class:left={edgeSide === 'left'} class:right={edgeSide === 'right'} aria-hidden="true"></div>
{/if}

<style>
  :global([data-dnd-overlay]) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 10000;
    pointer-events: none;
  }
  :global([data-dnd-overlay]:not([data-dnd-dragging])) {
    display: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 1.1rem 0.75rem;
    width: 100%;
    justify-items: center;
    min-height: 96px;
  }
  .grid.compact {
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 0.9rem 0.5rem;
    min-height: 72px;
  }
  .overlay-tile {
    width: 88px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    opacity: 0.88;
    transform: scale(1.08);
    filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
    pointer-events: none;
    color: #fff;
  }
  .overlay-tile.compact {
    width: 80px;
  }
  .overlay-tile .icon {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: transparent;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .overlay-tile.compact .icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
  }
  .overlay-tile .icon.folder {
    background: rgba(255, 255, 255, 0.2);
  }
  .overlay-tile .icon > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .overlay-tile .folder-preview {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 3px;
    width: 78%;
    height: 78%;
  }
  .overlay-tile .folder-preview img,
  .overlay-tile .folder-preview .ph,
  .overlay-tile .folder-preview .slot {
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: 4px;
    object-fit: cover;
    background: rgba(0, 0, 0, 0.2);
  }
  .overlay-tile .folder-preview .slot {
    background: transparent;
  }
  .overlay-tile .ph {
    font-size: 1.4rem;
    font-weight: 600;
  }
  .overlay-tile .label {
    font-size: 0.78rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  .page-edge {
    position: fixed;
    top: 0;
    bottom: 0;
    width: 44px;
    z-index: 9990;
    pointer-events: none;
    background: linear-gradient(to right, rgba(10, 132, 255, 0.35), transparent);
  }
  .page-edge.right {
    right: 0;
    left: auto;
    background: linear-gradient(to left, rgba(10, 132, 255, 0.35), transparent);
  }
  .page-edge.left {
    left: 0;
  }
</style>
