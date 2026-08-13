/** Wallhaven 密钥：用 settings 接口测，搜图没密钥也能成功，测不了真假。 */

export type WallhavenKeyTestResult = 'ok' | 'invalid' | 'network';

const KEY_TEST_TIMEOUT_MS = 8000;

/**
 * 测当前输入框里的密钥是否可用。
 * 401/403 当无效；超时与其余失败当网络异常。
 * 密钥走 `X-API-Key`，不进查询串，避免被代理/日志记下。
 */
export async function testWallhavenKey(key: string): Promise<WallhavenKeyTestResult> {
  const trimmed = key.trim();
  if (!trimmed) return 'invalid';
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), KEY_TEST_TIMEOUT_MS);
  try {
    const res = await fetch('https://wallhaven.cc/api/v1/settings', {
      headers: { 'X-API-Key': trimmed },
      signal: ac.signal,
    });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'invalid';
    return 'network';
  } catch {
    return 'network';
  } finally {
    clearTimeout(timer);
  }
}
