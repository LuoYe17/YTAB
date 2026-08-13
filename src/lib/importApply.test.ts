import { describe, expect, it } from 'vitest';
import { applyImportedState } from './importApply';
import { createEmptyState, DEFAULT_SETTINGS, type YtabState } from './types';

describe('applyImportedState', () => {
  it('导入缺字段设置时补默认，并结束首次启动', () => {
    const raw = {
      ...createEmptyState(),
      onboardingDone: false,
      settings: { openTarget: 'new' },
      wallpaper: { imageUrl: 'https://example.com/w.jpg', fetchedOn: '2026-01-01' },
    } as YtabState;

    const { state, invalidatePool, displayUrl } = applyImportedState(raw);

    expect(state.onboardingDone).toBe(true);
    expect(state.settings.openTarget).toBe('new');
    expect(state.settings.wallhavenCategories).toEqual(DEFAULT_SETTINGS.wallhavenCategories);
    expect(state.settings.wallhavenSorting).toBe(DEFAULT_SETTINGS.wallhavenSorting);
    expect(state.settings.wallhavenPurity).toEqual(DEFAULT_SETTINGS.wallhavenPurity);
    expect(state.settings.wallhavenTags).not.toBe(DEFAULT_SETTINGS.wallhavenTags);
    expect(invalidatePool).toBe(true);
    expect(displayUrl).toBe('https://example.com/w.jpg');
  });

  it('重置 endFirstRun:false 时保留 createEmptyState 的首次启动未完成', () => {
    const { state, invalidatePool, displayUrl } = applyImportedState(createEmptyState(), {
      endFirstRun: false,
    });

    expect(state.onboardingDone).toBe(false);
    expect(state.settings).toEqual(createEmptyState().settings);
    expect(invalidatePool).toBe(true);
    expect(displayUrl).toBe('');
  });

  it('displayUrl 取壁纸 imageUrl，缺省为空串', () => {
    const withUrl = applyImportedState({
      ...createEmptyState(),
      wallpaper: { imageUrl: 'blob:wp', fetchedOn: '2026-08-13' },
    });
    expect(withUrl.displayUrl).toBe('blob:wp');

    const missing = applyImportedState({
      ...createEmptyState(),
      wallpaper: { fetchedOn: '2026-08-13' } as YtabState['wallpaper'],
    });
    expect(missing.displayUrl).toBe('');
    expect(missing.state.wallpaper.imageUrl).toBe('');
    expect(missing.state.wallpaper.fetchedOn).toBe('2026-08-13');
  });

  it('缺 wallpaper 不抛，displayUrl 与壁纸走空默认', () => {
    const raw = { ...createEmptyState() } as YtabState;
    delete (raw as { wallpaper?: YtabState['wallpaper'] }).wallpaper;
    const { state, displayUrl } = applyImportedState(raw);
    expect(displayUrl).toBe('');
    expect(state.wallpaper.imageUrl).toBe('');
    expect(state.wallpaper.fetchedOn).toBe('');
  });

  it('wallhavenKeyOk 仅当严格 true 且密钥非空', () => {
    const dirty = applyImportedState({
      ...createEmptyState(),
      settings: { wallhavenKeyOk: 'false', wallhavenApiKey: 'abc' } as never,
    });
    expect(dirty.state.settings.wallhavenKeyOk).toBe(false);

    const noKey = applyImportedState({
      ...createEmptyState(),
      settings: { ...DEFAULT_SETTINGS, wallhavenKeyOk: true, wallhavenApiKey: '' },
    });
    expect(noKey.state.settings.wallhavenKeyOk).toBe(false);

    const ok = applyImportedState({
      ...createEmptyState(),
      settings: { ...DEFAULT_SETTINGS, wallhavenKeyOk: true, wallhavenApiKey: 'abc' },
    });
    expect(ok.state.settings.wallhavenKeyOk).toBe(true);
  });

  it('纯度/分类只收真正的 boolean，脏值回落默认字段', () => {
    const { state } = applyImportedState({
      ...createEmptyState(),
      settings: {
        wallhavenPurity: { sfw: 'false', sketchy: true, nsfw: 1 },
        wallhavenCategories: { general: true, anime: 'true', people: 0, extra: true },
      } as never,
    });
    expect(state.settings.wallhavenPurity).toEqual({ sfw: true, sketchy: true, nsfw: false });
    expect(state.settings.wallhavenCategories).toEqual({ general: true, anime: true, people: false });
    expect(state.settings.wallhavenCategories).not.toHaveProperty('extra');
  });

  it('invalidatePool 恒为 true', () => {
    expect(applyImportedState(createEmptyState()).invalidatePool).toBe(true);
    expect(applyImportedState(createEmptyState(), { endFirstRun: false }).invalidatePool).toBe(true);
  });
});
