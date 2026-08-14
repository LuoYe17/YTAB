import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHitokoto, hitokotoFailNotice } from './hitokoto';

describe('hitokotoFailNotice', () => {
  it('四种失败各有能动手的句子', () => {
    expect(hitokotoFailNotice('network')).toBe('连不上一言 (｡•́︿•̀｡) 检查一下网络');
    expect(hitokotoFailNotice('rateLimit')).toBe('一言让歇一会，稍后再点');
    expect(hitokotoFailNotice('empty')).toBe('一言这次没给句子，稍后再试');
    expect(hitokotoFailNotice('same')).toBe('一言还是这句，再点一次');
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

  it('请求不走浏览器缓存，且每次 URL 不同以免撞官方边缘缓存', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) => {
      return new Response(JSON.stringify({ hitokoto: '你好' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchHitokoto();
    await fetchHitokoto();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toBe(urls[1]);
    expect(urls[0]).toContain('encode=json');
    expect(urls[0]).toMatch(/[?&]_=/);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('抽到当前句会再试，直到不同', async () => {
    const fetchMock = vi.fn(async () => {
      const n = fetchMock.mock.calls.length;
      const text = n < 3 ? '旧句' : '新句';
      return new Response(JSON.stringify({ hitokoto: text, from: '' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchHitokoto({ exclude: '旧句' })).resolves.toEqual({
      ok: true,
      value: { text: '新句', from: '' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('三次仍是当前句则 same，不当成换成功', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ hitokoto: '旧句' }), { status: 200 })),
    );
    await expect(fetchHitokoto({ exclude: '旧句' })).resolves.toEqual({
      ok: false,
      reason: 'same',
    });
  });
});
