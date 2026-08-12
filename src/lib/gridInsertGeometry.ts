/** 磁贴落点几何：中心 vs 边缘插入；网格空格按下标插入。 */

export type GridMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  cols: number;
  colStride: number;
  rowStride: number;
};

/** 比网格盒子更大的落点带（起始页 grid-slot / 文件夹面板）。 */
export type HitBand = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** 距磁贴中心小于此值视为「中心」（合文件夹 / 非边缘插入） */
export const EDGE_MIN = 0.32;

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

/** 指针落在哪一格；在网格外则空。nx/ny 是格内 0–1。 */
export function cellHit(
  x: number,
  y: number,
  m: GridMetrics,
): { index: number; nx: number; ny: number } | null {
  if (m.cols < 1 || m.colStride <= 0 || m.rowStride <= 0) return null;
  if (x < m.left || x > m.left + m.width || y < m.top || y > m.top + m.height) return null;
  let col = Math.floor((x - m.left) / m.colStride);
  let row = Math.floor((y - m.top) / m.rowStride);
  if (col === m.cols) col = m.cols - 1;
  if (col < 0 || row < 0) return null;
  const nx = (x - m.left - col * m.colStride) / m.colStride;
  const ny = (y - m.top - row * m.rowStride) / m.rowStride;
  return { index: row * m.cols + col, nx, ny };
}

/**
 * 网格落点插入下标。空格（下标 ≥ 已有数量）插到末尾，这样末行右侧空白也能放下。
 * 已有格走边缘几何；centerPolicy=skip 时中心返回 null（合文件夹）。
 */
export function insertIndexForGridPointer(
  x: number,
  y: number,
  m: GridMetrics,
  occupiedCount: number,
  centerPolicy: 'skip' | 'after',
): number | null {
  const hit = cellHit(x, y, m);
  if (!hit) return null;
  if (hit.index >= occupiedCount) return occupiedCount;
  return insertIndexFromHit(hit.index, hitEdgeRelative(hit.nx, hit.ny), centerPolicy);
}

/**
 * 扩大落点：格子内走原几何；带内、网格左边 → 首位；下边或右边 → 末尾。
 * 带外返回 null。翻页热区由调用方先吃掉。
 */
export function insertIndexForDropBand(
  x: number,
  y: number,
  m: GridMetrics,
  occupiedCount: number,
  centerPolicy: 'skip' | 'after',
  band: HitBand,
): number | null {
  if (x < band.left || x > band.right || y < band.top || y > band.bottom) return null;
  const gridRight = m.left + m.width;
  const gridBottom = m.top + m.height;
  if (x >= m.left && x <= gridRight && y >= m.top && y <= gridBottom) {
    return insertIndexForGridPointer(x, y, m, occupiedCount, centerPolicy);
  }
  if (y > gridBottom) return occupiedCount;
  if (x < m.left) return 0;
  if (x > gridRight) return occupiedCount;
  if (y < m.top) return 0;
  return null;
}

/** 从网格 DOM 读列数与步长；读失败返回 null。 */
export function readGridMetrics(el: HTMLElement): GridMetrics | null {
  const cols = getComputedStyle(el)
    .gridTemplateColumns.trim()
    .split(/\s+/)
    .filter((t) => t && t !== 'none').length;
  if (cols < 1) return null;
  const r = el.getBoundingClientRect();
  const first = el.firstElementChild as HTMLElement | null;
  if (!first || r.width <= 0) return null;
  const rowGap = parseFloat(getComputedStyle(el).rowGap) || 0;
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    cols,
    colStride: r.width / cols,
    rowStride: first.getBoundingClientRect().height + rowGap,
  };
}
