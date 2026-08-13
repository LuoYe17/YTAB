<script lang="ts" generics="S extends Scope">
  import { onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { DragDropProvider, DragOverlay } from '@dnd-kit/svelte';
  import type { GridItem } from '../lib/types';
  import { srcFor } from '../lib/appIcons';
  import { readGridMetrics, type HitBand } from '../lib/gridInsertGeometry';
  import {
    createGridDragSession,
    realClock,
    type DragEventFor,
    type DragVisuals,
    type PageDropTarget,
    type Scope,
  } from '../lib/gridDrag';
  import GridTile from './GridTile.svelte';

  let {
    items,
    compact = false,
    scope,
    pageIndex = 0,
    pageCount = 1,
    onActivate,
    onEvent,
    onOutsideDwell,
    onGridContextMenu,
    outsideRoot = null,
    hitRoot = null,
    readPageDropTarget,
    gridEl = $bindable(null),
  }: {
    items: GridItem[];
    /** compact 只改格子尺寸，不影响拖拽语义 */
    compact?: boolean;
    /** page = 主网格（可合文件夹、可翻页）；folder = 文件夹内（仅换位与拖出） */
    scope: S;
    pageIndex?: number;
    pageCount?: number;
    onActivate: (item: GridItem) => void;
    onEvent: (event: DragEventFor<S>) => void;
    /** 拖出壳外停住：只关视觉壳，不是 App 网格事件 */
    onOutsideDwell?: () => void;
    onGridContextMenu?: (e: MouseEvent, item: GridItem | null) => void;
    /** 指针拖出此元素外并停住 → 仅视觉关窗，拖拽继续跟手 */
    outsideRoot?: HTMLElement | null;
    /** 比网格更宽的落点带；起始页为 grid-slot，文件夹为面板 */
    hitRoot?: HTMLElement | null;
    /** 文件夹拖出时的主网格落点；由持有主网格的宿主提供 */
    readPageDropTarget?: (excludeId: string) => PageDropTarget | null;
    /** 交给宿主，供文件夹算拖出落点 */
    gridEl?: HTMLElement | null;
  } = $props();

  const flipMs = 300;

  let visuals = $state<DragVisuals>({
    activeId: null,
    dwellTargetId: null,
    mergeReady: false,
    edgeSide: null,
  });
  let suppressClick = $state(false);
  /** dnd-kit 偶尔不带坐标，用上一次的顶上 */
  let lastX = 0;
  let lastY = 0;

  function rectOf(el: HTMLElement | null): HitBand | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  // scope 挂载后不再变（主网格恒 page，文件夹恒 folder），会话按它建一次就够。
  /* svelte-ignore state_referenced_locally */
  const session = createGridDragSession<S>({
    scope,
    clock: realClock,
    getItems: () => items,
    getPaging: () => ({ pageIndex, pageCount }),
    readMetrics: () => (gridEl ? readGridMetrics(gridEl) : null),
    readHitBand: () => rectOf(hitRoot ?? outsideRoot ?? gridEl),
    readOutsideRect: () => rectOf(outsideRoot),
    readPageDropTarget: (excludeId) => readPageDropTarget?.(excludeId) ?? null,
    viewportWidth: () => window.innerWidth,
    onEvent: (event) => onEvent(event),
    onVisuals: (next) => {
      visuals = next;
    },
    onOutsideDwell: () => onOutsideDwell?.(),
  });

  onDestroy(() => session.dispose());

  function activeItem(): GridItem | null {
    return items.find((i) => i.id === visuals.activeId) ?? null;
  }

  function track(x: number, y: number) {
    if (x || y) {
      lastX = x;
      lastY = y;
    }
    session.move(lastX, lastY);
  }

  function coordsOf(event: {
    operation?: { position?: { x?: number; y?: number; current?: { x?: number; y?: number } } };
  }): { x: number; y: number } {
    const p = event.operation?.position;
    const cur = p && 'current' in p && p.current ? p.current : p;
    if (cur && typeof cur.x === 'number' && typeof cur.y === 'number') {
      return { x: cur.x, y: cur.y };
    }
    return { x: 0, y: 0 };
  }

  function onPointerTrack(e: PointerEvent) {
    track(e.clientX, e.clientY);
  }

  function onDragStart(event: { operation: { source?: { id: string | number } | null } }) {
    suppressClick = false;
    session.start(String(event.operation.source?.id ?? ''));
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
    track(c.x, c.y);
  }

  function onDragOver(event: {
    operation: {
      source?: { id: string | number } | null;
      target?: { id: string | number } | null;
      position?: { x?: number; y?: number; current?: { x?: number; y?: number } };
    };
  }) {
    const c = coordsOf(event);
    track(c.x, c.y);
  }

  function onDragEnd(event: { canceled?: boolean }) {
    window.removeEventListener('pointermove', onPointerTrack);
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    session.end(event.canceled === true);
  }

  function onTileActivate(item: GridItem) {
    if (suppressClick || visuals.activeId) return;
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
    role="presentation"
    oncontextmenu={onContextMenu}
  >
    {#each items as item (item.id)}
      <div animate:flip={{ duration: flipMs }}>
        <GridTile
          {item}
          merging={visuals.mergeReady && visuals.dwellTargetId === item.id}
          dwelling={!visuals.mergeReady && visuals.dwellTargetId === item.id}
          dragging={visuals.activeId === item.id}
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

{#if visuals.edgeSide}
  <div
    class="page-edge"
    class:left={visuals.edgeSide === 'left'}
    class:right={visuals.edgeSide === 'right'}
    aria-hidden="true"
  ></div>
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
