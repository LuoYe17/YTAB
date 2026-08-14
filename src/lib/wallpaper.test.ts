import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, type WallpaperState } from './types';
import type { WallpaperFailReason } from './wallpaperFail';
import {
  createWallpaperSession,
  createWallpaperSurface,
  pickUnseenWallpaperHit,
  todayLocal,
  wallhavenSearchParams,
  type WallpaperItem,
} from './wallpaper';

function item(id: string): WallpaperItem {
  return { imageUrl: `data:${id}`, wallhavenId: id, fetchedOn: '2099-01-01' };
}

describe('mergeSettings', () => {
  it('旧设置缺字段则补上默认动漫和随机', () => {
    const s = mergeSettings({ openTarget: 'new' });
    expect(s.openTarget).toBe('new');
    expect(s.wallhavenCategories).toEqual(DEFAULT_SETTINGS.wallhavenCategories);
    expect(s.wallhavenSorting).toBe('random');
    expect(s.wallhavenApiKey).toBe('');
  });
});

describe('wallhavenSearchParams', () => {
  it('默认随机、只要动漫、不带关键词、桌面比例仍在', () => {
    const p = wallhavenSearchParams(DEFAULT_SETTINGS);
    expect(p.get('sorting')).toBe('random');
    expect(p.get('topRange')).toBeNull();
    expect(p.get('q')).toBeNull();
    expect(p.get('purity')).toBe('100');
    expect(p.get('categories')).toBe('010');
    expect(p.get('atleast')).toBe('1920x1080');
    expect(p.get('ratios')).toBe('16x9,16x10');
    expect(p.get('apikey')).toBeNull();
  });

  it('密钥不进查询串', () => {
    const p = wallhavenSearchParams({ ...DEFAULT_SETTINGS, wallhavenApiKey: 'secret-key' });
    expect(p.get('apikey')).toBeNull();
  });

  it('第 1 页不写 page；随机才带 seed', () => {
    const hot = { ...DEFAULT_SETTINGS, wallhavenSorting: 'toplist' as const };
    expect(wallhavenSearchParams(hot, { page: 1, seed: 'abc123' }).get('page')).toBeNull();
    expect(wallhavenSearchParams(hot, { page: 1, seed: 'abc123' }).get('seed')).toBeNull();
    expect(wallhavenSearchParams(DEFAULT_SETTINGS, { page: 3 }).get('page')).toBe('3');
    const random = wallhavenSearchParams(DEFAULT_SETTINGS, { page: 2, seed: 'abc123' });
    expect(random.get('sorting')).toBe('random');
    expect(random.get('page')).toBe('2');
    expect(random.get('seed')).toBe('abc123');
  });

  it('热门才带近一月 topRange', () => {
    const p = wallhavenSearchParams({ ...DEFAULT_SETTINGS, wallhavenSorting: 'toplist' });
    expect(p.get('sorting')).toBe('toplist');
    expect(p.get('topRange')).toBe('1M');
  });

  it('选了标签则按空格写入 q', () => {
    const p = wallhavenSearchParams({
      ...DEFAULT_SETTINGS,
      wallhavenTags: ['anime girls', 'night'],
    });
    expect(p.get('q')).toBe('anime girls night');
  });

  it('当前分类没有的标签不写入 q', () => {
    const p = wallhavenSearchParams({
      ...DEFAULT_SETTINGS,
      wallhavenCategories: { general: true, anime: false, people: false },
      wallhavenTags: ['anime girls', 'night'],
    });
    expect(p.get('q')).toBe('night');
  });
});

describe('wallpaper session', () => {
  it('prepare 成功后 commit 交出成图，busy 在两次调用之间锁住', async () => {
    const acquired: WallpaperItem[] = [];
    const session = createWallpaperSession({
      acquire: async () => {
        const next = item('a');
        acquired.push(next);
        return { ok: true, item: next };
      },
      decode: async () => {},
    });

    const preparing = session.prepare(DEFAULT_SETTINGS);
    expect(session.busy).toBe(true);
    expect(await session.prepare(DEFAULT_SETTINGS)).toEqual({ ok: false, reason: 'busy' });
    expect(await preparing).toEqual({ ok: true });

    const committed = session.commit();
    expect(committed?.wallhavenId).toBe('a');
    expect(session.busy).toBe(false);
    expect(session.commit()).toBeNull();
    expect(acquired).toHaveLength(1);
  });

  it('acquire 失败则 prepare 为 false，commit 为空', async () => {
    const session = createWallpaperSession({
      acquire: async () => ({ ok: false, reason: 'empty' }),
      decode: async () => {},
    });
    expect(await session.prepare(DEFAULT_SETTINGS)).toEqual({ ok: false, reason: 'empty' });
    expect(session.busy).toBe(false);
    expect(session.commit()).toBeNull();
  });

  it('ensure：未到日界则 keep，不 acquire', async () => {
    let calls = 0;
    const session = createWallpaperSession({
      acquire: async () => {
        calls += 1;
        return { ok: true, item: item('x') };
      },
      decode: async () => {},
    });
    const current: WallpaperState = {
      imageUrl: 'data:cur',
      fetchedOn: todayLocal(),
      wallhavenId: 'cur',
    };
    expect(await session.ensure(DEFAULT_SETTINGS, current, false)).toEqual({ kind: 'keep' });
    expect(calls).toBe(0);
  });

  it('ensure：日更会 beforeDaily 再换图', async () => {
    let cleared = 0;
    const session = createWallpaperSession({
      acquire: async () => ({ ok: true, item: item('n') }),
      decode: async () => {},
      beforeDaily: () => {
        cleared += 1;
      },
    });
    const current: WallpaperState = {
      imageUrl: 'data:old',
      fetchedOn: '2000-01-01',
      wallhavenId: 'old',
    };
    const result = await session.ensure(DEFAULT_SETTINGS, current, false);
    expect(cleared).toBe(1);
    expect(result).toEqual({ kind: 'switched', item: item('n') });
  });
});

/** 假介质 + 假时钟 + 手动排期，好把预取池的日界与丢弃逻辑一起验证。 */
function harness(startDay = '2026-08-13') {
  const displayed: string[] = [];
  const persisted: WallpaperState[] = [];
  const scheduled: (() => Promise<void>)[] = [];
  let day = startDay;
  let seq = 0;
  let fetches = 0;
  let failNext: WallpaperFailReason | null = null;
  let fixedId: string | null = null;
  let persistFails = false;
  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;

  const surface = createWallpaperSurface({
    onDisplay: (url) => displayed.push(url),
    persist: async (wp) => {
      if (persistFails) throw new Error('disk down');
      persisted.push(wp);
    },
    fetch: async (_settings, exclude = new Set()) => {
      fetches += 1;
      if (gate) await gate;
      if (failNext) {
        const reason = failNext;
        failNext = null;
        return { ok: false, reason };
      }
      if (fixedId) {
        if (exclude.has(fixedId)) return { ok: false, reason: 'empty' };
        return { ok: true, item: { imageUrl: `data:${fixedId}`, wallhavenId: fixedId, fetchedOn: day } };
      }
      for (let i = 0; i < 32; i++) {
        seq += 1;
        const id = `id${seq}`;
        if (!exclude.has(id)) {
          return { ok: true, item: { imageUrl: `data:${id}`, wallhavenId: id, fetchedOn: day } };
        }
      }
      return { ok: false, reason: 'empty' };
    },
    decode: async () => {},
    today: () => day,
    schedule: (run) => scheduled.push(run),
  });

  return {
    surface,
    displayed,
    persisted,
    shown: () => displayed.at(-1),
    fetches: () => fetches,
    setDay: (d: string) => {
      day = d;
    },
    failOnce: (reason: WallpaperFailReason) => {
      failNext = reason;
    },
    alwaysSameId: (id: string) => {
      fixedId = id;
    },
    breakPersist: () => {
      persistFails = true;
    },
    /** 卡住取图，用来制造「预取还在路上」 */
    holdFetch: () => {
      gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
    },
    releaseFetch: async () => {
      openGate?.();
      gate = null;
      openGate = null;
      await new Promise((r) => setTimeout(r, 0));
    },
    /** 跑掉排队的预取（生产走 idle callback） */
    settleFills: async () => {
      for (const job of scheduled.splice(0)) await job();
    },
    /** 只启动排队的预取，不等它完成 */
    startFills: () => scheduled.splice(0).map((job) => job()),
  };
}

function stored(imageUrl: string, fetchedOn: string, id = 'cur'): WallpaperState {
  return { imageUrl, fetchedOn, wallhavenId: id };
}

describe('wallpaper surface', () => {
  it('同一天不换图，也不落盘', async () => {
    const h = harness();
    await h.surface.ensureDaily(DEFAULT_SETTINGS, stored('data:old', '2026-08-13'));

    expect(h.shown()).toBe('data:old');
    expect(h.persisted).toHaveLength(0);
    expect(h.fetches()).toBe(0);
  });

  it('跨日换图：上屏、落盘三项齐全', async () => {
    const h = harness();
    await h.surface.ensureDaily(DEFAULT_SETTINGS, stored('data:old', '2026-08-12'));

    expect(h.shown()).toBe('data:id1');
    expect(h.persisted).toEqual([
      { imageUrl: 'data:id1', fetchedOn: '2026-08-13', wallhavenId: 'id1' },
    ]);
  });

  it('跨日先作废旧池，不拿昨天的预取图上屏', async () => {
    const h = harness();
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();
    const prefetched = h.fetches();

    h.setDay('2026-08-14');
    await h.surface.ensureDaily(DEFAULT_SETTINGS, stored('data:old', '2026-08-13'));

    expect(h.fetches()).toBe(prefetched + 1);
    expect(h.shown()).toBe(`data:id${prefetched + 1}`);
  });

  it('日更失败则维持原图，不落盘', async () => {
    const h = harness();
    h.failOnce('network');
    await h.surface.ensureDaily(DEFAULT_SETTINGS, stored('data:old', '2026-08-12'));

    expect(h.shown()).toBe('data:old');
    expect(h.persisted).toHaveLength(0);
  });

  it('准备阶段只解码不上屏，提交才上屏落盘', async () => {
    const h = harness();
    h.surface.restore(stored('data:old', '2026-08-13'));

    expect(await h.surface.prepare(DEFAULT_SETTINGS)).toEqual({ ok: true });
    expect(h.shown()).toBe('data:old');
    expect(h.persisted).toHaveLength(0);

    await h.surface.commit(DEFAULT_SETTINGS);
    expect(h.shown()).toBe('data:id1');
    expect(h.persisted).toHaveLength(1);
  });

  it('准备期间再点返回 busy', async () => {
    const h = harness();
    const first = h.surface.prepare(DEFAULT_SETTINGS);
    expect(await h.surface.prepare(DEFAULT_SETTINGS)).toEqual({ ok: false, reason: 'busy' });
    expect(await first).toEqual({ ok: true });
  });

  it('准备失败原样返回，不上屏不落盘', async () => {
    const h = harness();
    h.failOnce('empty');

    expect(await h.surface.prepare(DEFAULT_SETTINGS)).toEqual({ ok: false, reason: 'empty' });
    expect(h.displayed).toHaveLength(0);
    await h.surface.commit(DEFAULT_SETTINGS);
    expect(h.persisted).toHaveLength(0);
  });

  it('落盘失败要抛出去：图已上屏，咽下去下次打开就变回旧图', async () => {
    const h = harness();
    await h.surface.prepare(DEFAULT_SETTINGS);
    h.breakPersist();

    await expect(h.surface.commit(DEFAULT_SETTINGS)).rejects.toThrow();
    expect(h.shown()).toBe('data:id1');
  });

  it('改筛选：清池重新预取，但不动上屏', async () => {
    const h = harness();
    h.surface.restore(stored('data:old', '2026-08-13'));
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();

    expect(h.shown()).toBe('data:old');
    expect(h.persisted).toHaveLength(0);
    expect(h.fetches()).toBeGreaterThan(0);
  });

  it('导入 / 首启落地：上屏并接管预取，整份状态由调用方落盘', async () => {
    const h = harness();
    h.surface.adopt({ imageUrl: 'data:imported', wallhavenId: 'imp' }, DEFAULT_SETTINGS);

    expect(h.shown()).toBe('data:imported');
    expect(h.persisted).toHaveLength(0);
    await h.settleFills();
    expect(h.fetches()).toBeGreaterThan(0);
  });

  it('落地会丢掉旧池，换图不会端出上一份筛选的存货', async () => {
    const h = harness();
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();
    const beforeAdopt = h.fetches();

    h.surface.adopt({ imageUrl: 'data:imported', wallhavenId: 'imp' }, DEFAULT_SETTINGS);
    await h.surface.prepare(DEFAULT_SETTINGS);
    await h.surface.commit(DEFAULT_SETTINGS);

    expect(h.shown()).toBe(`data:id${beforeAdopt + 1}`);
  });

  it('池里有货就直接用，不再发请求', async () => {
    const h = harness();
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();
    const filled = h.fetches();

    await h.surface.prepare(DEFAULT_SETTINGS);
    expect(h.fetches()).toBe(filled);
    await h.surface.commit(DEFAULT_SETTINGS);
    expect(h.shown()).toBe('data:id1');
  });

  it('预取满 3 张即停', async () => {
    const h = harness();
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();

    expect(h.fetches()).toBe(3);
  });

  it('跨了一天，池里昨天的存货作废', async () => {
    const h = harness();
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();
    const filled = h.fetches();

    // 不走日更，直接手动换一张：取货这一步自己会发现换天了
    h.setDay('2026-08-14');
    await h.surface.prepare(DEFAULT_SETTINGS);
    await h.surface.commit(DEFAULT_SETTINGS);

    expect(h.fetches()).toBe(filled + 1);
    expect(h.shown()).toBe(`data:id${filled + 1}`);
  });

  it('改筛选后，还在路上的预取结果被丢掉', async () => {
    const h = harness();
    h.holdFetch();
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    const inflight = h.startFills();
    expect(h.fetches()).toBe(1);

    // 用户又改了筛选：这批货是按旧条件拉的，不能要
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.releaseFetch();
    await Promise.all(inflight);
    await h.settleFills();

    // 池里只能是第二轮拉的；第一轮那张不该被端上来
    await h.surface.prepare(DEFAULT_SETTINGS);
    await h.surface.commit(DEFAULT_SETTINGS);
    expect(h.shown()).not.toBe('data:id1');
  });

  it('重置本机：清掉上屏与旧池，且不在首启界面偷偷预取', async () => {
    const h = harness();
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();
    const filled = h.fetches();

    h.surface.forget();
    await h.settleFills();

    expect(h.shown()).toBe('');
    expect(h.fetches()).toBe(filled);
  });

  it('首次启动没拿到图，也要把池子备起来', async () => {
    const h = harness();
    h.surface.adopt(null, DEFAULT_SETTINGS);
    await h.settleFills();

    expect(h.displayed).toHaveLength(0);
    expect(h.fetches()).toBeGreaterThan(0);
  });

  it('看过的图不再入池，抽尽则换图失败，不上同一张', async () => {
    const h = harness();
    h.alwaysSameId('dup');
    await h.surface.ensureDaily(DEFAULT_SETTINGS, stored('data:old', '2026-08-12'));
    const afterLand = h.fetches();
    await h.settleFills();

    expect(h.fetches()).toBe(afterLand + 1);
    expect(await h.surface.prepare(DEFAULT_SETTINGS)).toEqual({ ok: false, reason: 'empty' });
    expect(h.shown()).toBe('data:dup');
  });

  it('改筛选后下一张不是当前上屏', async () => {
    const h = harness();
    h.surface.restore(stored('data:old', '2026-08-13', 'id1'));
    h.surface.onFiltersChanged(DEFAULT_SETTINGS);
    await h.settleFills();

    await h.surface.prepare(DEFAULT_SETTINGS);
    await h.surface.commit(DEFAULT_SETTINGS);
    expect(h.shown()).not.toBe('data:old');
    expect(h.persisted.at(-1)?.wallhavenId).not.toBe('id1');
  });

  it('池空直拉也不回已看的 id', async () => {
    const h = harness();
    h.surface.restore(stored('data:old', '2026-08-13', 'id1'));

    expect(await h.surface.prepare(DEFAULT_SETTINGS)).toEqual({ ok: true });
    await h.surface.commit(DEFAULT_SETTINGS);
    expect(h.shown()).toBe('data:id2');
  });
});

function searchJson(ids: string[], lastPage = 1) {
  return {
    data: ids.map((id) => ({ id, path: `https://example.test/${id}.jpg`, file_type: 'image/jpeg', purity: 'sfw' })),
    meta: { last_page: lastPage },
  };
}

describe('pickUnseenWallpaperHit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubPages(pages: Record<string, unknown>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        const page = new URL(u).searchParams.get('page') ?? '1';
        const body = pages[page] ?? searchJson([]);
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
  }

  it('跳过 exclude，从本页剩下的里抽', async () => {
    stubPages({ '1': searchJson(['a', 'b']) });
    await expect(pickUnseenWallpaperHit(DEFAULT_SETTINGS, new Set(['a']))).resolves.toEqual({
      ok: true,
      hit: { id: 'b', path: 'https://example.test/b.jpg' },
    });
  });

  it('本页都看过则换页', async () => {
    stubPages({ '1': searchJson(['a'], 2), '2': searchJson(['b'], 2) });
    const got = await pickUnseenWallpaperHit(DEFAULT_SETTINGS, new Set(['a']));
    expect(got).toEqual({ ok: true, hit: { id: 'b', path: 'https://example.test/b.jpg' } });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('page=2');
  });

  it('抽尽则 empty，不当成换成功', async () => {
    stubPages({ '1': searchJson(['a']) });
    await expect(pickUnseenWallpaperHit(DEFAULT_SETTINGS, new Set(['a']))).resolves.toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('随机排序带 seed，同一轮换页共用', async () => {
    stubPages({ '1': searchJson(['a'], 2), '2': searchJson(['b'], 2) });
    await pickUnseenWallpaperHit({ ...DEFAULT_SETTINGS, wallhavenSorting: 'random' }, new Set(['a']));
    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
    const seeds = urls.map((u) => new URL(u).searchParams.get('seed'));
    expect(seeds[0]).toBeTruthy();
    expect(seeds[1]).toBe(seeds[0]);
    expect(urls[0]).not.toContain('page=');
    expect(urls[1]).toContain('page=2');
  });
});
