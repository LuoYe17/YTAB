/**
 * 自制下拉要不要向上翻：下方够高则朝下；否则比谁剩余空间大。
 * @param gap 锚点与菜单之间的空隙，默认 6。
 */
export function dropdownOpensUp(
  anchor: { top: number; bottom: number },
  menuHeight: number,
  viewportHeight: number,
  gap = 6,
): boolean {
  const spaceBelow = viewportHeight - anchor.bottom - gap;
  const spaceAbove = anchor.top - gap;
  if (spaceBelow >= menuHeight) return false;
  return spaceAbove > spaceBelow;
}

/**
 * 把提示放到视口里还能看见的空位：先上下后左右，贴边再夹进来。
 */
export function placeFloatingTip(
  anchor: { top: number; left: number; right: number; bottom: number; width: number },
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
): { top: number; left: number } {
  const edge = 8;
  const openUp = dropdownOpensUp(anchor, tip.height, viewport.height, gap);
  let top = openUp ? anchor.top - gap - tip.height : anchor.bottom + gap;
  top = Math.max(edge, Math.min(top, viewport.height - tip.height - edge));
  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  left = Math.max(edge, Math.min(left, viewport.width - tip.width - edge));
  return { top, left };
}
