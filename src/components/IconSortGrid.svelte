<script lang="ts">
  import { flip } from 'svelte/animate';
  import { DragDropProvider, DragOverlay } from '@dnd-kit/svelte';
  import type { GridItem } from '../lib/types';
  import type { AppGridEvent } from '../lib/appGrid';
  import { srcFor } from '../lib/appIcons';
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
    scope = 'page',
    pageIndex = 0,
    pageCount = 1,
    onActivate,
    onEvent,
    onOutsideDwell,
    onGridContextMenu,
    outsideRoot = null,
    hitRoot = null,
  }: {
    items: GridItem[];
    /** false = 仅换位（文件夹内部） */
    enableMerge?: boolean;
    compact?: boolean;
    /** 换位事件走 scope，不跟 compact：compact 只改格子尺寸。 */
    scope?: 'page' | 'folder';
    pageIndex?: number;
    pageCount?: number;
    onActivate: (item: GridItem) => void;
    onEvent: (event: AppGridEvent) => void;
    /** 拖出壳外停住：只关视觉壳，不是 App 网格事件 */
    onOutsideDwell?: () => void;
    onGridContextMenu?: (e: MouseEvent, item: GridItem | null) => void;
    /** 指针拖出此元素外并停住 → 仅视觉关窗，拖拽继续跟手 */
    outsideRoot?: HTMLElement | null;
    /** 比网格更宽的落点带；起始页为 grid-slot，文件夹为面板 */
    hitRoot?: HTMLElement | null;
  } = $props();

  const flipMs = 300;
  const MERGE_DWELL_MS = 400;
  const INSERT_DWELL_MS = 220;
  const OUTSIDE_DWELL_MS = 320;
  const PAGE_EDGE_PX = 44;
  const PAGE_FLIP_DWELL_MS = 400;
  const PAGE_FLIP_COOLDOWN_MS = 650;

  let activeId = $state<string | null>(null);
  let dwellTargetId = $state<string | null>(null);
  let mergeReady = $state(false);
  let pointer = $state({ x: 0, y: 0 });
  let suppressClick = $state(false);
  let edgeSide = $state<'left' | 'right' | null>(null);
  /** 已触发「拖出关窗」，拖拽会话仍继续 */
  let outsideLocked = false;

  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  let insertTimer: ReturnType<typeof setTimeout> | null = null;
  let edgeTimer: ReturnType<typeof setTimeout> | null = null;
  let outsideTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingInsert: { sourceId: string; targetId: string; insertAt: number } | null = null;
  let pendingEdge: 'left' | 'right' | null = null;
  let lastInsertKey = '';
  let flipCooldownUntil = 0;
  let gridEl = $state<HTMLElement | null>(null);

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
    return items.find((i) => i.id === activeId) ?? null;
  }

  function canMerge(source: GridItem, target: GridItem): boolean {
    if (!enableMerge) return false;
    if (source.id === target.id) return false;
    if (source.kind !== 'app') return false;
    return target.kind === 'app' || target.kind === 'folder';
  }

  function startDwell(sourceId: string, targetId: string) {
    const source = items.find((i) => i.id === sourceId);
    const target = items.find((i) => i.id === targetId);
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
    const from = items.findIndex((i) => i.id === sourceId);
    if (from < 0) return false;
    let to = insertAt;
    if (from < to) to -= 1;
    to = Math.max(0, Math.min(to, items.length - 1));
    if (from === to) return false;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return false;
    next.splice(to, 0, moved);
    const order = next.map((i) => i.id);
    onEvent(scope === 'folder' ? { type: 'reorderFolder', order } : { type: 'reorderPage', order });
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
    clearEdgePending();
    clearDwell();
    clearInsertPending();
    flipCooldownUntil = Date.now() + PAGE_FLIP_COOLDOWN_MS;
    onEvent({ type: 'pageFlip', toPage });
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
      onOutsideDwell?.();
    }, OUTSIDE_DWELL_MS);
    return true;
  }

  function onDragStart(event: { operation: { source?: { id: string | number } | null } }) {
    activeId = String(event.operation.source?.id ?? '');
    lastInsertKey = '';
    outsideLocked = false;
    clearInsertPending();
    clearDwell();
    clearEdgePending();
    clearOutsidePending();
    suppressClick = false;
    onEvent({ type: 'beginDrag', itemId: activeId });
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
      if (cell && cell.index < items.length) {
        const targetId = items[cell.index]?.id ?? null;
        if (!targetId || sourceId === targetId) {
          clearDwell();
          clearInsertPending();
          return;
        }
        const source = items.find((i) => i.id === sourceId);
        const target = items.find((i) => i.id === targetId);
        if (!source || !target) {
          clearDwell();
          clearInsertPending();
          return;
        }
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
        items.length,
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

    const source = items.find((i) => i.id === sourceId);
    const target = items.find((i) => i.id === targetId);
    if (!source || !target) {
      clearDwell();
      clearInsertPending();
      return;
    }

    const { nx, ny } = normalizedInRect(x, y, tile.getBoundingClientRect());
    if (canMerge(source, target) && hitEdgeRelative(nx, ny) === 'center') {
      clearInsertPending();
      startDwell(sourceId, targetId);
      return;
    }

    clearDwell();
    const insertAt = insertIndexFromHit(
      items.findIndex((i) => i.id === targetId),
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
      // 空 sourceId 无法 eject，必须 cancel 才能清掉 beginDrag 留下的 dragSnapshot。
      if (event.canceled || !sourceId) {
        onEvent({ type: 'cancelDrag' });
        return;
      }
      onEvent({ type: 'eject', appId: sourceId, insertAt: insertAtOnPage(dropX, dropY, sourceId) });
      return;
    }

    if (event.canceled) {
      onEvent({ type: 'cancelDrag' });
      return;
    }

    if (ready && sourceId && dwellId && enableMerge) {
      const source = items.find((i) => i.id === sourceId);
      const target = items.find((i) => i.id === dwellId);
      if (source?.kind === 'app' && target?.kind === 'app') {
        onEvent({ type: 'merge', fromId: sourceId, ontoId: dwellId });
      } else if (source?.kind === 'app' && target?.kind === 'folder') {
        onEvent({ type: 'intoFolder', appId: sourceId, folderId: dwellId });
      }
      return;
    }

    onEvent({ type: 'endDrag' });
  }

  /** 从文件夹拖出落到主网格；中心算插入（已经不会合文件夹）。 */
  function insertAtOnPage(clientX: number, clientY: number, excludeId: string): number {
    const pageGrid = document.querySelector<HTMLElement>('[data-ytab-grid="page"]');
    const slot = document.querySelector<HTMLElement>('[data-ytab-drop-band]');
    const m = pageGrid ? readGridMetrics(pageGrid) : null;
    const host = slot ?? pageGrid;
    if (!m || !host) return 0;
    const occupied = [...pageGrid!.querySelectorAll('[data-tile-id]')].filter(
      (el) => el.getAttribute('data-tile-id') !== excludeId,
    ).length;
    const br = host.getBoundingClientRect();
    return (
      insertIndexForDropBand(clientX, clientY, m, occupied, 'after', {
        left: br.left,
        top: br.top,
        right: br.right,
        bottom: br.bottom,
      }) ?? occupied
    );
  }

  function onTileActivate(item: GridItem) {
    if (suppressClick || activeId) return;
    onActivate(item);
  }

  function onContextMenu(e: MouseEvent) {
    if (!onGridContextMenu) return;
    e.preventDefault();
    const id = (e.target as HTMLElement | null)?.closest('[data-tile-id]')?.getAttribute('data-tile-id');
    const item = id ? (items.find((i) => i.id === id) ?? null) : null;
    onGridContextMenu(e, item);
  }
</script>

<DragDropProvider {onDragStart} {onDragMove} {onDragOver} {onDragEnd}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    bind:this={gridEl}
    class="grid"
    class:compact
    data-ytab-grid={scope}
    role="presentation"
    oncontextmenu={onContextMenu}
  >
    {#each items as item (item.id)}
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
                {#if child}
                  {@const src = srcFor(child)}
                  {#if src}
                    <img src={src} alt="" />
                  {:else}
                    <span class="ph">{child.name.slice(0, 1)}</span>
                  {/if}
                {:else}
                  <span class="slot"></span>
                {/if}
              {/each}
            </div>
          {:else if a.kind === 'app' && srcFor(a)}
            <img src={srcFor(a)} alt="" />
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
