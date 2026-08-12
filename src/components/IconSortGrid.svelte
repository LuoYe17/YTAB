<script lang="ts">
  import { flip } from 'svelte/animate';
  import { DragDropProvider, DragOverlay } from '@dnd-kit/svelte';
  import type { GridItem } from '../lib/types';
  import {
    hitEdgeRelative,
    insertIndexFromHit,
    normalizedInRect,
  } from '../lib/gridInsertGeometry';
  import GridTile from './GridTile.svelte';

  let {
    items,
    enableMerge = true,
    compact = false,
    pageIndex = 0,
    pageCount = 1,
    onActivate,
    onReorder,
    onMerge,
    onDropIntoFolder,
    onPageFlip,
    onDragSessionStart,
    onDragSessionCancel,
    onGridContextMenu,
    outsideRoot = null,
    onOutsideDwell,
    onOutsideDrop,
  }: {
    items: GridItem[];
    /** false = 仅换位（文件夹内部） */
    enableMerge?: boolean;
    compact?: boolean;
    pageIndex?: number;
    pageCount?: number;
    onActivate: (item: GridItem) => void;
    onReorder: (next: GridItem[]) => void;
    onMerge?: (fromId: string, ontoId: string) => void;
    onDropIntoFolder?: (appId: string, folderId: string) => void;
    /** 边缘翻页：from 页已去掉 item；to 页应已含 item */
    onPageFlip?: (toPage: number, fromPageWithoutItem: GridItem[], item: GridItem) => void;
    onDragSessionStart?: () => void;
    onDragSessionCancel?: () => void;
    onGridContextMenu?: (e: MouseEvent) => void;
    /** 指针拖出此元素外并停住 → 仅视觉关窗，拖拽继续跟手 */
    outsideRoot?: HTMLElement | null;
    onOutsideDwell?: () => void;
    /** 关窗跟手后松手：按坐标落到主网格 */
    onOutsideDrop?: (itemId: string, clientX: number, clientY: number) => void;
  } = $props();

  const flipMs = 220;
  const MERGE_DWELL_MS = 400;
  const INSERT_DWELL_MS = 220;
  const OUTSIDE_DWELL_MS = 320;
  const CENTER = 0.38;
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

  function insertIndexFor(targetId: string, clientX: number, clientY: number): number | null {
    const el = document.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(targetId)}"]`);
    if (!el) return null;
    const targetIndex = localItems.findIndex((i) => i.id === targetId);
    if (targetIndex < 0) return null;
    const { nx, ny } = normalizedInRect(clientX, clientY, el.getBoundingClientRect());
    return insertIndexFromHit(targetIndex, hitEdgeRelative(nx, ny), 'skip');
  }

  function isCenterHit(targetId: string, clientX: number, clientY: number): boolean {
    const el = document.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(targetId)}"]`);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const nx = (clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (clientY - rect.top) / Math.max(rect.height, 1);
    return nx > CENTER && nx < 1 - CENTER && ny > CENTER && ny < 1 - CENTER;
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
    if (!activeId || !onPageFlip) return;
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
    onPageFlip(toPage, fromWithout, item);
  }

  /** @returns true 若指针在翻页热区（并处理计时） */
  function tryPageEdge(): boolean {
    if (!activeId || !onPageFlip || pageCount <= 1) {
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
    if (!activeId || !outsideRoot || !onOutsideDwell) {
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
      onOutsideDwell();
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
    onDragSessionStart?.();
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
    const targetEl = document.elementFromPoint(pointer.x, pointer.y);
    const tile = targetEl?.closest?.('[data-tile-id]') as HTMLElement | null;
    const targetId = tile?.dataset.tileId ?? null;

    if (!sourceId || !targetId || sourceId === targetId) {
      clearDwell();
      clearInsertPending();
      return;
    }

    const source = localItems.find((i) => i.id === sourceId);
    const target = localItems.find((i) => i.id === targetId);
    if (!source || !target) return;

    const { x, y } = pointer;
    if (canMerge(source, target) && isCenterHit(targetId, x, y)) {
      clearInsertPending();
      startDwell(sourceId, targetId);
      return;
    }

    clearDwell();
    const insertAt = insertIndexFor(targetId, x, y);
    if (insertAt == null) {
      clearInsertPending();
      return;
    }

    const key = `${sourceId}:${targetId}:${insertAt}`;
    if (key === lastInsertKey) {
      clearInsertPending();
      return;
    }

    if (
      pendingInsert &&
      pendingInsert.sourceId === sourceId &&
      pendingInsert.targetId === targetId &&
      pendingInsert.insertAt === insertAt &&
      insertTimer
    ) {
      return;
    }

    clearInsertPending();
    pendingInsert = { sourceId, targetId, insertAt };
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
      onOutsideDrop?.(sourceId, dropX, dropY);
      return;
    }

    if (event.canceled) {
      onDragSessionCancel?.();
      orderDirty = false;
      didFlip = false;
      return;
    }

    if (ready && sourceId && dwellId && enableMerge) {
      const source = localItems.find((i) => i.id === sourceId) ?? items.find((i) => i.id === sourceId);
      const target = localItems.find((i) => i.id === dwellId) ?? items.find((i) => i.id === dwellId);
      if (source?.kind === 'app' && target?.kind === 'app') {
        onMerge?.(sourceId, dwellId);
      } else if (source?.kind === 'app' && target?.kind === 'folder') {
        onDropIntoFolder?.(sourceId, dwellId);
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
      if (!same) onReorder(localItems);
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
    class="grid"
    class:compact
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
                  <img src={child.icon} alt="" />
                {:else if child}
                  <span class="ph"></span>
                {:else}
                  <span class="slot"></span>
                {/if}
              {/each}
            </div>
          {:else if a.icon}
            <img src={a.icon} alt="" />
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
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.14);
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
  .overlay-tile .icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
