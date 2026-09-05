import { describe, expect, it } from 'vitest';
import { newPassphraseError, oldPassphraseError } from './passphrase';

describe('newPassphraseError', () => {
  it('两遍不一致 → 先报不一致（哪怕都太短）', () => {
    expect(newPassphraseError('a', 'b')).toBe('两次口令不一致');
  });

  it('一致但不足 8 位 → 至少 8 位', () => {
    expect(newPassphraseError('short12', 'short12')).toBe('恢复口令至少 8 位');
  });

  it('一致且够长 → null', () => {
    expect(newPassphraseError('secret12', 'secret12')).toBeNull();
  });
});

describe('oldPassphraseError', () => {
  it('空串 → 请输入恢复口令', () => {
    expect(oldPassphraseError('')).toBe('请输入恢复口令');
  });

  it('非空 → null', () => {
    expect(oldPassphraseError('whatever')).toBeNull();
  });
});
