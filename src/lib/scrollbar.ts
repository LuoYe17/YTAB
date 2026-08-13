/** 自制垂直滚动条：把 scrollport 尺寸映射成滑块几何。 */

export type ScrollbarThumb = {
  top: number;
  height: number;
};

/**
 * 内容装得下则没有滑块。
 * `minThumb` 是滑块最短高度，避免内容很长时拖不到。
 */
export function scrollbarThumb(
  portH: number,
  scrollH: number,
  scrollTop: number,
  trackH: number,
  minThumb = 32,
): ScrollbarThumb | null {
  if (portH <= 0 || trackH <= 0 || scrollH <= portH) return null;
  const height = Math.min(trackH, Math.max(minThumb, (portH / scrollH) * trackH));
  const maxTop = trackH - height;
  const range = scrollH - portH;
  const top = range <= 0 ? 0 : (scrollTop / range) * maxTop;
  return { top: clamp(top, 0, maxTop), height };
}

/** 拖滑块时，把滑块 top 还原成 scrollTop。 */
export function scrollTopFromThumb(
  thumbTop: number,
  thumbH: number,
  trackH: number,
  portH: number,
  scrollH: number,
): number {
  const maxTop = trackH - thumbH;
  const range = scrollH - portH;
  if (maxTop <= 0 || range <= 0) return 0;
  return (clamp(thumbTop, 0, maxTop) / maxTop) * range;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
