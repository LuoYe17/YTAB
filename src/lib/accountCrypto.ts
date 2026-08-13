/** 恢复口令 → AES-GCM。盐跟密文走，这台只记住导出的 raw key。 */

const PASSPHRASE_MIN = 8;
const ITERATIONS = 210_000;
/** 解密按密文自带的 iter；下限钉死现网次数，以后只加 ITERATIONS、不减这层。 */
const ITER_FLOOR = 210_000;
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

/** 恢复口令至少 8 位。界面与加密入口共用，短了直接拒。 */
export function passphraseOk(value: string): boolean {
  return value.length >= PASSPHRASE_MIN;
}

function kdfIterations(iter: number): number {
  if (!Number.isInteger(iter) || iter < ITER_FLOOR) throw new Error('云端这份打不开');
  return iter;
}

/** 云端拉回的东西先过这道形状检查，坏形状当「云端这份打不开」处理。 */
export function isCipherBundle(value: unknown): value is CipherBundle {
  if (!value || typeof value !== 'object') return false;
  const o = value as CipherBundle;
  return (
    o.v === 1 &&
    o.kdf === 'pbkdf2-sha256' &&
    Number.isInteger(o.iter) &&
    o.iter >= ITER_FLOOR &&
    typeof o.salt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.ct === 'string'
  );
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** base64 → 原始字节。会话里存的 salt 就是这种编码。 */
export function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

async function exportRawKey(key: CryptoKey): Promise<string> {
  return bytesToB64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

/** 把会话里记住的 raw key 还原成 CryptoKey，供自动备份再加密。 */
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
  const bundle = await encryptWithKey(plain, key, salt, ITERATIONS);
  return { bundle, rawKey: await exportRawKey(key) };
}

/**
 * 用已记住的 key + 原盐再加密。盐和 iter 必须与口令派生这把 key 时同一份——
 * 密文标注的 iter 是换机解密时派生 key 的依据，标成别的数字整份就永久打不开。
 */
export async function encryptWithKey(
  plain: Uint8Array,
  key: CryptoKey,
  salt: Uint8Array,
  iter: number,
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
    iter,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ct)),
  };
}

/**
 * 用口令解密。次数读密文自带的 iter，与加密时一致；太低则拒。
 * @throws 口令不对，或次数不合法。
 */
export async function decryptWithPassphrase(
  bundle: CipherBundle,
  passphrase: string,
): Promise<{ plain: Uint8Array; rawKey: string }> {
  const salt = b64ToBytes(bundle.salt);
  const key = await deriveKey(passphrase, salt, kdfIterations(bundle.iter));
  try {
    const plain = await decryptWithKey(bundle, key);
    return { plain, rawKey: await exportRawKey(key) };
  } catch {
    throw new Error('恢复口令不对');
  }
}

async function decryptWithKey(bundle: CipherBundle, key: CryptoKey): Promise<Uint8Array> {
  const iv = b64ToBytes(bundle.iv);
  const ct = b64ToBytes(bundle.ct);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ct.buffer as ArrayBuffer,
  );
  return new Uint8Array(plain);
}
