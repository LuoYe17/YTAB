import { describe, expect, it } from 'vitest';
import { dropdownOpensUp, placeFloatingTip } from './dropdownPlacement';

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

describe('placeFloatingTip', () => {
  const tip = { width: 160, height: 40 };
  const view = { width: 400, height: 300 };

  it('下方够则朝下并水平居中', () => {
    const p = placeFloatingTip({ top: 40, left: 120, right: 140, bottom: 60, width: 20 }, tip, view);
    expect(p.top).toBe(68);
    expect(p.left).toBe(50);
  });

  it('贴底则翻到上面', () => {
    const p = placeFloatingTip({ top: 250, left: 20, right: 40, bottom: 270, width: 20 }, tip, view);
    expect(p.top).toBe(202);
  });

  it('贴右边则往回夹', () => {
    const p = placeFloatingTip({ top: 40, left: 380, right: 398, bottom: 60, width: 18 }, tip, view);
    expect(p.left).toBe(400 - 160 - 8);
  });
});
