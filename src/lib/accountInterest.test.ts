import { describe, expect, it } from 'vitest';
import { backupInterest } from './accountInterest';
import { createEmptyState } from './types';

describe('backupInterest', () => {
  it('一言变了不算', () => {
    const a = createEmptyState();
    const b = { ...a, hitokoto: { text: '另一句', from: 'x' } };
    expect(backupInterest(a)).toBe(backupInterest(b));
  });

  it('网格变了要算', () => {
    const a = createEmptyState();
    const b = {
      ...a,
      pages: [[{ id: '1', kind: 'app' as const, name: 'A', url: 'https://a.example', icon: '' }]],
    };
    expect(backupInterest(a)).not.toBe(backupInterest(b));
  });
});
