import { describe, expect, it } from 'vitest';
import type { AppGridEvent } from './appGrid';
import type { Clock } from './clock';
import {
  INSERT_DWELL_MS,
  MERGE_DWELL_MS,
  OUTSIDE_DWELL_MS,
  PAGE_FLIP_COOLDOWN_MS,
  PAGE_FLIP_DWELL_MS,
  createGridDragSession,
  type DragVisuals,
  type PageDropTarget,
  type Scope,
} from './gridDrag';
import type { GridMetrics, HitBand } from './gridInsertGeometry';
import type { AppItem, FolderItem, GridItem } from './types';

/** 4 列 × 100px 的网格，原点在 (0,0)：0 号格中心 (50,50)，1 号格中心 (150,50)。 */
const METRICS: GridMetrics = {
  left: 0,
  top: 0,
  width: 400,
  height: 200,
  cols: 4,
  colStride: 100,
  rowStride: 100,
};

/** 比网格宽一圈的落点带 */
const BAND: HitBand = { left: -100, top: -100, right: 500, bottom: 300 };

const VIEWPORT_WIDTH = 1000;

function app(id: string): AppItem {
  return { id, kind: 'app', name: id, url: `https://example.com/${id}`, icon: '' };
}

function folder(id: string, children: AppItem[]): FolderItem {
  return { id, kind: 'folder', name: '文件夹', children };
}

function fakeClock() {
  let now = 0;
  let seq = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1;
      jobs.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => {
      jobs.delete(id);
    },
  };
  return {
    clock,
    /** 推进时间并按到期顺序开火 */
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...jobs.entries()]
          .filter(([, job]) => job.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        jobs.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    pending: () => jobs.size,
  };
}

function applyOrder(items: GridItem[], order: string[]): GridItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const next: GridItem[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item) continue;
    next.push(item);
    byId.delete(id);
  }
  for (const item of items) if (byId.has(item.id)) next.push(item);
  return next;
}

type HarnessOptions = {
  scope?: Scope;
  items?: GridItem[];
  pageIndex?: number;
  pageCount?: number;
  /** 文件夹壳矩形；给了才有「拖出关窗」 */
  outsideRect?: HitBand | null;
  pageDrop?: PageDropTarget | null;
  /** 传 null 模拟量不到网格（拖拽中理论上不会发生） */
  metrics?: GridMetrics | null;
};

function harness(options: HarnessOptions = {}) {
  const clock = fakeClock();
  const events: AppGridEvent[] = [];
  let items = options.items ?? [app('a'), app('b'), app('c')];
  let visuals: DragVisuals = {
    activeId: null,
    dwellTargetId: null,
    mergeReady: false,
    edgeSide: null,
  };
  let outsideDwells = 0;

  const session = createGridDragSession({
    scope: options.scope ?? 'page',
    clock: clock.clock,
    getItems: () => items,
    getPaging: () => ({
      pageIndex: options.pageIndex ?? 0,
      pageCount: options.pageCount ?? 1,
    }),
    readMetrics: () => (options.metrics === undefined ? METRICS : options.metrics),
    readHitBand: () => BAND,
    readOutsideRect: () => options.outsideRect ?? null,
    readPageDropTarget: () => options.pageDrop ?? null,
    viewportWidth: () => VIEWPORT_WIDTH,
    onEvent: (event) => {
      events.push(event);
      // 宿主会把换位写回状态，网格随之变序；不模拟就测不到「插完不抖」。
      if (event.type === 'reorderPage' || event.type === 'reorderFolder') {
        items = applyOrder(items, event.order);
      }
    },
    onVisuals: (next) => {
      visuals = next;
    },
    onOutsideDwell: () => {
      outsideDwells += 1;
    },
  });

  return {
    session,
    clock,
    events,
    types: () => events.map((e) => e.type),
    get visuals() {
      return visuals;
    },
    ids: () => items.map((i) => i.id),
    outsideDwells: () => outsideDwells,
  };
}

describe('合文件夹停住', () => {
  it('中心停不够 400ms 不合，够了才亮', () => {
    const h = harness();
    h.session.start('a');
    h.session.move(150, 50);

    h.clock.advance(MERGE_DWELL_MS - 1);
    expect(h.visuals.mergeReady).toBe(false);
    expect(h.visuals.dwellTargetId).toBe('b');

    h.clock.advance(1);
    expect(h.visuals.mergeReady).toBe(true);
  });

  it('停够后松手发 merge', () => {
    const h = harness();
    h.session.start('a');
    h.session.move(150, 50);
    h.clock.advance(MERGE_DWELL_MS);
    h.session.end(false);

    expect(h.events.at(-1)).toEqual({ type: 'merge', fromId: 'a', ontoId: 'b' });
  });

  it('停在文件夹上松手发 intoFolder', () => {
    const h = harness({ items: [app('a'), folder('f', [app('x'), app('y')])] });
    h.session.start('a');
    h.session.move(150, 50);
    h.clock.advance(MERGE_DWELL_MS);
    h.session.end(false);

    expect(h.events.at(-1)).toEqual({ type: 'intoFolder', appId: 'a', folderId: 'f' });
  });

  it('停够后移开则不合，只发 endDrag', () => {
    const h = harness();
    h.session.start('a');
    h.session.move(150, 50);
    h.clock.advance(MERGE_DWELL_MS);
    h.session.move(190, 50);
    expect(h.visuals.mergeReady).toBe(false);

    h.session.end(false);
    expect(h.events.at(-1)).toEqual({ type: 'endDrag' });
  });

  it('文件夹内停中心不合文件夹，按换位处理', () => {
    const h = harness({ scope: 'folder' });
    h.session.start('a');
    h.session.move(150, 50);
    h.clock.advance(MERGE_DWELL_MS);

    expect(h.visuals.mergeReady).toBe(false);
    h.session.end(false);
    expect(h.types()).toEqual(['beginDrag', 'endDrag']);
  });
});

describe('停住换位', () => {
  it('边缘停 220ms 发 reorderPage，顺序正确', () => {
    const h = harness();
    h.session.start('a');
    h.session.move(190, 50);

    h.clock.advance(INSERT_DWELL_MS - 1);
    expect(h.types()).toEqual(['beginDrag']);

    h.clock.advance(1);
    expect(h.events.at(-1)).toEqual({ type: 'reorderPage', order: ['b', 'a', 'c'] });
  });

  it('插完指针不动不再抖', () => {
    const h = harness();
    h.session.start('a');
    h.session.move(190, 50);
    h.clock.advance(INSERT_DWELL_MS);
    h.session.move(190, 50);
    h.clock.advance(INSERT_DWELL_MS * 3);

    expect(h.types().filter((t) => t === 'reorderPage')).toHaveLength(1);
    expect(h.ids()).toEqual(['b', 'a', 'c']);
  });

  it('不足 220ms 就移走不换位', () => {
    const h = harness();
    h.session.start('a');
    h.session.move(190, 50);
    h.clock.advance(INSERT_DWELL_MS - 20);
    h.session.move(50, 50);
    h.clock.advance(INSERT_DWELL_MS * 2);

    expect(h.types()).toEqual(['beginDrag']);
  });

  it('已在目标位置则不动', () => {
    const h = harness();
    h.session.start('a');
    // 1 号格左半边 = 插到 1 号位，而 a 本来就在它前面
    h.session.move(110, 50);
    h.clock.advance(INSERT_DWELL_MS * 2);

    expect(h.types()).toEqual(['beginDrag']);
  });

  it('落点带：网格下方到末位，网格左侧到首位', () => {
    const below = harness();
    below.session.start('a');
    below.session.move(200, 250);
    below.clock.advance(INSERT_DWELL_MS);
    expect(below.events.at(-1)).toEqual({ type: 'reorderPage', order: ['b', 'c', 'a'] });

    const left = harness();
    left.session.start('c');
    left.session.move(-50, 50);
    left.clock.advance(INSERT_DWELL_MS);
    expect(left.events.at(-1)).toEqual({ type: 'reorderPage', order: ['c', 'a', 'b'] });
  });
});

describe('边缘翻页', () => {
  it('边缘停 400ms 翻页，蓝条随之亮灭', () => {
    const h = harness({ pageIndex: 0, pageCount: 2 });
    h.session.start('a');
    h.session.move(VIEWPORT_WIDTH - 10, 50);
    expect(h.visuals.edgeSide).toBe('right');

    h.clock.advance(PAGE_FLIP_DWELL_MS);
    expect(h.events.at(-1)).toEqual({ type: 'pageFlip', toPage: 1 });
    expect(h.visuals.edgeSide).toBeNull();
  });

  it('冷却 650ms 内不再翻，冷却过后可以', () => {
    const h = harness({ pageIndex: 0, pageCount: 3 });
    h.session.start('a');
    h.session.move(VIEWPORT_WIDTH - 10, 50);
    h.clock.advance(PAGE_FLIP_DWELL_MS);
    expect(h.types().filter((t) => t === 'pageFlip')).toHaveLength(1);

    h.session.move(VIEWPORT_WIDTH - 10, 50);
    h.clock.advance(PAGE_FLIP_DWELL_MS);
    expect(h.types().filter((t) => t === 'pageFlip')).toHaveLength(1);

    h.clock.advance(PAGE_FLIP_COOLDOWN_MS);
    h.session.move(VIEWPORT_WIDTH - 10, 50);
    h.clock.advance(PAGE_FLIP_DWELL_MS);
    expect(h.types().filter((t) => t === 'pageFlip')).toHaveLength(2);
  });

  it('只有一页或已在端页不翻', () => {
    const single = harness({ pageIndex: 0, pageCount: 1 });
    single.session.start('a');
    single.session.move(VIEWPORT_WIDTH - 10, 50);
    single.clock.advance(PAGE_FLIP_DWELL_MS);
    expect(single.types()).toEqual(['beginDrag']);

    const last = harness({ pageIndex: 1, pageCount: 2 });
    last.session.start('a');
    last.session.move(VIEWPORT_WIDTH - 10, 50);
    last.clock.advance(PAGE_FLIP_DWELL_MS);
    expect(last.types()).toEqual(['beginDrag']);
  });

  it('进翻页热区清掉合文件夹待定', () => {
    const h = harness({ pageIndex: 0, pageCount: 2 });
    h.session.start('a');
    h.session.move(150, 50);
    h.clock.advance(MERGE_DWELL_MS - 50);
    expect(h.visuals.dwellTargetId).toBe('b');

    h.session.move(VIEWPORT_WIDTH - 10, 50);
    expect(h.visuals.dwellTargetId).toBeNull();

    h.clock.advance(MERGE_DWELL_MS);
    expect(h.types()).toEqual(['beginDrag', 'pageFlip']);
  });
});

describe('拖出文件夹', () => {
  const shell: HitBand = { left: 0, top: 0, right: 400, bottom: 200 };
  const pageDrop: PageDropTarget = { metrics: METRICS, band: BAND, occupiedCount: 2 };

  it('壳外停 320ms 关窗一次，回壳内也不重开', () => {
    const h = harness({ scope: 'folder', outsideRect: shell, pageDrop });
    h.session.start('a');
    h.session.move(600, 400);

    h.clock.advance(OUTSIDE_DWELL_MS - 1);
    expect(h.outsideDwells()).toBe(0);

    h.clock.advance(1);
    expect(h.outsideDwells()).toBe(1);

    h.session.move(150, 50);
    h.clock.advance(OUTSIDE_DWELL_MS * 2);
    expect(h.outsideDwells()).toBe(1);
  });

  it('关窗后松手发 eject，落点按主网格算', () => {
    const h = harness({ scope: 'folder', outsideRect: shell, pageDrop });
    h.session.start('a');
    h.session.move(600, 400);
    h.clock.advance(OUTSIDE_DWELL_MS);
    // 落在主网格 0 号格右半边 → 插到 1 号位
    h.session.move(90, 50);
    h.session.end(false);

    expect(h.events.at(-1)).toEqual({ type: 'eject', appId: 'a', insertAt: 1 });
  });

  it('关窗后按 Esc 只回滚，不 eject', () => {
    const h = harness({ scope: 'folder', outsideRect: shell, pageDrop });
    h.session.start('a');
    h.session.move(600, 400);
    h.clock.advance(OUTSIDE_DWELL_MS);
    h.session.end(true);

    expect(h.events.at(-1)).toEqual({ type: 'cancelDrag' });
  });
});

describe('会话生命周期', () => {
  it('按下发 beginDrag，Esc 发 cancelDrag，普通松手发 endDrag', () => {
    const canceled = harness();
    canceled.session.start('a');
    canceled.session.end(true);
    expect(canceled.types()).toEqual(['beginDrag', 'cancelDrag']);

    const dropped = harness();
    dropped.session.start('a');
    dropped.session.end(false);
    expect(dropped.types()).toEqual(['beginDrag', 'endDrag']);
  });

  it('停够了但源或目标已经没了，仍要发 endDrag 收尾', () => {
    const items: GridItem[] = [app('a'), app('b')];
    const h = harness({ items });
    h.session.start('a');
    h.session.move(150, 50);
    h.clock.advance(MERGE_DWELL_MS);
    expect(h.visuals.mergeReady).toBe(true);

    // 拖着的时候那两颗被别处换掉了（例如设置里重置）
    items.splice(0, items.length, app('c'));
    h.session.end(false);

    // 不发事件的话 dragSnapshot 会一直挂着，之后再也不 persist
    expect(h.types().at(-1)).toBe('endDrag');
  });

  it('文件夹内到了屏幕边缘也不翻页', () => {
    const h = harness({ scope: 'folder', pageIndex: 0, pageCount: 3 });
    h.session.start('a');
    h.session.move(VIEWPORT_WIDTH - 10, 50);
    h.clock.advance(PAGE_FLIP_DWELL_MS);

    expect(h.types()).not.toContain('pageFlip');
    expect(h.visuals.edgeSide).toBeNull();
  });

  it('量不到网格就什么都不判定', () => {
    const h = harness({ metrics: null });
    h.session.start('a');
    h.session.move(150, 50);
    h.clock.advance(MERGE_DWELL_MS * 2);

    expect(h.types()).toEqual(['beginDrag']);
    expect(h.visuals.dwellTargetId).toBeNull();
  });

  it('松手与卸载后迟到的定时器不再开火', () => {
    const ended = harness();
    ended.session.start('a');
    ended.session.move(190, 50);
    ended.session.end(false);
    ended.clock.advance(INSERT_DWELL_MS * 2);
    expect(ended.types()).toEqual(['beginDrag', 'endDrag']);

    const disposed = harness();
    disposed.session.start('a');
    disposed.session.move(150, 50);
    disposed.session.dispose();
    disposed.clock.advance(MERGE_DWELL_MS * 2);
    expect(disposed.clock.pending()).toBe(0);
    expect(disposed.visuals.mergeReady).toBe(false);
  });
});
