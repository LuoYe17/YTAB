import { describe, expect, it } from 'vitest';
import {
  b64ToBytes,
  decryptWithPassphrase,
  encryptWithKey,
  encryptWithPassphrase,
  importRawKey,
  isCipherBundle,
  passphraseOk,
} from './accountCrypto';

describe('accountCrypto', () => {
  it('口令太短不行', () => {
    expect(passphraseOk('1234567')).toBe(false);
    expect(passphraseOk('12345678')).toBe(true);
  });

  it('加密后再解开是同一份', async () => {
    const plain = new TextEncoder().encode('hello-ytab');
    const { bundle } = await encryptWithPassphrase(plain, 'correct-horse');
    expect(isCipherBundle(bundle)).toBe(true);
    const { plain: out } = await decryptWithPassphrase(bundle, 'correct-horse');
    expect(new TextDecoder().decode(out)).toBe('hello-ytab');
  });

  it('密文次数太低则打不开', async () => {
    const { bundle } = await encryptWithPassphrase(new TextEncoder().encode('x'), 'correct-horse');
    expect(isCipherBundle({ ...bundle, iter: 1 })).toBe(false);
    await expect(decryptWithPassphrase({ ...bundle, iter: 1 }, 'correct-horse')).rejects.toThrow('云端这份打不开');
  });

  it('解密用密文自带的次数，改了就对不上', async () => {
    const { bundle } = await encryptWithPassphrase(new TextEncoder().encode('x'), 'correct-horse');
    await expect(decryptWithPassphrase({ ...bundle, iter: 210_001 }, 'correct-horse')).rejects.toThrow(
      '恢复口令不对',
    );
  });

  it('口令不对解不开', async () => {
    const { bundle } = await encryptWithPassphrase(new TextEncoder().encode('x'), 'correct-horse');
    await expect(decryptWithPassphrase(bundle, 'wrong-horse')).rejects.toThrow('恢复口令不对');
  });

  it('用记住的 key 再加密：iter 原样进密文，换机用口令仍解得开', async () => {
    const { bundle } = await encryptWithPassphrase(new TextEncoder().encode('x'), 'correct-horse');
    const { rawKey } = await decryptWithPassphrase(bundle, 'correct-horse');
    const again = await encryptWithKey(
      new TextEncoder().encode('y'),
      await importRawKey(rawKey),
      b64ToBytes(bundle.salt),
      bundle.iter,
    );
    expect(again.iter).toBe(bundle.iter);
    const { plain } = await decryptWithPassphrase(again, 'correct-horse');
    expect(new TextDecoder().decode(plain)).toBe('y');
  });
});
