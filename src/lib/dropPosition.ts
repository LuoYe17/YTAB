/** 拖拽落点：DOM 解析（薄壳，可注入 document）与插入位置纯计算分离。 */

import type { GridItem } from './types';

export type DropTile = {
  /** 目标磁贴在当前页的索引 */
  index: number;
  /** 落点相对磁贴的水平归一化坐标（0..1） */
  nx: number;
  /** 落点相对磁贴的垂直归一化坐标（0..1） */
  ny: number;
};

/**
 * 从 DOM 解析落点命中的磁贴；未命中（空白处 / 拖的是自己 / 磁贴不在页内）返回 null，
 * 由调用方按「追加到页尾」处理。
 */
export function resolveDropTile(
  doc: Document,
  page: GridItem[],
  clientX: number,
  clientY: number,
  excludeId: string,
): DropTile | null {
  const el = doc.elementFromPoint(clientX, clientY);
  const tile = el?.closest?.('[data-tile-id]') as HTMLElement | null;
  const targetId = tile?.dataset.tileId;
  if (!targetId || targetId === excludeId) return null;
  const index = page.findIndex((i) => i.id === targetId);
  if (index < 0) return null;
  const rect = tile.getBoundingClientRect();
  return {
    index,
    nx: (clientX - rect.left) / Math.max(rect.width, 1),
    ny: (clientY - rect.top) / Math.max(rect.height, 1),
  };
}

/**
 * 纯计算：给定目标磁贴信息（或 null=空白）返回插入位置。
 * 落在磁贴中心 EDGE_MIN 邻域内 → 插到目标之后；否则按 dx/dy 更显著的方向插前/后。
 */
export function insertIndexForDrop(tile: DropTile | null, pageLength: number): number {
  if (!tile) return pageLength;
  const { index, nx, ny } = tile;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const EDGE_MIN = 0.18;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < EDGE_MIN) return index + 1;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? index : index + 1;
  return dy < 0 ? index : index + 1;
}
