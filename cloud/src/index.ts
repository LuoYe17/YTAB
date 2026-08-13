/** 账号备份：核验 GitHub，只存密文。 */

export interface Env {
  BACKUPS: R2Bucket;
  AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

type JwtPayload = {
  sub: string;
  provider: 'github';
  label: string;
  exp: number;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const url = new URL(request.url);
      if (url.pathname === '/v1/oauth/github/callback' && request.method === 'GET') {
        return oauthCallbackPage();
      }
      if (url.pathname === '/v1/auth/github' && request.method === 'POST') {
        return json(await authGithub(request, env), cors);
      }
      if (url.pathname === '/v1/backup') {
        const jwt = await readJwt(request, env);
        const key = objectKey(jwt.provider, jwt.sub);
        if (request.method === 'GET') {
          const obj = await env.BACKUPS.get(key);
          if (!obj) return json({ error: '还没有' }, cors, 404);
          return json(await obj.json(), cors);
        }
        if (request.method === 'PUT') {
          const body = await request.text();
          // ZIP+图标的上限；再大多半是坏请求，不进 R2。
          if (body.length > 12_000_000) return json({ error: '这份太大了' }, cors, 413);
          // 只确认是 JSON。内容仍当密文整包落盘，不拆字段。
          try {
            JSON.parse(body);
          } catch {
            throw new ApiError(400, '这份不是 JSON');
          }
          await env.BACKUPS.put(key, body, { httpMetadata: { contentType: 'application/json' } });
          return json({ ok: true }, cors);
        }
        if (request.method === 'DELETE') {
          await env.BACKUPS.delete(key);
          return json({ ok: true }, cors);
        }
      }
      return json({ error: '没有这个接口' }, cors, 404);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.message }, cors, err.status);
      // 运行时报错的原文（英文堆栈等）只进日志，不进界面。
      console.error('[ytab-account]', err);
      return json({ error: '出错了' }, cors, 400);
    }
  },
};

function corsHeaders(origin: string): Record<string, string> {
  const allow =
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') ? origin : 'null';
  return {
    ...CORS_HEADERS,
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
  };
}

function oauthCallbackPage(): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>YTAB</title><style>html,body{margin:0;height:100%;background:#0d1117;color:#e6edf3;font:14px/1.45 system-ui,sans-serif}body{display:grid;place-items:center;padding:1.25rem;text-align:center}</style><p>正在回到起始页，可以关掉这个窗口。</p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

function json(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function objectKey(provider: string, userId: string): string {
  return `v1/${provider}/${userId}`;
}

async function authGithub(request: Request, env: Env): Promise<unknown> {
  const { code, redirectUri } = (await request.json()) as { code?: string; redirectUri?: string };
  if (!code || !redirectUri) throw new ApiError(401, '登录失败');
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenBody = (await tokenRes.json()) as { access_token?: string };
  if (!tokenBody.access_token) throw new ApiError(401, '登录失败');
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      'User-Agent': 'ytab-account',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!userRes.ok) throw new ApiError(401, '登录失败');
  const user = (await userRes.json()) as { id?: number; login?: string; avatar_url?: string };
  if (!user.id) throw new ApiError(401, '登录失败');
  return issue(env, 'github', String(user.id), user.login ?? 'GitHub', user.avatar_url);
}

async function issue(
  env: Env,
  provider: 'github',
  userId: string,
  label: string,
  avatar?: string,
): Promise<{ token: string; userId: string; label: string; avatar?: string; hasBackup: boolean }> {
  const token = await signJwt(env.AUTH_SECRET, {
    sub: userId,
    provider,
    label,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });
  const obj = await env.BACKUPS.head(objectKey(provider, userId));
  return { token, userId, label, avatar, hasBackup: Boolean(obj) };
}

async function readJwt(request: Request, env: Env): Promise<JwtPayload> {
  const header = request.headers.get('Authorization') ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!raw) throw new ApiError(401, '未登录');
  return verifyJwt(env.AUTH_SECRET, raw);
}

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64urlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const bin = atob(value.replaceAll('-', '+').replaceAll('_', '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signJwt(secret: string, payload: JwtPayload): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${head}.${body}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return `${data}.${b64url(sig)}`;
}

async function verifyJwt(secret: string, token: string): Promise<JwtPayload> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new ApiError(401, '未登录');
    const [head, body, sig] = parts;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(`${head}.${body}`),
    );
    if (!ok) throw new ApiError(401, '未登录');
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as JwtPayload;
    // exp 缺失或不是数字也按过期拒，免得 undefined 比较放行永不过期的 token。
    if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000))
      throw new ApiError(401, '未登录');
    if (payload.provider !== 'github') throw new ApiError(401, '未登录');
    if (!payload.sub) throw new ApiError(401, '未登录');
    return payload;
  } catch (err) {
    // 坏 token 的 base64 / JSON 解析错也当未登录，不落进兜底 400。
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, '未登录');
  }
}
