/** 恢复口令 → AES-GCM。盐跟密文走，这台只记住导出的 raw key。 */

export const PASSPHRASE_MIN = 8;
const ITERATIONS = 210_000;
const SALT_LEN = 16;
const IV_LEN = 12;

export type CipherBundle = {
  v: 1;
  kdf: 'pbkdf2-sha256';
  iter: number;
  salt: string;
  iv: string;
  ct: string;
};

export function passphraseOk(value: string): boolean {
  return value.length >= PASSPHRASE_MIN;
}

export function isCipherBundle(value: unknown): value is CipherBundle {
  if (!value || typeof value !== 'object') return false;
  const o = value as CipherBundle;
  return (
    o.v === 1 &&
    o.kdf === 'pbkdf2-sha256' &&
    typeof o.iter === 'number' &&
    typeof o.salt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.ct === 'string'
  );
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return bytesToB64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export async function importRawKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    b64ToBytes(raw).buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 用口令新盐加密。第一次上传或改口令时用。
 */
export async function encryptWithPassphrase(
  plain: Uint8Array,
  passphrase: string,
): Promise<{ bundle: CipherBundle; rawKey: string }> {
  if (!passphraseOk(passphrase)) throw new Error('恢复口令至少 8 位');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key = await deriveKey(passphrase, salt);
  const bundle = await encryptWithKey(plain, key, salt);
  return { bundle, rawKey: await exportRawKey(key) };
}

/**
 * 用已记住的 key + 原盐再加密。盐必须与口令派生时同一份，否则重装后解不开。
 */
export async function encryptWithKey(
  plain: Uint8Array,
  key: CryptoKey,
  salt: Uint8Array,
): Promise<CipherBundle> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    plain.buffer as ArrayBuffer,
  );
  return {
    v: 1,
    kdf: 'pbkdf2-sha256',
    iter: ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
  };
}

export async function decryptWithPassphrase(
  bundle: CipherBundle,
  passphrase: string,
): Promise<{ plain: Uint8Array; rawKey: string }> {
  const salt = b64ToBytes(bundle.salt);
  const key = await deriveKey(passphrase, salt);
  try {
    const plain = await decryptWithKey(bundle, key);
    return { plain, rawKey: await exportRawKey(key) };
  } catch {
    throw new Error('恢复口令不对');
  }
}

export async function decryptWithKey(bundle: CipherBundle, key: CryptoKey): Promise<Uint8Array> {
  const iv = b64ToBytes(bundle.iv);
  const ct = b64ToBytes(bundle.ct);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ct.buffer as ArrayBuffer,
  );
  return new Uint8Array(plain);
}
