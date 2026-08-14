// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom 里 fade/scale 会引入时序抖动；测的是壳与 Esc，不是动画。
vi.mock('svelte/transition', () => ({ fade: () => () => {}, scale: () => () => {} }));

const { stored } = vi.hoisted(() => ({
  stored: { value: null as import('../lib/accountSession').AccountSession | null },
}));

vi.mock('wxt/utils/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => stored.value,
      setValue: async (next: typeof stored.value) => {
        stored.value = next;
      },
    }),
  },
}));

import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import SettingsModal from './SettingsModal.svelte';
import type { AccountSession } from '../lib/accountSession';
import { DEFAULT_SETTINGS, createEmptyState } from '../lib/types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  stored.value = null;
  document.getElementById('test-opener')?.remove();
  // jsdom 本来没有 animate；不要留给同进程的其他文件。
  Reflect.deleteProperty(Element.prototype, 'animate');
});

beforeEach(() => {
  stored.value = null;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // popFrom 是组件内自定义 transition，jsdom 没有 Web Animations。
  Element.prototype.animate = function animateStub() {
    return {
      cancel() {},
      finish() {},
      play() {},
      pause() {},
      reverse() {},
      addEventListener() {},
      removeEventListener() {},
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      playState: 'finished',
    } as unknown as Animation;
  };
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

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function fakeSession(partial: Partial<AccountSession> = {}): AccountSession {
  return {
    provider: 'github',
    userId: '1',
    label: 'tester',
    token: 't',
    hasBackup: false,
    avatar: 'data:image/png;base64,aaa',
    ...partial,
  };
}

function renderSettings() {
  const onClose = vi.fn();
  const result = render(SettingsModal, {
    settings: DEFAULT_SETTINGS,
    onClose,
    onChange: vi.fn(),
    onboardingDone: true,
    packCurrent: () => createEmptyState(),
    onApplyState: vi.fn(),
    onResetAll: vi.fn(),
  });
  return { ...result, onClose };
}

function dialogTabbables(): HTMLElement[] {
  const dialog = screen.getByRole('dialog');
  return [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]):not(.sr)')].filter(
    (el) => el.tabIndex >= 0 && !el.classList.contains('sr'),
  );
}

describe('SettingsModal', () => {
  it('渲染 role=dialog + aria-modal + aria-label=设置，overlay z-index 45', () => {
    renderSettings();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('设置');
    expect(dialog.getAttribute('style') ?? '').toMatch(/z-index:\s*45/);
  });

  it('backdrop aria-label=关闭设置；点 backdrop → onClose', () => {
    const { onClose } = renderSettings();
    const backdrop = screen.getByRole('button', { name: '关闭设置' });
    backdrop.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点 sheet 内 ×（class=close）→ onClose', () => {
    const { onClose } = renderSettings();
    const close = document.querySelector<HTMLButtonElement>('.close');
    expect(close).toBeTruthy();
    close!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('无内层 sheet 时按 Esc → onClose', () => {
    const { onClose } = renderSettings();
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('有内层 sheet 时按 Esc → 内层关闭且口令字段被清空', async () => {
    stored.value = fakeSession();
    const { onClose } = renderSettings();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'tester' })).toBeTruthy();
    });
    screen.getByRole('button', { name: 'tester' }).click();
    const setPass = await waitFor(() => screen.getByRole('button', { name: '设口令' }));
    setPass.click();
    const passA = await waitFor(() => screen.getByPlaceholderText('至少 8 位') as HTMLInputElement);
    const passB = screen.getByPlaceholderText('再输入一次') as HTMLInputElement;
    passA.value = 'secret12';
    passA.dispatchEvent(new Event('input', { bubbles: true }));
    passB.value = 'secret12';
    passB.dispatchEvent(new Event('input', { bubbles: true }));

    press('Escape');
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('至少 8 位')).toBeNull();
    });
    expect(onClose).not.toHaveBeenCalled();

    screen.getByRole('button', { name: '设口令' }).click();
    const againA = await waitFor(() => screen.getByPlaceholderText('至少 8 位') as HTMLInputElement);
    const againB = screen.getByPlaceholderText('再输入一次') as HTMLInputElement;
    expect(againA.value).toBe('');
    expect(againB.value).toBe('');
  });

  it('关闭后焦点不还原（现状：无 focus restore）', () => {
    const opener = document.createElement('button');
    opener.id = 'test-opener';
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderSettings();
    const close = document.querySelector<HTMLButtonElement>('.close')!;
    close.focus();
    expect(document.activeElement).toBe(close);

    unmount();
    expect(document.activeElement).not.toBe(opener);
  });

  it('Tab 不被圈定（现状：无 trap）', () => {
    renderSettings();
    const list = dialogTabbables();
    expect(list.length).toBeGreaterThan(1);
    const first = list[0]!;
    const last = list[list.length - 1]!;
    last.focus();
    expect(document.activeElement).toBe(last);
    press('Tab');
    // jsdom 本身不会把 Tab 移到下一控件；有 trap 时会包到 first。现状没有 trap。
    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement).toBe(last);
  });
});
