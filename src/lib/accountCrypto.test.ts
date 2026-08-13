import { describe, expect, it } from 'vitest';
import {
  decryptWithPassphrase,
  encryptWithPassphrase,
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

  it('口令不对解不开', async () => {
    const { bundle } = await encryptWithPassphrase(new TextEncoder().encode('x'), 'correct-horse');
    await expect(decryptWithPassphrase(bundle, 'wrong-horse')).rejects.toThrow('恢复口令不对');
  });
});
