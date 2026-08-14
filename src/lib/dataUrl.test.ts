// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blobToDataUrl } from './dataUrl';

describe('blobToDataUrl', () => {
  it("new Blob(['abc']) 结果以 data: 开头", async () => {
    const url = await blobToDataUrl(new Blob(['abc']));
    expect(url.startsWith('data:')).toBe(true);
  });

  it('空 Blob 也可解析', async () => {
    const url = await blobToDataUrl(new Blob([]));
    expect(url.startsWith('data:')).toBe(true);
  });
});
