/** 弹出 GitHub 登录。Client ID 空着时不要调用，界面不应画出按钮。 */

import { ACCOUNT_API, accountConfigured, GITHUB_OAUTH_CLIENT_ID, GITHUB_REDIRECT } from './accountConfig';
import { authWithGithub, type AuthOk } from './accountApi';

const POPUP_W = 420;
const POPUP_H = 640;

type ChromeWin = { id?: number };
type WindowsApi = {
  create: (
    info: {
      url: string;
      type: 'popup';
      width: number;
      height: number;
      left?: number;
      top?: number;
      focused: boolean;
    },
    cb: (win?: ChromeWin) => void,
  ) => void;
  remove: (id: number, cb?: () => void) => void;
  onRemoved: {
    addListener: (cb: (id: number) => void) => void;
    removeListener: (cb: (id: number) => void) => void;
  };
};
type TabsApi = {
  onUpdated: {
    addListener: (cb: (tabId: number, info: { url?: string }, tab: { windowId?: number; url?: string }) => void) => void;
    removeListener: (cb: (tabId: number, info: { url?: string }, tab: { windowId?: number; url?: string }) => void) => void;
  };
};

function chromeRuntime(): {
  windows?: WindowsApi;
  tabs?: TabsApi;
  runtime?: { lastError?: { message?: string } };
} {
  return (
    (globalThis as unknown as { chrome?: ReturnType<typeof chromeRuntime> }).chrome ?? {}
  );
}

function lastErrorMessage(): string | undefined {
  return chromeRuntime().runtime?.lastError?.message;
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function popupOffset(): { left: number; top: number } {
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - POPUP_W) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - POPUP_H) / 2));
  return { left, top };
}

function readAuthRedirect(
  responseUrl: string,
  redirectUri: string,
  state: string,
): { code: string; redirectUri: string } {
  if (!responseUrl.startsWith(redirectUri)) throw new Error('登录失败');
  const ret = new URL(responseUrl);
  if (ret.searchParams.get('error') === 'access_denied') throw new Error('取消了登录');
  if (ret.searchParams.get('state') !== state) throw new Error('登录失败');
  const code = ret.searchParams.get('code');
  if (!code) throw new Error('登录失败');
  return { code, redirectUri };
}

/** 弹出 GitHub。成功后拿到我们自己的会话令牌，还不知道云端有没有份。 */
export async function signIn(): Promise<AuthOk> {
  if (!accountConfigured() || !GITHUB_OAUTH_CLIENT_ID || !ACCOUNT_API) {
    throw new Error('账号备份还没接上');
  }
  const { code, redirectUri } = await getGithubCode();
  return authWithGithub(code, redirectUri);
}

function getGithubCode(): Promise<{ code: string; redirectUri: string }> {
  const redirectUri = GITHUB_REDIRECT;
  const state = randomState();
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', GITHUB_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read:user');
  url.searchParams.set('state', state);

  const ext = chromeRuntime();
  if (!ext.windows?.create || !ext.tabs?.onUpdated) {
    return Promise.reject(new Error('这台浏览器没有登录接口'));
  }
  return openSmallPopup(ext.windows, ext.tabs, url.toString(), redirectUri, state);
}

/** identity 那扇窗改不了大小；能开窗口就自己开小的。 */
function openSmallPopup(
  windows: WindowsApi,
  tabs: TabsApi,
  authUrl: string,
  redirectUri: string,
  state: string,
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let winId: number | undefined;
    let settled = false;

    const finish = (err: Error | null, value?: { code: string; redirectUri: string }) => {
      if (settled) return;
      settled = true;
      tabs.onUpdated.removeListener(onUpdated);
      windows.onRemoved.removeListener(onRemoved);
      if (winId !== undefined) windows.remove(winId);
      if (err) reject(err);
      else if (value) resolve(value);
    };

    const onUpdated = (_tabId: number, info: { url?: string }, tab: { windowId?: number; url?: string }) => {
      if (winId === undefined || tab.windowId !== winId) return;
      const href = info.url ?? tab.url;
      if (!href?.startsWith(redirectUri)) return;
      try {
        finish(null, readAuthRedirect(href, redirectUri, state));
      } catch (e) {
        finish(e instanceof Error ? e : new Error('登录失败'));
      }
    };

    const onRemoved = (id: number) => {
      if (id === winId) finish(new Error('取消了登录'));
    };

    tabs.onUpdated.addListener(onUpdated);
    windows.onRemoved.addListener(onRemoved);

    const { left, top } = popupOffset();
    windows.create(
      { url: authUrl, type: 'popup', width: POPUP_W, height: POPUP_H, left, top, focused: true },
      (win) => {
        const err = lastErrorMessage();
        if (err || win?.id === undefined) {
          finish(new Error(err ?? '登录失败'));
          return;
        }
        winId = win.id;
      },
    );
  });
}
