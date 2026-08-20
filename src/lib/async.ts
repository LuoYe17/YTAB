/** 异步工具：超时 fetch、指数退避重试、sleep。 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 给任意 Promise 加超时；超时抛 TimeoutError。 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** fetch 带 AbortController 超时（默认 10s）。 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** 第 attempt 次重试前的等待时长（attempt 从 1 起）：baseDelayMs * factor^(attempt-1)。 */
export function backoffDelayMs(attempt: number, baseDelayMs: number, factor: number): number {
  return baseDelayMs * factor ** (attempt - 1);
}

export type RetryOptions = {
  /** 总尝试次数（含首次），默认 3 */
  attempts?: number;
  /** 首次重试前的等待 ms，默认 300 */
  baseDelayMs?: number;
  /** 退避倍率，默认 2（300 → 600 → 1200 …） */
  factor?: number;
  /** 每次失败后的回调（attempt 从 1 起） */
  onRetry?: (attempt: number, err: unknown) => void;
};

/**
 * 指数退避重试：fn 抛错则等待 baseDelayMs * factor^(attempt-1) 后重试。
 * 全部失败返回 null；fn 成功返回其值。
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T | null> {
  const { attempts = 3, baseDelayMs = 300, factor = 2 } = opts;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) return null;
      opts.onRetry?.(attempt, err);
      await sleep(backoffDelayMs(attempt, baseDelayMs, factor));
    }
  }
  return null;
}
