/** 按真实高度过渡。写死很大的 max-height 会让展开只走前一截、收起先空转。 */
export function foldMax(node: HTMLElement, open: boolean) {
  const inner = () => node.firstElementChild as HTMLElement | null;
  const apply = (isOpen: boolean, instant: boolean) => {
    const h = inner()?.scrollHeight ?? 0;
    node.style.transitionDuration = instant ? '0s' : isOpen ? '0.48s' : '0.24s';
    if (isOpen) {
      node.style.maxHeight = `${h}px`;
      return;
    }
    if (instant) {
      node.style.maxHeight = '0px';
      return;
    }
    node.style.maxHeight = `${h}px`;
    node.getBoundingClientRect();
    node.style.maxHeight = '0px';
  };
  apply(open, true);
  const ro = new ResizeObserver(() => {
    if (!open) return;
    node.style.maxHeight = `${inner()?.scrollHeight ?? 0}px`;
  });
  const child = inner();
  if (child) ro.observe(child);
  return {
    update(isOpen: boolean) {
      open = isOpen;
      apply(isOpen, false);
    },
    destroy() {
      ro.disconnect();
    },
  };
}
