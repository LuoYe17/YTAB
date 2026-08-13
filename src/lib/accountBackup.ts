/** 登录并解开后，网格或设置改完把加密包推上云。一言不另传。 */

import { fetchBackup, putBackup } from './accountApi';
import {
  b64ToBytes,
  decryptWithPassphrase,
  encryptWithKey,
  encryptWithPassphrase,
  importRawKey,
  type CipherBundle,
} from './accountCrypto';
import { loadSession, saveSession, sessionUnlocked, type AccountSession } from './accountSession';
import { exportYtab, FULL_EXPORT, importYtab } from './backup';
import { plainNotice } from './notice';
import type { YtabState } from './types';

const DEBOUNCE_MS = 1600;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: YtabState | null = null;
let inflight: Promise<void> = Promise.resolve();

export async function packPlain(state: YtabState): Promise<Uint8Array> {
  const blob = await exportYtab(state, FULL_EXPORT);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function unpackPlain(bytes: Uint8Array): Promise<YtabState> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return importYtab(new Blob([copy.buffer], { type: 'application/zip' }));
}

export async function unlockBundle(
  bundle: CipherBundle,
  passphrase: string,
): Promise<{ state: YtabState; rawKey: string; salt: string }> {
  const { plain, rawKey } = await decryptWithPassphrase(bundle, passphrase);
  return { state: await unpackPlain(plain), rawKey, salt: bundle.salt };
}

export async function makeBundle(
  state: YtabState,
  passphrase: string,
): Promise<{ bundle: CipherBundle; rawKey: string; salt: string }> {
  const { bundle, rawKey } = await encryptWithPassphrase(await packPlain(state), passphrase);
  return { bundle, rawKey, salt: bundle.salt };
}

export async function remakeBundle(state: YtabState, session: AccountSession): Promise<CipherBundle> {
  if (!session.rawKey || !session.salt) throw new Error('还没解开');
  const key = await importRawKey(session.rawKey);
  return encryptWithKey(await packPlain(state), key, b64ToBytes(session.salt));
}

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

export function flushAccountBackup(state: YtabState): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
  if (!state.onboardingDone) return;
  inflight = inflight.then(() => pushNow(state)).catch(() => undefined);
}

async function pushNow(state: YtabState): Promise<void> {
  const session = await loadSession();
  if (!sessionUnlocked(session)) return;
  try {
    const bundle = await remakeBundle(state, session);
    await putBackup(session.token, bundle);
    await saveSession({ ...session, uploadedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[ytab] account backup push failed', err);
    plainNotice('fail', err instanceof Error ? err.message : '上传失败');
  }
}

export async function pullBundle(session: AccountSession): Promise<CipherBundle | null> {
  return fetchBackup(session.token);
}
