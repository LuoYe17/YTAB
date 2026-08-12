/** Wallhaven 密钥：用 settings 接口测，搜图没密钥也能成功，测不了真假。 */

export type WallhavenKeyTestResult = 'ok' | 'invalid' | 'network';

/**
 * 测当前输入框里的密钥是否可用。
 * 401/403 当无效；其余失败当网络异常。
 */
export async function testWallhavenKey(key: string): Promise<WallhavenKeyTestResult> {
  const trimmed = key.trim();
  if (!trimmed) return 'invalid';
  try {
    const res = await fetch(
      `https://wallhaven.cc/api/v1/settings?apikey=${encodeURIComponent(trimmed)}`,
    );
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'invalid';
    return 'network';
  } catch {
    return 'network';
  }
}
