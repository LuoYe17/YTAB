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
  });

  it('invalidatePool 恒为 true', () => {
    expect(applyImportedState(createEmptyState()).invalidatePool).toBe(true);
    expect(applyImportedState(createEmptyState(), { endFirstRun: false }).invalidatePool).toBe(true);
  });
});
