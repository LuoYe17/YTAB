import { describe, expect, it } from 'vitest';
import { wallpaperFailHint } from './wallpaperFail';

describe('wallpaperFailHint', () => {
  it('网络失败：指向 API Key', () => {
    const hint = wallpaperFailHint('network');
    expect(hint.focus).toBe('apiKey');
    expect(hint.link).toContain('API Key');
    expect(hint.before).toContain('(｡•́︿•̀｡)');
  });

  it('筛空：指向纯度与分类', () => {
    const hint = wallpaperFailHint('empty');
    expect(hint.focus).toBe('filters');
    expect(hint.link).toContain('纯度或分类');
    expect(hint.before).toContain('(´;ω;`)');
  });
});
