import { describe, expect, it } from 'vitest';
import { applyImportedState, holdFirstRun } from './importApply';
import { createEmptyState, DEFAULT_SETTINGS, type AppItem, type YtabState } from './types';

function app(id: string): AppItem {
  return { id, kind: 'app', name: id, url: `https://${id}.example`, icon: '' };
}

describe('applyImportedState', () => {
  it('导入缺字段设置时补默认，并结束首次启动', () => {
    const raw = {
      ...createEmptyState(),
      onboardingDone: false,
      settings: { openTarget: 'new' },
      wallpaper: { imageUrl: 'https://example.com/w.jpg', fetchedOn: '2026-01-01' },
    } as YtabState;

    const { state } = applyImportedState(raw);

    expect(state.onboardingDone).toBe(true);
    expect(state.settings.openTarget).toBe('new');
    expect(state.settings.wallhavenCategories).toEqual(DEFAULT_SETTINGS.wallhavenCategories);
    expect(state.settings.wallhavenSorting).toBe(DEFAULT_SETTINGS.wallhavenSorting);
    expect(state.settings.wallhavenPurity).toEqual(DEFAULT_SETTINGS.wallhavenPurity);
    expect(state.settings.wallhavenTags).not.toBe(DEFAULT_SETTINGS.wallhavenTags);
    expect(state.wallpaper.imageUrl).toBe('https://example.com/w.jpg');
  });

  it('重置 endFirstRun:false 时保留 createEmptyState 的首次启动未完成', () => {
    const { state } = applyImportedState(createEmptyState(), { endFirstRun: false });

    expect(state.onboardingDone).toBe(false);
    expect(state.settings).toEqual(createEmptyState().settings);
    expect(state.wallpaper.imageUrl).toBe('');
  });

  it('壁纸缺字段时走空默认', () => {
    const missing = applyImportedState({
      ...createEmptyState(),
      wallpaper: { fetchedOn: '2026-08-13' } as YtabState['wallpaper'],
    });
    expect(missing.state.wallpaper.imageUrl).toBe('');
    expect(missing.state.wallpaper.fetchedOn).toBe('2026-08-13');
  });

  it('缺 wallpaper 整节也不抛', () => {
    const raw = { ...createEmptyState() } as YtabState;
    delete (raw as { wallpaper?: YtabState['wallpaper'] }).wallpaper;
    const { state } = applyImportedState(raw);
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

  it('扫描态 hold 保住 App，不把首次启动标成已完成', () => {
    const { state } = applyImportedState({
      ...createEmptyState(),
      pages: [[app('a')]],
    });
    expect(state.onboardingDone).toBe(true);
    expect(state.pages[0]).toHaveLength(1);

    const held = holdFirstRun(state);
    expect(held.onboardingDone).toBe(false);
    expect(held.pages[0]).toEqual(state.pages[0]);
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
});
