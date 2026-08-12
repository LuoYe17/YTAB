import { describe, expect, it } from 'vitest';
import {
  EDGE_MIN,
  hitEdgeRelative,
  insertIndexFromHit,
  normalizedInRect,
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
});
