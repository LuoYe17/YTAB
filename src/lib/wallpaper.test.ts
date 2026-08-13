import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, type WallpaperState } from './types';
import {
  createWallpaperSession,
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
