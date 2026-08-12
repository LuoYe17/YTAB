import { describe, expect, it } from 'vitest';
import { wallpaperFailHint } from './wallpaperFail';

describe('wallpaperFailHint', () => {
  it('网络失败：指向密钥', () => {
    const hint = wallpaperFailHint('network');
    expect(hint.focus).toBe('apiKey');
    expect(hint.link).toBe('去设置 → 壁纸填个密钥');
    expect(hint.before).toContain('(｡•́︿•̀｡)');
  });

  it('筛空：指向纯度与分类', () => {
    const hint = wallpaperFailHint('empty');
    expect(hint.focus).toBe('filters');
    expect(hint.link).toContain('纯度或分类');
    expect(hint.before).toContain('(´;ω;`)');
  });
});
