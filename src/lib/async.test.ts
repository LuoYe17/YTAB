import { describe, expect, it, vi } from 'vitest';
import { backoffDelayMs, retryWithBackoff } from './async';

describe('retryWithBackoff', () => {
  it('首次成功直接返回，不重试', async () => {
    const fn = vi.fn(async () => 42);
    const result = await retryWithBackoff(fn, { attempts: 3 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('前两次失败、第三次成功 → 返回结果并退避重试', async () => {
    const fn = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(7);
    const onRetry = vi.fn();
    const result = await retryWithBackoff(fn, { attempts: 3, baseDelayMs: 5, onRetry });
    expect(result).toBe(7);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('全部失败 → 返回 null', async () => {
    const fn = vi.fn(async () => {
      throw new Error('always fails');
    });
    const result = await retryWithBackoff(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('退避间隔按 factor 指数增长', () => {
    expect(backoffDelayMs(1, 100, 3)).toBe(100);
    expect(backoffDelayMs(2, 100, 3)).toBe(300);
    expect(backoffDelayMs(3, 100, 3)).toBe(900);
    expect(backoffDelayMs(4, 100, 3)).toBe(2700);
    expect(backoffDelayMs(2, 300, 4)).toBe(1200);
  });

  it('attempts=1 时不重试', async () => {
    const fn = vi.fn(async () => {
      throw new Error('x');
    });
    const result = await retryWithBackoff(fn, { attempts: 1 });
    expect(result).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
