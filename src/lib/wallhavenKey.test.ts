import { afterEach, describe, expect, it, vi } from 'vitest';
import { testWallhavenKey } from './wallhavenKey';

describe('testWallhavenKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 为可用', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"data":{}}', { status: 200 })));
    await expect(testWallhavenKey('abc')).resolves.toBe('ok');
  });

  it('401 为无效', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(testWallhavenKey('bad')).resolves.toBe('invalid');
  });

  it('抛错为网络异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(testWallhavenKey('abc')).resolves.toBe('network');
  });

  it('请求带上当前密钥', async () => {
    const fetchMock = vi.fn(async () => new Response('{"data":{}}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await testWallhavenKey('secret-key');
    const first = fetchMock.mock.calls[0] as [RequestInfo | URL] | undefined;
    expect(String(first?.[0])).toContain('apikey=secret-key');
    expect(String(first?.[0])).toContain('wallhaven.cc/api/v1/settings');
  });
});
