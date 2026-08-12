/** 作者默认 App 图标：扩展内置；其余走站点最大图标库。 */

import { getBestIcon } from 'favicon-pro';
import type { AppItem, YtabState } from './types';

import githubSvg from '../assets/app-icons/github.com.svg?raw';
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

/** 作者默认站：不能把 idb: / 相对路径喂给 img，chrome://newtab/ 会裂图。 */
export function displayAppIcon(siteUrl: string, icon: string): string {
  const bundled = bundledIconUrl(siteUrl);
  if (!bundled) return icon;
  if (!icon || icon.startsWith('idb:') || icon.startsWith('/') || icon.startsWith('chrome:')) {
    return bundled;
  }
  return icon;
}

/** 作者默认配置按 hostname 命中的内置图；没有则空串。 */
export function bundledIconUrl(siteUrl: string): string {
  const host = hostnameOf(siteUrl);
  if (!host) return '';
  return BUNDLED[host] ?? BUNDLED[host.replace(/^www\./, '')] ?? '';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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

/** 空 / 裂图引用 / Google 小图才换成内置；用户上传或自定义 URL 不动。 */
function shouldApplyBundledIcon(icon: string): boolean {
  if (!icon) return true;
  if (icon.startsWith('idb:') || icon.startsWith('/') || icon.startsWith('chrome:')) return true;
  try {
    const u = new URL(icon);
    return u.hostname === 'www.google.com' && u.pathname.includes('/s2/favicons');
  } catch {
    return false;
  }
}

/** 把内置表里的图填进网格；只改 hostname 命中、且仍是自动抓取残留的 App。 */
export function applyBundledIcons(state: YtabState, dataUrls: Map<string, string>): YtabState {
  const mapApp = (app: AppItem): AppItem => {
    if (!shouldApplyBundledIcon(app.icon)) return app;
    const host = hostnameOf(app.url);
    const data = dataUrls.get(host) ?? dataUrls.get(host.replace(/^www\./, ''));
    if (!data) return app;
    return { ...app, icon: data };
  };
  return {
    ...state,
    pages: state.pages.map((page) =>
      page.map((item) => {
        if (item.kind === 'app') return mapApp(item);
        return { ...item, children: item.children.map(mapApp) };
      }),
    ),
  };
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
