/** 登录并解开后，网格或设置改完把加密包推上云。一言不另传。 */

import { AccountApiError, putBackup } from './accountApi';
import {
  b64ToBytes,
  decryptWithPassphrase,
  encryptWithKey,
  encryptWithPassphrase,
  importRawKey,
  type CipherBundle,
} from './accountCrypto';
import { loadSession, saveSession, sessionUnlocked, type AccountSession } from './accountSession';
import { exportYtab, importYtab } from './backup';
import { plainNotice } from './notice';
import type { YtabState } from './types';

const DEBOUNCE_MS = 1600;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: YtabState | null = null;
let inflight: Promise<void> = Promise.resolve();

async function packPlain(state: YtabState): Promise<Uint8Array> {
  const blob = await exportYtab(state);
  return new Uint8Array(await blob.arrayBuffer());
}

async function unpackPlain(bytes: Uint8Array): Promise<YtabState> {
  // Blob 会接管这份 ArrayBuffer；拷贝以免调用方视图被 detach。
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return importYtab(new Blob([copy.buffer], { type: 'application/zip' }));
}

/**
 * 用恢复口令解开云端密文，得到整份状态和这台要记住的 raw key / salt / iter。
 * @throws 口令不对、或 ZIP 打不开时抛错。
 */
export async function unlockBundle(
  bundle: CipherBundle,
  passphrase: string,
): Promise<{ state: YtabState; rawKey: string; salt: string; iter: number }> {
  const { plain, rawKey } = await decryptWithPassphrase(bundle, passphrase);
  return { state: await unpackPlain(plain), rawKey, salt: bundle.salt, iter: bundle.iter };
}

async function makeBundle(
  state: YtabState,
  passphrase: string,
): Promise<{ bundle: CipherBundle; rawKey: string; salt: string; iter: number }> {
  const { bundle, rawKey } = await encryptWithPassphrase(await packPlain(state), passphrase);
  return { bundle, rawKey, salt: bundle.salt, iter: bundle.iter };
}

/**
 * 用新口令加密当前整份并上传，把 rawKey / salt / iter 写回这台的会话。
 * 第一次设口令、登录后选「用这台的」、改口令共用这一条。
 * @throws 口令短于 8 位，或上传失败。
 */
export async function setPassphraseAndUpload(
  state: YtabState,
  passphrase: string,
  session: AccountSession,
): Promise<AccountSession> {
  const { bundle, rawKey, salt, iter } = await makeBundle(state, passphrase);
  await putBackup(session.token, bundle);
  const next: AccountSession = {
    ...session,
    rawKey,
    salt,
    iter,
    hasBackup: true,
    uploadedAt: new Date().toISOString(),
  };
  await saveSession(next);
  return next;
}

/**
 * 用这台已记住的 key 再加密。盐和 iter 必须与口令派生时同一份，否则重装后解不开。
 * @throws 还没解开。
 */
async function remakeBundle(state: YtabState, session: AccountSession): Promise<CipherBundle> {
  if (!session.rawKey || !session.salt || !session.iter) throw new Error('还没解开');
  const key = await importRawKey(session.rawKey);
  return encryptWithKey(await packPlain(state), key, b64ToBytes(session.salt), session.iter);
}

/** 网格或设置改完后防抖上传。未解开或未走完首次启动则不排。 */
export function scheduleAccountBackup(state: YtabState): void {
  if (!state.onboardingDone) return;
  pending = state;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const snap = pending;
    pending = null;
    if (snap) inflight = inflight.then(() => pushNow(snap)).catch(() => undefined);
  }, DEBOUNCE_MS);
}

/**
 * 立刻推走防抖里那份。没有待传的不推——每个新标签是一份独立状态，
 * 切走旧标签若整包再传，会把别的标签刚写上的备份盖掉。
 */
export function flushAccountBackup(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const snap = pending;
  pending = null;
  if (!snap?.onboardingDone) return;
  inflight = inflight.then(() => pushNow(snap)).catch(() => undefined);
}

async function pushNow(state: YtabState): Promise<void> {
  const session = await loadSession();
  if (!sessionUnlocked(session)) return;
  try {
    const bundle = await remakeBundle(state, session);
    await putBackup(session.token, bundle);
    await saveSession({ ...session, hasBackup: true, uploadedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[ytab] account backup push failed', err);
    // 令牌只活 30 天；过期后服务器只会说「未登录」，这里换成用户能行动的话。
    if (err instanceof AccountApiError && err.status === 401) {
      plainNotice('fail', '登录过期了，请退出后重新登录');
      return;
    }
    plainNotice('fail', err instanceof Error ? err.message : '上传失败');
  }
}
