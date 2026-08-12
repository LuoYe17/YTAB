import { describe, expect, it } from 'vitest';
import {
  EDGE_MIN,
  cellHit,
  hitEdgeRelative,
  insertIndexForDropBand,
  insertIndexForGridPointer,
  insertIndexFromHit,
  normalizedInRect,
  type GridMetrics,
} from './gridInsertGeometry';

describe('gridInsertGeometry', () => {
  it('中心区为 center', () => {
    expect(hitEdgeRelative(0.5, 0.5)).toBe('center');
    expect(hitEdgeRelative(0.5 + EDGE_MIN / 2, 0.5)).toBe('center');
  });

  it('左右边缘为 before/after', () => {
    expect(hitEdgeRelative(0.1, 0.5)).toBe('before');
    expect(hitEdgeRelative(0.9, 0.5)).toBe('after');
  });

  it('上下边缘为 before/after', () => {
    expect(hitEdgeRelative(0.5, 0.05)).toBe('before');
    expect(hitEdgeRelative(0.5, 0.95)).toBe('after');
  });

  it('dwell：center → null；eject：center → after', () => {
    expect(insertIndexFromHit(2, 'center', 'skip')).toBeNull();
    expect(insertIndexFromHit(2, 'center', 'after')).toBe(3);
    expect(insertIndexFromHit(2, 'before', 'skip')).toBe(2);
    expect(insertIndexFromHit(2, 'after', 'skip')).toBe(3);
  });

  it('EDGE_MIN 边界：内侧 center，外侧 edge', () => {
    const justIn = 0.5 + EDGE_MIN - 1e-6;
    const justOut = 0.5 + EDGE_MIN + 1e-6;
    expect(hitEdgeRelative(justIn, 0.5)).toBe('center');
    expect(hitEdgeRelative(justOut, 0.5)).toBe('after');
    expect(hitEdgeRelative(0.5, justIn)).toBe('center');
    expect(hitEdgeRelative(0.5, justOut)).toBe('after');
  });

  it('合文件夹 center 与 insert skip 同一边界', () => {
    // 旧 CENTER=0.38 会判为非中心，EDGE_MIN 中心带内应判 center 且 skip 插入
    const inSharedCenter = 0.35;
    expect(hitEdgeRelative(inSharedCenter, 0.5)).toBe('center');
    expect(insertIndexFromHit(1, hitEdgeRelative(inSharedCenter, 0.5), 'skip')).toBeNull();

    const onEdge = 0.5 + EDGE_MIN + 0.01;
    expect(hitEdgeRelative(onEdge, 0.5)).toBe('after');
    expect(insertIndexFromHit(1, hitEdgeRelative(onEdge, 0.5), 'skip')).toBe(2);
  });

  it('normalizedInRect', () => {
    const { nx, ny } = normalizedInRect(60, 40, { left: 50, top: 30, width: 100, height: 100 });
    expect(nx).toBeCloseTo(0.1);
    expect(ny).toBeCloseTo(0.1);
  });

  const eightCol: GridMetrics = {
    left: 0,
    top: 0,
    width: 800,
    height: 200,
    cols: 8,
    colStride: 100,
    rowStride: 100,
  };

  it('cellHit：第二行第 4 格', () => {
    const hit = cellHit(350, 150, eightCol);
    expect(hit?.index).toBe(11);
    expect(hit?.nx).toBeCloseTo(0.5);
    expect(hit?.ny).toBeCloseTo(0.5);
  });

  it('末行右侧空格插到列表末尾', () => {
    // 11 个图标占 0–10；格 11 起为空
    expect(insertIndexForGridPointer(350, 150, eightCol, 11, 'skip')).toBe(11);
    expect(insertIndexForGridPointer(750, 150, eightCol, 11, 'skip')).toBe(11);
  });

  it('已有格右侧为 after，中心 skip 不插入', () => {
    expect(insertIndexForGridPointer(90, 50, eightCol, 11, 'skip')).toBe(1);
    expect(insertIndexForGridPointer(50, 50, eightCol, 11, 'skip')).toBeNull();
  });

  it('网格外不插入', () => {
    expect(insertIndexForGridPointer(-10, 50, eightCol, 11, 'skip')).toBeNull();
    expect(insertIndexForGridPointer(50, 250, eightCol, 11, 'skip')).toBeNull();
  });

  const band = { left: -200, top: -20, right: 1000, bottom: 600 };

  it('落点带：网格左边 → 首位，下边/右边 → 末尾', () => {
    expect(insertIndexForDropBand(-50, 50, eightCol, 11, 'skip', band)).toBe(0);
    expect(insertIndexForDropBand(50, 400, eightCol, 11, 'skip', band)).toBe(11);
    expect(insertIndexForDropBand(900, 50, eightCol, 11, 'skip', band)).toBe(11);
  });

  it('落点带：网格上方 → 首位；右上以「右」为准插末尾', () => {
    expect(insertIndexForDropBand(50, -10, eightCol, 11, 'skip', band)).toBe(0);
    expect(insertIndexForDropBand(900, -10, eightCol, 11, 'skip', band)).toBe(11);
  });

  it('落点带：带外仍不插入；左下以「下」为准插末尾', () => {
    expect(insertIndexForDropBand(-50, 50, eightCol, 11, 'skip', { left: 0, top: 0, right: 800, bottom: 200 })).toBeNull();
    expect(insertIndexForDropBand(-50, 400, eightCol, 11, 'skip', band)).toBe(11);
  });
});
