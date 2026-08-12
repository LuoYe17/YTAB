import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHitokoto, hitokotoFailNotice } from './hitokoto';

describe('hitokotoFailNotice', () => {
  it('三种失败各有能动手的句子', () => {
    expect(hitokotoFailNotice('network')).toBe('连不上一言 (｡•́︿•̀｡) 检查一下网络');
    expect(hitokotoFailNotice('rateLimit')).toBe('一言让歇一会，稍后再点');
    expect(hitokotoFailNotice('empty')).toBe('一言这次没给句子，稍后再试');
  });
});

describe('fetchHitokoto', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('成功返回句子', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ hitokoto: '你好', from: '书' }), { status: 200 })),
    );
    await expect(fetchHitokoto()).resolves.toEqual({
      ok: true,
      value: { text: '你好', from: '书' },
    });
  });

  it('429 为被限流', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(fetchHitokoto()).resolves.toEqual({ ok: false, reason: 'rateLimit' });
  });

  it('其他非 2xx 为没给句子', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await expect(fetchHitokoto()).resolves.toEqual({ ok: false, reason: 'empty' });
  });

  it('空包为没给句子', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    await expect(fetchHitokoto()).resolves.toEqual({ ok: false, reason: 'empty' });
  });

  it('fetch 抛错为连不上', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(fetchHitokoto()).resolves.toEqual({ ok: false, reason: 'network' });
  });

  it('8 秒无响应为连不上', { timeout: 10_000 }, async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
    );
    const pending = fetchHitokoto();
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'network' });
  });
});
