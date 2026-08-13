import { describe, expect, it } from 'vitest';
import { urlReadyToFetch } from './defaults';

describe('urlReadyToFetch', () => {
  it('太短或空协议不抓', () => {
    expect(urlReadyToFetch('')).toBe(false);
    expect(urlReadyToFetch('https://')).toBe(false);
    expect(urlReadyToFetch('git')).toBe(false);
  });

  it('有域名就抓，可省略协议', () => {
    expect(urlReadyToFetch('github.com')).toBe(true);
    expect(urlReadyToFetch('https://bilibili.com/x')).toBe(true);
    expect(urlReadyToFetch('localhost')).toBe(true);
  });
});
