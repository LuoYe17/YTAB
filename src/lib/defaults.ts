import type { AppItem } from './types';

/** Author default Apps (ADR-0009). Icons filled at runtime via favicon helper. */
export const AUTHOR_DEFAULT_APPS: Omit<AppItem, 'id' | 'kind' | 'icon'>[] = [
  { name: '哔哩哔哩', url: 'https://www.bilibili.com' },
  { name: '抖音', url: 'https://www.douyin.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'Linux Do', url: 'https://linux.do' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'Gemini', url: 'https://gemini.google.com' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com' },
  { name: 'Gmail', url: 'https://mail.google.com' },
  { name: '网易邮箱', url: 'https://mail.163.com' },
  { name: 'Proton Mail', url: 'https://mail.proton.me' },
];

export function newId(): string {
  return crypto.randomUUID();
}

export function faviconUrlFor(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return '';
  }
}

export function hostnameFallback(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '');
  } catch {
    return siteUrl;
  }
}

export function createAppFromUrl(url: string, name?: string, icon?: string): AppItem {
  const normalized = normalizeUrl(url);
  return {
    id: newId(),
    kind: 'app',
    name: name?.trim() || hostnameFallback(normalized),
    url: normalized,
    icon: icon || faviconUrlFor(normalized),
  };
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function buildAuthorDefaultApps(): AppItem[] {
  return AUTHOR_DEFAULT_APPS.map((a) => createAppFromUrl(a.url, a.name));
}

/** Fetch favicon into a data URL so the grid does not wait on the home screen. */
export async function cacheIconAsDataUrl(siteUrl: string): Promise<string> {
  const remote = faviconUrlFor(siteUrl);
  if (!remote) return '';
  try {
    const res = await fetch(remote);
    if (!res.ok) return remote;
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch {
    return remote;
  }
}

export async function buildAuthorDefaultAppsCached(): Promise<AppItem[]> {
  return Promise.all(
    AUTHOR_DEFAULT_APPS.map(async (a) => {
      const icon = await cacheIconAsDataUrl(a.url);
      return createAppFromUrl(a.url, a.name, icon);
    }),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
