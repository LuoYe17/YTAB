/** 磁贴落点几何：中心 vs 边缘插入（无 DOM）。 */

/** 距磁贴中心小于此值视为「中心」（合文件夹 / 非边缘插入） */
export const EDGE_MIN = 0.18;

export type EdgeHit = 'center' | 'before' | 'after';

/**
 * 指针在磁贴内的归一化坐标 (0–1) → 相对目标下标的落点语义。
 * center：中心区；before/after：插在目标前/后。
 */
export function hitEdgeRelative(nx: number, ny: number, edgeMin = EDGE_MIN): EdgeHit {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < edgeMin) return 'center';
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'before' : 'after';
  return dy < 0 ? 'before' : 'after';
}

/** 从 DOM rect 得到归一化坐标 */
export function normalizedInRect(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { nx: number; ny: number } {
  return {
    nx: (clientX - rect.left) / Math.max(rect.width, 1),
    ny: (clientY - rect.top) / Math.max(rect.height, 1),
  };
}

/**
 * 将 EdgeHit 转为插入下标。
 * - dwell 换位：center → null（不插入，走合文件夹）
 * - eject 落点：center → 插在目标后（与历史行为一致）
 */
export function insertIndexFromHit(
  targetIndex: number,
  hit: EdgeHit,
  centerPolicy: 'skip' | 'after',
): number | null {
  if (hit === 'center') {
    return centerPolicy === 'skip' ? null : targetIndex + 1;
  }
  return hit === 'before' ? targetIndex : targetIndex + 1;
}
