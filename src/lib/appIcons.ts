/** App 图标：上屏只走 srcFor；落盘拆分为 pack / unpack；添加时 resolve。 */

import { getBestIcon } from 'favicon-pro';
import { blobToDataUrl } from './dataUrl';
import { extractIconBlobs, hydrateIconBlobs, META_ICON_PREFIX } from './iconPersist';
import type { AppItem, YtabState } from './types';

import githubSvg from '../assets/app-icons/github.com.svg?raw';
import cloudflareSvg from '../assets/app-icons/dash.cloudflare.com.svg?raw';
import cursorSvg from '../assets/app-icons/cursor.com.svg?raw';
import grokSvg from '../assets/app-icons/grok.com.svg?raw';
import xSvg from '../assets/app-icons/x.com.svg?raw';
import gmailSvg from '../assets/app-icons/mail.google.com.svg?raw';
import geminiSvg from '../assets/app-icons/gemini.google.com.svg?raw';
import chatgptSvg from '../assets/app-icons/chatgpt.com.svg?raw';
import claudeSvg from '../assets/app-icons/claude.ai.svg?raw';
import deepseekSvg from '../assets/app-icons/chat.deepseek.com.svg?raw';
import protonSvg from '../assets/app-icons/mail.proton.me.svg?raw';
import mail163Svg from '../assets/app-icons/mail.163.com.svg?raw';
import linuxDoSvg from '../assets/app-icons/linux.do.svg?raw';
import bilibiliSvg from '../assets/app-icons/www.bilibili.com.svg?raw';
import douyinSvg from '../assets/app-icons/www.douyin.com.svg?raw';

/**
 * 内置 SVG 编成 data URL 给 img 用。
 * XML 1.0 禁止的控制符（含 form feed）会让浏览器整图解析失败，显示裂图。
 */
export function svgDataUrl(svg: string): string {
  const clean = svg.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
}

const BUNDLED: Record<string, string> = {
  'github.com': svgDataUrl(githubSvg),
  'dash.cloudflare.com': svgDataUrl(cloudflareSvg),
  'www.cloudflare.com': svgDataUrl(cloudflareSvg),
  'cloudflare.com': svgDataUrl(cloudflareSvg),
  'cursor.com': svgDataUrl(cursorSvg),
  'www.cursor.com': svgDataUrl(cursorSvg),
  'grok.com': svgDataUrl(grokSvg),
  'www.grok.com': svgDataUrl(grokSvg),
  'x.com': svgDataUrl(xSvg),
  'twitter.com': svgDataUrl(xSvg),
  'www.x.com': svgDataUrl(xSvg),
  'mail.google.com': svgDataUrl(gmailSvg),
  'gemini.google.com': svgDataUrl(geminiSvg),
  'chatgpt.com': svgDataUrl(chatgptSvg),
  'claude.ai': svgDataUrl(claudeSvg),
  'chat.deepseek.com': svgDataUrl(deepseekSvg),
  'mail.proton.me': svgDataUrl(protonSvg),
  'mail.163.com': svgDataUrl(mail163Svg),
  'linux.do': svgDataUrl(linuxDoSvg),
  'www.bilibili.com': svgDataUrl(bilibiliSvg),
  'bilibili.com': svgDataUrl(bilibiliSvg),
  'www.douyin.com': svgDataUrl(douyinSvg),
  'douyin.com': svgDataUrl(douyinSvg),
};

export function hostnameOf(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** chrome://newtab/ 上这些引用会裂图，不能喂给 img。 */
function isBrokenIconRef(icon: string): boolean {
  return !icon || icon.startsWith(META_ICON_PREFIX) || icon.startsWith('/') || icon.startsWith('chrome:');
}

/**
 * 磁贴、叠加层、编辑预览喂给 `<img src>` 的唯一入口。
 * 从不返回 `idb:` / 相对路径 / `chrome:`；未知站坏引用给空串走字号占位，作者默认站坏引用走内置 data URL。
 */
export function srcFor(app: AppItem): string {
  if (!isBrokenIconRef(app.icon)) return app.icon;
  return bundledIconUrl(app.url);
}

/** 作者默认配置按 hostname 命中的内置图；没有则空串。 */
export function bundledIconUrl(siteUrl: string): string {
  const host = hostnameOf(siteUrl);
  if (!host) return '';
  return BUNDLED[host] ?? BUNDLED[host.replace(/^www\./, '')] ?? '';
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const blob = await res.blob();
    if (!blob.type.startsWith('image/') && blob.type !== 'image/x-icon') {
      const buf = await blob.slice(0, 16).arrayBuffer();
      const b0 = new Uint8Array(buf)[0];
      // 误下到 HTML 时不要当图标缓存
      if (b0 === 0x3c) return '';
    }
    return blobToDataUrl(blob);
  } catch {
    // 空串让 resolveAppIcon 走 Google，而不是把坏地址当成已有图
    return '';
  }
}

/** 只换空 / idb: / 相对 / chrome: / Google s2。用户上传的 data:（含 SVG）不能换，否则解包会盖掉。 */
function shouldApplyBundledIcon(icon: string): boolean {
  if (isBrokenIconRef(icon)) return true;
  try {
    const u = new URL(icon);
    return u.hostname === 'www.google.com' && u.pathname.includes('/s2/favicons');
  } catch {
    return false;
  }
}

/** 把内置表里的图填进网格；只改 hostname 命中、且仍是空/裂图/Google 小图的 App。无改动则原引用，方便启动时决定要不要落盘。 */
export function applyBundledIcons(state: YtabState, dataUrls: Map<string, string>): YtabState {
  let changed = false;
  const mapApp = (app: AppItem): AppItem => {
    if (!shouldApplyBundledIcon(app.icon)) return app;
    const host = hostnameOf(app.url);
    const data = dataUrls.get(host) ?? dataUrls.get(host.replace(/^www\./, ''));
    if (!data || data === app.icon) return app;
    changed = true;
    return { ...app, icon: data };
  };
  const pages = state.pages.map((page) =>
    page.map((item) => {
      if (item.kind === 'app') return mapApp(item);
      return { ...item, children: item.children.map(mapApp) };
    }),
  );
  return changed ? { ...state, pages } : state;
}

/**
 * 落盘拆分：data: 抽到 blobs，meta 只留引用并清空壁纸像素。
 * 像素不能进 chrome.storage。
 */
export function pack(state: YtabState): { meta: YtabState; blobs: Map<string, string> } {
  return extractIconBlobs(state);
}

/**
 * 读盘还原：先把 blobs 填回 icon，再按 hostname 把仍可换代的 App 换成内置图（用户上传不动）。
 */
export function unpack(state: YtabState, blobs: Map<string, string>): YtabState {
  return applyBundledIcons(hydrateIconBlobs(state, blobs), new Map(Object.entries(BUNDLED)));
}

export async function bundledIconDataUrls(): Promise<Map<string, string>> {
  return new Map(Object.entries(BUNDLED));
}

/**
 * 自动取 App 图标：内置 → 站点最大图 → Google 小图。
 * 用户在编辑里填的 URL / 上传不走这里。
 */
export async function resolveAppIcon(siteUrl: string): Promise<string> {
  const bundled = bundledIconUrl(siteUrl);
  if (bundled) return bundled;
  try {
    const best = await getBestIcon(siteUrl);
    if (best?.src) {
      const data = await urlToDataUrl(best.src);
      if (data) return data;
    }
  } catch {
    /* 回退 Google */
  }
  const google = googleFaviconUrl(siteUrl);
  if (!google) return '';
  try {
    return (await urlToDataUrl(google)) || google;
  } catch {
    return google;
  }
}

function googleFaviconUrl(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return '';
  }
}
