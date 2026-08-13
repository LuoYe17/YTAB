import { describe, expect, it } from 'vitest';
import { scrollbarThumb, scrollTopFromThumb } from './scrollbar';

describe('scrollbarThumb', () => {
  it('内容未超出则没有滑块', () => {
    expect(scrollbarThumb(200, 180, 0, 200)).toBeNull();
  });

  it('滑块高度按可见比例，位置按滚动进度', () => {
    const t = scrollbarThumb(100, 200, 50, 100, 10);
    expect(t).toEqual({ top: 25, height: 50 });
  });

  it('内容很长时滑块不低于 minThumb', () => {
    const t = scrollbarThumb(100, 2000, 0, 100, 32);
    expect(t?.height).toBe(32);
    expect(t?.top).toBe(0);
  });
});

describe('scrollTopFromThumb', () => {
  it('滑块拖到最底则滚到最底', () => {
    expect(scrollTopFromThumb(50, 50, 100, 100, 200)).toBe(100);
  });
});
