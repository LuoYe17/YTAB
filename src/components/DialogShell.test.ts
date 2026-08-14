// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom 里 fade 会引入时序抖动；测的是壳，不是动画。
vi.mock('svelte/transition', () => ({ fade: () => () => {} }));

import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import DialogShell from './DialogShell.svelte';

// vitest 未开 globals，STL 不会自己挂 afterEach。
afterEach(cleanup);

/** @testing-library/svelte 没有 snippet 辅助，用 Svelte 的 createRawSnippet 传入 children。 */
function childrenSnippet() {
  return createRawSnippet(() => ({ render: () => '<span>shell-body</span>' }));
}

function renderShell(
  props: {
    labelledBy?: string;
    ariaLabel?: string;
    zIndex?: number;
    backdropLabel?: string;
    onClose?: () => void;
    onEscape?: () => void;
  } = {},
) {
  const onClose = props.onClose ?? vi.fn();
  const result = render(DialogShell, {
    zIndex: 10,
    children: childrenSnippet(),
    ...props,
    onClose,
  });
  return { ...result, onClose };
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

describe('DialogShell', () => {
  it('渲染 role=dialog 且 aria-modal=true', () => {
    renderShell();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('传 ariaLabel 时写到 aria-label', () => {
    renderShell({ ariaLabel: '添加 App' });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('添加 App');
  });

  it('传 labelledBy 时写到 aria-labelledby', () => {
    renderShell({ labelledBy: 'dlg-title' });
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('dlg-title');
  });

  it('zIndex 写进 overlay 的 style', () => {
    renderShell({ zIndex: 4242 });
    expect(screen.getByRole('dialog').getAttribute('style') ?? '').toMatch(/z-index:\s*4242/);
  });

  it('backdrop 默认 aria-label 为关闭', () => {
    renderShell();
    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy();
  });

  it('backdropLabel 覆盖默认关闭文案', () => {
    renderShell({ backdropLabel: '点遮罩关闭' });
    expect(screen.getByRole('button', { name: '点遮罩关闭' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '关闭' })).toBeNull();
  });

  it('点 backdrop 调用 onClose', () => {
    const { onClose } = renderShell();
    screen.getByRole('button', { name: '关闭' }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('按 Escape 调用 onEscape', () => {
    const onEscape = vi.fn();
    const { onClose } = renderShell({ onEscape });
    press('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('未传 onEscape 时按 Escape 调用 onClose', () => {
    const { onClose } = renderShell();
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('按其他键不触发 onClose / onEscape', () => {
    const onEscape = vi.fn();
    const { onClose } = renderShell({ onEscape });
    press('Enter');
    expect(onClose).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('Esc 在 capture 阶段 stopImmediatePropagation，后注册的监听收不到', () => {
    const later = vi.fn();
    const { onClose } = renderShell();
    window.addEventListener('keydown', later, true);
    try {
      press('Escape');
      expect(later).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', later, true);
    }
  });

  it('children snippet 被渲染出来', () => {
    renderShell();
    expect(screen.getByText('shell-body')).toBeTruthy();
  });

  it('卸载后按 Escape 不再触发回调', () => {
    const { onClose, unmount } = renderShell();
    unmount();
    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });
});
