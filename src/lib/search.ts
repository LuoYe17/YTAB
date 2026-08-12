import type { BingEndpoint } from './types';

export function bingSearchUrl(query: string, endpoint: BingEndpoint): string {
  const base =
    endpoint === 'cn'
      ? 'https://cn.bing.com/search'
      : 'https://www.bing.com/search';
  return `${base}?q=${encodeURIComponent(query)}`;
}
