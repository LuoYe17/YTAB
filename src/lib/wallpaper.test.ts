import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, type WallpaperState } from './types';
import type { WallpaperFailReason } from './wallpaperFail';
import {
  createWallpaperSession,
  createWallpaperSurface,
  todayLocal,
  wallhavenSearchParams,
  type WallpaperItem,
} from './wallpaper';

function item(id: string): WallpaperItem {
  return { imageUrl: `data:${id}`, wallhavenId: id, fetchedOn: '2099-01-01' };
}

describe('mergeSettings', () => {
  it('旧设置缺字段则补上默认动漫和热门', () => {
    const s = mergeSettings({ openTarget: 'new' });
    expect(s.openTarget).toBe('new');
    expect(s.wallhavenCategories).toEqual(DEFAULT_SETTINGS.wallhavenCategories);
    expect(s.wallhavenSorting).toBe('toplist');
    expect(s.wallhavenApiKey).toBe('');
  });
});

describe('wallhavenSearchParams', () => {
  it('默认热门近一月、只要动漫、不带关键词、桌面比例仍在', () => {
    const p = wallhavenSearchParams(DEFAULT_SETTINGS);
    expect(p.get('sorting')).toBe('toplist');
    expect(p.get('topRange')).toBe('1M');
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

  const surface = createWallpaperSurface({
    onDisplay: (url) => displayed.push(url),
    persist: async (wp) => {
      if (persistFails) throw new Error('disk down');
      persisted.push(wp);
    },
    fetch: async () => {
      fetches += 1;
      if (failNext) {
        const reason = failNext;
        failNext = null;
        return { ok: false, reason };
      }
      seq += 1;
      const id = fixedId ?? `id${seq}`;
      return { ok: true, item: { imageUrl: `data:${id}`, wallhavenId: id, fetchedOn: day } };
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
    /** 跑掉排队的预取（生产走 idle callback） */
    settleFills: async () => {
      for (const job of scheduled.splice(0)) await job();
    },
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

  it('看过的图不再入池，也不会把预取卡死', async () => {
    const h = harness();
    h.alwaysSameId('dup');
    await h.surface.ensureDaily(DEFAULT_SETTINGS, stored('data:old', '2026-08-12'));
    const afterLand = h.fetches();
    await h.settleFills();

    // 每张都是看过的 id，池仍是空的；guard 兜住，不会无限拉
    expect(h.fetches()).toBeGreaterThan(afterLand);
    expect(h.fetches()).toBeLessThanOrEqual(afterLand + 12);

    const before = h.fetches();
    await h.surface.prepare(DEFAULT_SETTINGS);
    expect(h.fetches()).toBe(before + 1);
  });
});
