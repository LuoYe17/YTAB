import { describe, expect, it } from 'vitest';
import { purityAfterClearingKey, toggleCategory, togglePurity } from './settingsFilters';

describe('togglePurity', () => {
  it('最后一项关不掉', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'sfw', false, true)).toEqual({
      sfw: true,
      sketchy: false,
      nsfw: false,
    });
  });

  it('没密钥不能开限制', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'nsfw', true, false).nsfw).toBe(
      false,
    );
  });

  it('有密钥可以开限制', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'nsfw', true, true).nsfw).toBe(
      true,
    );
  });

  it('可同时开多项', () => {
    expect(togglePurity({ sfw: true, sketchy: false, nsfw: false }, 'sketchy', true, true)).toEqual({
      sfw: true,
      sketchy: true,
      nsfw: false,
    });
  });
});

describe('toggleCategory', () => {
  it('最后一项关不掉', () => {
    expect(
      toggleCategory({ general: true, anime: false, people: false }, 'general', false),
    ).toEqual({ general: true, anime: false, people: false });
  });

  it('可关掉非最后一项', () => {
    expect(
      toggleCategory({ general: true, anime: true, people: true }, 'anime', false),
    ).toEqual({ general: true, anime: false, people: true });
  });
});

describe('purityAfterClearingKey', () => {
  it('清空密钥则把限制关掉', () => {
    expect(purityAfterClearingKey({ sfw: true, sketchy: true, nsfw: true })).toEqual({
      sfw: true,
      sketchy: true,
      nsfw: false,
    });
  });

  it('只开着限制时清空密钥则改开安全', () => {
    expect(purityAfterClearingKey({ sfw: false, sketchy: false, nsfw: true })).toEqual({
      sfw: true,
      sketchy: false,
      nsfw: false,
    });
  });
});
