import { describe, expect, it } from 'vitest';
import { dropdownOpensUp } from './dropdownPlacement';

describe('dropdownOpensUp', () => {
  const gap = 6;
  const menu = 120;

  it('下方够高则向下', () => {
    expect(dropdownOpensUp({ top: 100, bottom: 140 }, menu, 800, gap)).toBe(false);
  });

  it('下方不够且上方更宽则向上', () => {
    expect(dropdownOpensUp({ top: 500, bottom: 540 }, menu, 600, gap)).toBe(true);
  });

  it('两边都不够时选空间更大的一侧', () => {
    expect(dropdownOpensUp({ top: 40, bottom: 80 }, menu, 160, gap)).toBe(false);
    expect(dropdownOpensUp({ top: 80, bottom: 120 }, menu, 160, gap)).toBe(true);
  });

  it('上下剩余空间相等则向下', () => {
    expect(dropdownOpensUp({ top: 80, bottom: 120 }, menu, 200, gap)).toBe(false);
  });
});
