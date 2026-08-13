import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './types';
import {
  applyFilter,
  purityAfterClearingKey,
  isTurningOffLast,
  tagsAfterCategoriesChange,
  toggleCategory,
  togglePurity,
  visibleTagPresets,
} from './settingsFilters';

describe('togglePurity', () => {
  it('最后一项关不掉', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'sfw', false, true)).toEqual({
      sfw: true,
      sketchy: false,
      nsfw: false,
    });
  });

  it('没密钥不能开限制', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'nsfw', true, false).nsfw).toBe(
      false,
    );
  });

  it('有密钥可以开限制', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'nsfw', true, true).nsfw).toBe(
      true,
    );
  });

  it('可同时开多项', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'sketchy', true, true)).toEqual({
      sfw: true,
      sketchy: true,
      nsfw: false,
    });
  });
});

describe('isTurningOffLast', () => {
  it('只剩一项再关为 true', () => {
    expect(isTurningOffLast({ sfw: true, sketchy: false, nsfw: false }, 'sfw', false)).toBe(true);
  });

  it('多项开着时关掉其中一项为 false', () => {
    expect(isTurningOffLast({ sfw: true, sketchy: true, nsfw: false }, 'sfw', false)).toBe(false);
  });

  it('打开一项为 false', () => {
    expect(isTurningOffLast({ sfw: true, sketchy: false, nsfw: false }, 'sketchy', true)).toBe(false);
  });
});

describe('toggleCategory', () => {
  it('最后一项关不掉', () => {
    expect(
      toggleCategory({ general: true, anime: false, people: false }, 'general', false),
    ).toEqual({ general: true, anime: false, people: false });
  });

  it('可关掉非最后一项', () => {
    expect(
      toggleCategory({ general: true, anime: true, people: true }, 'anime', false),
    ).toEqual({ general: true, anime: false, people: true });
  });
});

describe('purityAfterClearingKey', () => {
  it('清空密钥则把限制关掉', () => {
    expect(purityAfterClearingKey({ sfw: true, sketchy: true, nsfw: true })).toEqual({
      sfw: true,
      sketchy: true,
      nsfw: false,
    });
  });

  it('只开着限制时清空密钥则改开安全', () => {
    expect(purityAfterClearingKey({ sfw: false, sketchy: false, nsfw: true })).toEqual({
      sfw: true,
      sketchy: false,
      nsfw: false,
    });
  });
});

describe('visibleTagPresets', () => {
  it('只开动漫则有少女、没有风景摄影词', () => {
    const ids = visibleTagPresets({ general: false, anime: true, people: false }).map((t) => t.id);
    expect(ids).toContain('anime girls');
    expect(ids).not.toContain('landscape');
  });

  it('只开常规则有风景、没有少女', () => {
    const ids = visibleTagPresets({ general: true, anime: false, people: false }).map((t) => t.id);
    expect(ids).toContain('landscape');
    expect(ids).not.toContain('anime girls');
  });

  it('多开分类时共用标签只出现一次', () => {
    const ids = visibleTagPresets({ general: true, anime: true, people: false }).map((t) => t.id);
    expect(ids.filter((id) => id === 'night')).toHaveLength(1);
  });

  it('分类缺字段时仍给出默认动漫菜单', () => {
    const ids = visibleTagPresets(undefined).map((t) => t.id);
    expect(ids).toContain('anime girls');
  });
});

describe('tagsAfterCategoriesChange', () => {
  it('关掉动漫则去掉少女，留下常规也有的夜', () => {
    expect(
      tagsAfterCategoriesChange(['anime girls', 'night'], {
        general: true,
        anime: false,
        people: false,
      }),
    ).toEqual(['night']);
  });
});

describe('applyFilter', () => {
  it('最后一项纯度关不掉并通知', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      wallhavenPurity: { sfw: true, sketchy: false, nsfw: false },
    };
    const result = applyFilter(settings, { type: 'purity', key: 'sfw', on: false });
    expect(result.settings).toBe(settings);
    expect(result.notice).toBe('纯度至少开一项');
    expect(result.invalidatePool).toBe(false);
  });

  it('最后一项分类关不掉并通知', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      wallhavenCategories: { general: false, anime: true, people: false },
    };
    const result = applyFilter(settings, { type: 'category', key: 'anime', on: false });
    expect(result.settings).toBe(settings);
    expect(result.notice).toBe('分类至少开一项');
    expect(result.invalidatePool).toBe(false);
  });

  it('没密钥开限制无效', () => {
    const settings = { ...DEFAULT_SETTINGS, wallhavenApiKey: '' };
    const result = applyFilter(settings, { type: 'purity', key: 'nsfw', on: true });
    expect(result.settings).toBe(settings);
    expect(result.settings.wallhavenPurity.nsfw).toBe(false);
    expect(result.notice).toBeUndefined();
    expect(result.invalidatePool).toBe(false);
  });

  it('关掉分类则去掉只属于它的标签并清池', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      wallhavenCategories: { general: true, anime: true, people: false },
      wallhavenTags: ['anime girls', 'night'],
    };
    const result = applyFilter(settings, { type: 'category', key: 'anime', on: false });
    expect(result.settings.wallhavenCategories).toEqual({
      general: true,
      anime: false,
      people: false,
    });
    expect(result.settings.wallhavenTags).toEqual(['night']);
    expect(result.invalidatePool).toBe(true);
    expect(result.notice).toBeUndefined();
  });

  it('改排序则清池', () => {
    const result = applyFilter(DEFAULT_SETTINGS, { type: 'sorting', value: 'random' });
    expect(result.settings.wallhavenSorting).toBe('random');
    expect(result.invalidatePool).toBe(true);
  });

  it('清空密钥若因此关了限制则清池', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      wallhavenApiKey: 'abc',
      wallhavenKeyOk: true,
      wallhavenPurity: { sfw: true, sketchy: false, nsfw: true },
    };
    const result = applyFilter(settings, { type: 'setKey', value: '' });
    expect(result.settings.wallhavenApiKey).toBe('');
    expect(result.settings.wallhavenKeyOk).toBe(false);
    expect(result.settings.wallhavenPurity).toEqual({ sfw: true, sketchy: false, nsfw: false });
    expect(result.invalidatePool).toBe(true);
  });

  it('改密钥但纯度没变则不清池', () => {
    const settings = { ...DEFAULT_SETTINGS, wallhavenApiKey: 'abc', wallhavenKeyOk: true };
    const result = applyFilter(settings, { type: 'setKey', value: 'xyz' });
    expect(result.settings.wallhavenApiKey).toBe('xyz');
    expect(result.settings.wallhavenKeyOk).toBe(false);
    expect(result.invalidatePool).toBe(false);
  });
});
