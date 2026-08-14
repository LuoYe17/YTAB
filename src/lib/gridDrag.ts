/**
 * App 网格拖拽会话：一次按下到松手之间的**停住判定**。
 *
 * 分工：落点几何在 `gridInsertGeometry`，落表在 `appGrid.apply`，本 module 只管「何时」——
 * 停多久算合文件夹、停多久算换位、边缘停多久翻页、拖出壳外停多久关窗。
 * 时间与 DOM 都经 deps 注入，因此规则可用假时钟直接测。
 */

import type { AppGridEvent } from './appGrid';
import type { Clock } from './clock';
import {
  cellHit,
  hitEdgeRelative,
  insertIndexForDropBand,
  insertIndexFromHit,
  type GridMetrics,
  type HitBand,
} from './gridInsertGeometry';
import type { GridItem } from './types';

/** 停住时长与热区宽度；数值即 ADR-0011 定下的手感。 */
export const MERGE_DWELL_MS = 400;
export const INSERT_DWELL_MS = 220;
export const OUTSIDE_DWELL_MS = 320;
export const PAGE_EDGE_PX = 44;
export const PAGE_FLIP_DWELL_MS = 400;
export const PAGE_FLIP_COOLDOWN_MS = 650;

export type Scope = 'page' | 'folder';

/** 拖拽中的视觉状态；变了才推给宿主，指针每动一下不重复推。 */
export type DragVisuals = {
  activeId: string | null;
  dwellTargetId: string | null;
  mergeReady: boolean;
  edgeSide: 'left' | 'right' | null;
};

/** 文件夹拖出时的主网格落点。由持有主网格的宿主组好传入，本 module 不摸 DOM。 */
export type PageDropTarget = {
  metrics: GridMetrics;
  band: HitBand;
  /** 当前页已占格数，不含正被拖出的那颗 */
  occupiedCount: number;
};

type PageDragEvent = Extract<
  AppGridEvent,
  { type: 'beginDrag' | 'endDrag' | 'cancelDrag' | 'reorderPage' | 'merge' | 'intoFolder' | 'pageFlip' }
>;

type FolderDragEvent = Extract<
  AppGridEvent,
  { type: 'beginDrag' | 'endDrag' | 'cancelDrag' | 'reorderFolder' | 'eject' }
>;

/** 会话按 scope 只能发对应子集：文件夹内没有合文件夹，也没有翻页。 */
export type DragEventFor<S extends Scope> = S extends 'page' ? PageDragEvent : FolderDragEvent;

export type GridDragDeps<S extends Scope> = {
  /** 合文件夹只在主网格开；文件夹内仅换位与拖出。 */
  scope: S;
  clock: Clock;
  getItems(): GridItem[];
  getPaging(): { pageIndex: number; pageCount: number };
  readMetrics(): GridMetrics | null;
  /** 比网格更宽的落点带；带外不判定插入。 */
  readHitBand(): HitBand | null;
  /** 文件夹壳矩形；无壳（主网格）返回 null。 */
  readOutsideRect?(): HitBand | null;
  /** 拖出落到主网格的目标；仅文件夹会话需要。 */
  readPageDropTarget?(excludeId: string): PageDropTarget | null;
  viewportWidth(): number;
  onEvent(event: DragEventFor<S>): void;
  onVisuals(visuals: DragVisuals): void;
  /** 拖出壳外停住：只关视觉壳，拖拽继续跟手。 */
  onOutsideDwell?(): void;
};

export type GridDragSession = {
  start(itemId: string): void;
  move(x: number, y: number): void;
  end(canceled: boolean): void;
  /** 宿主卸载时调用，掐掉未开火的定时器。 */
  dispose(): void;
};

/**
 * 建一个拖拽会话。宿主负责把指针坐标喂进 `move`，把 `onEvent` 转给 `appGrid.apply`。
 *
 * 调用顺序：`start` → 若干次 `move` → `end`。`end` 之后迟到的定时器不会再发事件。
 */
export function createGridDragSession<S extends Scope>(deps: GridDragDeps<S>): GridDragSession {
  const { clock } = deps;

  // TS 无法按运行时 scope 收窄泛型返回类型，出口处一次性放宽；发什么由下面各分支的 scope 判断保证。
  const emit = deps.onEvent as (event: PageDragEvent | FolderDragEvent) => void;

  let activeId: string | null = null;
  let dwellTargetId: string | null = null;
  let mergeReady = false;
  let edgeSide: 'left' | 'right' | null = null;
  /** 已触发「拖出关窗」，拖拽会话仍继续 */
  let outsideLocked = false;
  let pointerX = 0;
  let pointerY = 0;

  let dwellTimer: number | null = null;
  let insertTimer: number | null = null;
  let edgeTimer: number | null = null;
  let outsideTimer: number | null = null;
  let pendingInsert: { sourceId: string; targetKey: string; insertAt: number } | null = null;
  let pendingEdge: 'left' | 'right' | null = null;
  let lastInsertKey = '';
  let flipCooldownUntil = 0;

  let pushed: DragVisuals = {
    activeId: null,
    dwellTargetId: null,
    mergeReady: false,
    edgeSide: null,
  };

  function pushVisuals() {
    if (
      pushed.activeId === activeId &&
      pushed.dwellTargetId === dwellTargetId &&
      pushed.mergeReady === mergeReady &&
      pushed.edgeSide === edgeSide
    ) {
      return;
    }
    pushed = { activeId, dwellTargetId, mergeReady, edgeSide };
    deps.onVisuals(pushed);
  }

  function clearDwell() {
    if (dwellTimer !== null) clock.clearTimeout(dwellTimer);
    dwellTimer = null;
    dwellTargetId = null;
    mergeReady = false;
  }

  function clearInsertPending() {
    if (insertTimer !== null) clock.clearTimeout(insertTimer);
    insertTimer = null;
    pendingInsert = null;
  }

  function clearEdgePending() {
    if (edgeTimer !== null) clock.clearTimeout(edgeTimer);
    edgeTimer = null;
    pendingEdge = null;
    edgeSide = null;
  }

  function clearOutsidePending() {
    if (outsideTimer !== null) clock.clearTimeout(outsideTimer);
    outsideTimer = null;
  }

  function canMerge(source: GridItem, target: GridItem): boolean {
    if (deps.scope !== 'page') return false;
    if (source.id === target.id) return false;
    if (source.kind !== 'app') return false;
    return target.kind === 'app' || target.kind === 'folder';
  }

  function startDwell(sourceId: string, targetId: string) {
    const items = deps.getItems();
    const source = items.find((i) => i.id === sourceId);
    const target = items.find((i) => i.id === targetId);
    if (!source || !target || !canMerge(source, target)) {
      clearDwell();
      return;
    }
    if (dwellTargetId === targetId && (dwellTimer !== null || mergeReady)) return;
    if (dwellTimer !== null) clock.clearTimeout(dwellTimer);
    dwellTargetId = targetId;
    mergeReady = false;
    dwellTimer = clock.setTimeout(() => {
      dwellTimer = null;
      mergeReady = true;
      pushVisuals();
    }, MERGE_DWELL_MS);
  }

  /** 把「插到第 insertAt 位」翻成整页新顺序并发出；没真动则不发。 */
  function reorderTo(sourceId: string, insertAt: number): boolean {
    const items = deps.getItems();
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
    emit(deps.scope === 'folder' ? { type: 'reorderFolder', order } : { type: 'reorderPage', order });
    return true;
  }

  function scheduleInsert(sourceId: string, targetKey: string, insertAt: number) {
    const key = `${sourceId}:${targetKey}:${insertAt}`;
    // 刚换到这个位置就别再换回去，否则指针不动也会来回抖。
    if (key === lastInsertKey) {
      clearInsertPending();
      return;
    }
    if (
      pendingInsert &&
      pendingInsert.sourceId === sourceId &&
      pendingInsert.targetKey === targetKey &&
      pendingInsert.insertAt === insertAt &&
      insertTimer !== null
    ) {
      return;
    }
    clearInsertPending();
    pendingInsert = { sourceId, targetKey, insertAt };
    insertTimer = clock.setTimeout(() => {
      const job = pendingInsert;
      insertTimer = null;
      pendingInsert = null;
      if (!job || job.sourceId !== activeId) return;
      if (reorderTo(job.sourceId, job.insertAt)) {
        lastInsertKey = `${job.sourceId}:${job.targetKey}:${job.insertAt}`;
      }
    }, INSERT_DWELL_MS);
  }

  function doPageFlip(side: 'left' | 'right') {
    const { pageIndex, pageCount } = deps.getPaging();
    if (!activeId || pageCount <= 1) return;
    const toPage = pageIndex + (side === 'left' ? -1 : 1);
    if (toPage < 0 || toPage >= pageCount) return;
    clearEdgePending();
    clearDwell();
    clearInsertPending();
    flipCooldownUntil = clock.now() + PAGE_FLIP_COOLDOWN_MS;
    emit({ type: 'pageFlip', toPage });
  }

  /** @returns true 若指针在翻页热区（并处理计时） */
  function tryPageEdge(): boolean {
    // 文件夹内没有翻页；靠 scope 挡住，不靠调用方恰好没传 pageCount。
    if (deps.scope !== 'page') return false;
    const { pageIndex, pageCount } = deps.getPaging();
    if (!activeId || pageCount <= 1) {
      clearEdgePending();
      return false;
    }
    if (clock.now() < flipCooldownUntil) {
      clearEdgePending();
      return false;
    }
    const w = deps.viewportWidth();
    let side: 'left' | 'right' | null = null;
    if (pointerX <= PAGE_EDGE_PX && pageIndex > 0) side = 'left';
    else if (pointerX >= w - PAGE_EDGE_PX && pageIndex < pageCount - 1) side = 'right';

    if (!side) {
      clearEdgePending();
      return false;
    }

    clearDwell();
    clearInsertPending();
    edgeSide = side;
    if (pendingEdge === side && edgeTimer !== null) return true;

    if (edgeTimer !== null) clock.clearTimeout(edgeTimer);
    pendingEdge = side;
    edgeTimer = clock.setTimeout(() => {
      edgeTimer = null;
      pendingEdge = null;
      doPageFlip(side);
      pushVisuals();
    }, PAGE_FLIP_DWELL_MS);
    return true;
  }

  /** 拖出壳外并停住：只通知关窗，拖拽与浮层继续跟手 */
  function tryOutsideDwell(): boolean {
    const readRect = deps.readOutsideRect;
    if (!activeId || !readRect) {
      if (!outsideLocked) clearOutsidePending();
      return false;
    }
    if (outsideLocked) {
      clearDwell();
      clearInsertPending();
      clearEdgePending();
      return true;
    }

    const rect = readRect();
    if (!rect) {
      clearOutsidePending();
      return false;
    }
    const inside =
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top &&
      pointerY <= rect.bottom;
    if (inside) {
      clearOutsidePending();
      return false;
    }

    clearDwell();
    clearInsertPending();
    clearEdgePending();
    if (outsideTimer !== null) return true;

    outsideTimer = clock.setTimeout(() => {
      outsideTimer = null;
      if (!activeId || outsideLocked) return;
      outsideLocked = true;
      clearDwell();
      clearInsertPending();
      clearEdgePending();
      pushVisuals();
      deps.onOutsideDwell?.();
    }, OUTSIDE_DWELL_MS);
    return true;
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

    const m = deps.readMetrics();
    if (!m) {
      clearDwell();
      clearInsertPending();
      return;
    }

    const items = deps.getItems();
    const cell = cellHit(pointerX, pointerY, m);
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

    const band = deps.readHitBand();
    if (!band) {
      clearDwell();
      clearInsertPending();
      return;
    }
    const at = insertIndexForDropBand(pointerX, pointerY, m, items.length, 'skip', band);
    if (at == null) {
      clearDwell();
      clearInsertPending();
      return;
    }
    clearDwell();
    scheduleInsert(sourceId, at === 0 ? '__start' : '__end', at);
  }

  /** 落到主网格的插入位；读不到主网格时退回首位。 */
  function ejectInsertAt(excludeId: string): number {
    const target = deps.readPageDropTarget?.(excludeId);
    if (!target) return 0;
    return (
      insertIndexForDropBand(
        pointerX,
        pointerY,
        target.metrics,
        target.occupiedCount,
        'after',
        target.band,
      ) ?? target.occupiedCount
    );
  }

  return {
    start(itemId: string) {
      activeId = itemId;
      lastInsertKey = '';
      outsideLocked = false;
      clearInsertPending();
      clearDwell();
      clearEdgePending();
      clearOutsidePending();
      pushVisuals();
      emit({ type: 'beginDrag', itemId });
    },

    move(x: number, y: number) {
      pointerX = x;
      pointerY = y;
      applyHover();
      pushVisuals();
    },

    end(canceled: boolean) {
      const sourceId = activeId;
      const ready = mergeReady;
      const dwellId = dwellTargetId;
      const wasOutside = outsideLocked;
      const items = deps.getItems();

      clearDwell();
      clearInsertPending();
      clearEdgePending();
      clearOutsidePending();
      outsideLocked = false;
      activeId = null;
      pushVisuals();

      // 拖出关窗只发生在文件夹内；主网格没有壳可拖出，也不该发 eject。
      if (wasOutside && deps.scope === 'folder') {
        // 没有 sourceId 就无法 eject，只能 cancel，否则 beginDrag 留下的快照清不掉。
        if (canceled || !sourceId) {
          emit({ type: 'cancelDrag' });
          return;
        }
        emit({ type: 'eject', appId: sourceId, insertAt: ejectInsertAt(sourceId) });
        return;
      }

      if (canceled) {
        emit({ type: 'cancelDrag' });
        return;
      }

      if (ready && sourceId && dwellId && deps.scope === 'page') {
        const source = items.find((i) => i.id === sourceId);
        const target = items.find((i) => i.id === dwellId);
        if (source?.kind === 'app' && target?.kind === 'app') {
          emit({ type: 'merge', fromId: sourceId, ontoId: dwellId });
          return;
        }
        if (source?.kind === 'app' && target?.kind === 'folder') {
          emit({ type: 'intoFolder', appId: sourceId, folderId: dwellId });
          return;
        }
      }

      emit({ type: 'endDrag' });
    },

    dispose() {
      clearDwell();
      clearInsertPending();
      clearEdgePending();
      clearOutsidePending();
      activeId = null;
      outsideLocked = false;
    },
  };
}
