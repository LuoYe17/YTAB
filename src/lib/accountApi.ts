/** 跟账号备份接口说话。服务器只收密文和登录令牌。 */

import { ACCOUNT_API } from './accountConfig';
import { isCipherBundle, type CipherBundle } from './accountCrypto';

export type AuthOk = {
  token: string;
  userId: string;
  label: string;
  avatar?: string;
  hasBackup: boolean;
};

export class AccountApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  let res: Response;
  try {
    res = await fetch(`${ACCOUNT_API}${path}`, { ...init, headers });
  } catch {
    throw new AccountApiError('网络出现异常 请稍后再试');
  }
  return res;
}

async function readError(res: Response, fallback: string): Promise<AccountApiError> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return new AccountApiError(body.error, res.status);
  } catch {
    /* 用 fallback */
  }
  return new AccountApiError(fallback, res.status);
}

/** 用 GitHub 授权码换我们自己的会话令牌，并告知云端有没有份。 */
export async function authWithGithub(code: string, redirectUri: string): Promise<AuthOk> {
  const res = await request('/v1/auth/github', {
    method: 'POST',
    body: JSON.stringify({ code, redirectUri }),
  });
  if (!res.ok) throw await readError(res, '登录失败');
  return (await res.json()) as AuthOk;
}

/** 拉回密文。没有则 null；形状不对抛错。服务器不应看见明文。 */
export async function fetchBackup(token: string): Promise<CipherBundle | null> {
  const res = await request('/v1/backup', { token });
  if (res.status === 404) return null;
  if (!res.ok) throw await readError(res, '拉回失败');
  const body: unknown = await res.json();
  if (!isCipherBundle(body)) throw new AccountApiError('云端这份打不开');
  return body;
}

/** 整份密文覆盖写入。后写盖住先写，服务端不做版本比对。 */
export async function putBackup(token: string, bundle: CipherBundle): Promise<void> {
  const res = await request('/v1/backup', {
    method: 'PUT',
    token,
    body: JSON.stringify(bundle),
  });
  if (!res.ok) throw await readError(res, '上传失败');
}

/** 只删云端密文。本机会话由调用方自己收。404 当已经没了。 */
export async function deleteBackup(token: string): Promise<void> {
  const res = await request('/v1/backup', { method: 'DELETE', token });
  if (!res.ok && res.status !== 404) throw await readError(res, '删除失败');
}
