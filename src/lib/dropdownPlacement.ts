/** 自制下拉：视口不够向下展开时改向上翻。 */

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
