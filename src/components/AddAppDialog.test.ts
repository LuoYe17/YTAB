// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom 里 fade/scale 会引入时序抖动；测的是壳、Esc、焦点，不是动画。
vi.mock('svelte/transition', () => ({ fade: () => () => {}, scale: () => () => {} }));

import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import AddAppDialog from './AddAppDialog.svelte';
import type { AppItem } from '../lib/types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.getElementById('test-opener')?.remove();
});

beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => path },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('no network in tests');
    }),
  );
});

function press(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  );
}

const initial: AppItem = {
  id: 'app-1',
  kind: 'app',
  name: 'GitHub',
  url: 'https://github.com',
  icon: '',
};

function renderDialog() {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const result = render(AddAppDialog, { initial, onSave, onCancel });
  return { ...result, onSave, onCancel };
}

/** 与组件 sheetTabbables 同一选择器，对 first/last 才有意义。 */
function sheetTabbables(sheet: HTMLElement): HTMLElement[] {
  return [...sheet.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not(.sr)')];
}

describe('AddAppDialog', () => {
  it('渲染 role=dialog + aria-modal + aria-labelledby，overlay z-index 70', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('app-dlg-title');
    expect(dialog.getAttribute('style') ?? '').toMatch(/z-index:\s*70/);
  });

  it('backdrop 默认 aria-label=关闭；点 backdrop → onCancel', () => {
    const { onCancel } = renderDialog();
    const backdrop = document.querySelector<HTMLButtonElement>('.backdrop');
    expect(backdrop?.getAttribute('aria-label')).toBe('关闭');
    backdrop!.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('点 × → onCancel', () => {
    const { onCancel } = renderDialog();
    document.querySelector<HTMLButtonElement>('.close')!.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('点「取消」→ onCancel', () => {
    const { onCancel } = renderDialog();
    screen.getByRole('button', { name: '取消' }).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('按 Esc → onCancel', () => {
    const { onCancel } = renderDialog();
    press('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('打开后焦点在网址输入框', async () => {
    renderDialog();
    const url = screen.getByPlaceholderText('https://');
    await waitFor(() => {
      expect(document.activeElement).toBe(url);
    });
  });

  it('Tab 圈定：在 sheet 内循环，焦点不逃出对话框', async () => {
    renderDialog();
    const sheet = document.querySelector<HTMLFormElement>('.sheet')!;
    await waitFor(() => {
      expect(sheetTabbables(sheet).length).toBeGreaterThan(1);
    });
    const list = sheetTabbables(sheet);
    const first = list[0]!;
    const last = list[list.length - 1]!;

    last.focus();
    press('Tab');
    expect(document.activeElement).toBe(first);
    expect(sheet.contains(document.activeElement)).toBe(true);

    first.focus();
    press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(sheet.contains(document.activeElement)).toBe(true);

    // 焦点在对话框外时 Tab 应拉回 sheet，而不是落到 body。
    document.body.focus();
    press('Tab');
    expect(document.activeElement).toBe(first);
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it('关闭后焦点还原到打开前的元素', async () => {
    const opener = document.createElement('button');
    opener.id = 'test-opener';
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderDialog();
    await waitFor(() => {
      expect(document.activeElement).not.toBe(opener);
    });

    unmount();
    expect(document.activeElement).toBe(opener);
  });
});
