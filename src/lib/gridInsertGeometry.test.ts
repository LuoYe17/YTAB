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

  it('normalizedInRect', () => {
    const { nx, ny } = normalizedInRect(60, 40, { left: 50, top: 30, width: 100, height: 100 });
    expect(nx).toBeCloseTo(0.1);
    expect(ny).toBeCloseTo(0.1);
  });
});
