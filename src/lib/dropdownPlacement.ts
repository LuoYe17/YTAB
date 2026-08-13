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
