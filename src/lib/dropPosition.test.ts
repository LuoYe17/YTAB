import { describe, expect, it } from 'vitest';
import { insertIndexForDrop, resolveDropTile, type DropTile } from './dropPosition';
import type { GridItem } from './types';

function tile(index: number, nx: number, ny: number): DropTile {
  return { index, nx, ny };
}

const APP: GridItem = { id: 'a', kind: 'app', name: 'a', url: 'https://a.example', icon: '' };

describe('insertIndexForDrop', () => {
  it('未命中（空白处）→ 追加到页尾', () => {
    expect(insertIndexForDrop(null, 5)).toBe(5);
  });

  it('落在磁贴中心邻域 → 插到目标之后', () => {
    expect(insertIndexForDrop(tile(2, 0.5, 0.5), 5)).toBe(3);
    expect(insertIndexForDrop(tile(2, 0.45, 0.48), 5)).toBe(3);
  });

  it('水平偏差更大：偏左插前、偏右插后', () => {
    expect(insertIndexForDrop(tile(2, 0.1, 0.5), 5)).toBe(2);
    expect(insertIndexForDrop(tile(2, 0.9, 0.5), 5)).toBe(3);
  });

  it('垂直偏差更大：偏上插前、偏下插后', () => {
    expect(insertIndexForDrop(tile(2, 0.5, 0.05), 5)).toBe(2);
    expect(insertIndexForDrop(tile(2, 0.5, 0.95), 5)).toBe(3);
  });

  it('边界：|dx|==|dy| 时归水平分支', () => {
    // dx=-0.2, dy=-0.3 → 垂直更大，走垂直分支 dy<0 → 前
    expect(insertIndexForDrop(tile(2, 0.3, 0.2), 5)).toBe(2);
  });

  it('对角线：|dx|==|dy| 时归水平', () => {
    // dx=0.2, dy=0.2 → 相等，走水平分支 dx>0 → 后
    expect(insertIndexForDrop(tile(2, 0.7, 0.7), 5)).toBe(3);
    // dx=-0.2, dy=0.2 → 相等，走水平分支 dx<0 → 前
    expect(insertIndexForDrop(tile(2, 0.3, 0.7), 5)).toBe(2);
  });

  it('首尾磁贴同样生效', () => {
    expect(insertIndexForDrop(tile(0, 0.99, 0.5), 5)).toBe(1);
    expect(insertIndexForDrop(tile(4, 0.01, 0.5), 5)).toBe(4);
  });
});

describe('resolveDropTile', () => {
  function fakeDoc(overrides: {
    tileId?: string;
    excludeHit?: boolean;
    rect?: { left: number; top: number; width: number; height: number };
  } = {}): Document {
    const tile = {
      closest: (sel: string) => (sel === '[data-tile-id]' ? tile : null),
      dataset: { tileId: overrides.tileId ?? 'a' },
      getBoundingClientRect: () => overrides.rect ?? { left: 100, top: 200, width: 50, height: 50 },
    };
    return {
      elementFromPoint: () => tile,
    } as unknown as Document;
  }

  const page = [APP];

  it('命中磁贴并算出归一化坐标', () => {
    const hit = resolveDropTile(fakeDoc(), page, 125, 225, 'x');
    expect(hit).toEqual({ index: 0, nx: 0.5, ny: 0.5 });
  });

  it('拖的是自己 → null（追加页尾）', () => {
    expect(resolveDropTile(fakeDoc(), page, 125, 225, 'a')).toBeNull();
  });

  it('磁贴不在页内 → null', () => {
    expect(resolveDropTile(fakeDoc({ tileId: 'ghost' }), page, 125, 225, 'x')).toBeNull();
  });

  it('elementFromPoint 返回 null（空白）→ null', () => {
    const doc = { elementFromPoint: () => null } as unknown as Document;
    expect(resolveDropTile(doc, page, 10, 10, 'x')).toBeNull();
  });

  it('宽度为 0 时归一化坐标不除零', () => {
    const hit = resolveDropTile(
      fakeDoc({ rect: { left: 100, top: 200, width: 0, height: 0 } }),
      page,
      125,
      225,
      'x',
    );
    expect(hit?.nx).toBe(25);
  });
});
