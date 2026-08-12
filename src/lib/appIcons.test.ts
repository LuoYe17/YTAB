import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBestIcon } from 'favicon-pro';
import { applyBundledIcons, bundledIconUrl, displayAppIcon, hostnameOf, resolveAppIcon, svgDataUrl } from './appIcons';
import deepseekSvg from '../assets/app-icons/chat.deepseek.com.svg?raw';
import bingSvg from '../assets/bing.svg?raw';
import { createEmptyState, type AppItem } from './types';

vi.mock('favicon-pro', () => ({
  getBestIcon: vi.fn(),
}));

function app(id: string, url: string, icon = ''): AppItem {
  return { id, kind: 'app', name: id, url, icon };
}

describe('bundled App icons', () => {
  it('hostnameOf：小写 host', () => {
    expect(hostnameOf('https://GitHub.com/foo')).toBe('github.com');
    expect(hostnameOf('not a url')).toBe('');
  });

  it('bundledIconUrl：作者默认站有内置，未知站为空', () => {
    expect(bundledIconUrl('https://github.com')).toMatch(/^data:image\/svg\+xml/);
    expect(bundledIconUrl('https://www.bilibili.com')).toMatch(/^data:image\/svg\+xml/);
    expect(bundledIconUrl('https://linux.do')).toBeTruthy();
    expect(bundledIconUrl('https://mail.163.com')).toBeTruthy();
    expect(bundledIconUrl('https://chat.deepseek.com')).toBeTruthy();
    expect(bundledIconUrl('https://example.com')).toBe('');
  });

  it('displayAppIcon：idb: 与相对路径在 chrome://newtab/ 会裂图，改走内置', () => {
    const site = 'https://chat.deepseek.com';
    expect(displayAppIcon(site, 'idb:abc')).toMatch(/^data:image\/svg\+xml/);
    expect(displayAppIcon(site, '/assets/x.svg')).toMatch(/^data:image\/svg\+xml/);
    expect(displayAppIcon(site, 'data:keep')).toBe('data:keep');
    expect(displayAppIcon('https://example.com', '/assets/x.svg')).toBe('/assets/x.svg');
  });

  it('applyBundledIcons：只替换 hostname 命中且仍是自动抓取残留的 App', () => {
    const googleGh = 'https://www.google.com/s2/favicons?domain=github.com&sz=128';
    const state = {
      ...createEmptyState(),
      pages: [[
        app('gh', 'https://github.com', googleGh),
        app('gh-custom', 'https://github.com', 'data:image/png;base64,xx'),
        app('x', 'https://example.com', googleGh),
        {
          id: 'f',
          kind: 'folder' as const,
          name: '文件夹',
          children: [app('gm', 'https://mail.google.com', 'idb:old-mail')],
        },
      ]],
    };
    const next = applyBundledIcons(
      state,
      new Map([
        ['github.com', 'data:gh'],
        ['mail.google.com', 'data:gm'],
      ]),
    );
    expect(next.pages[0]![0]?.kind === 'app' && next.pages[0]![0].icon).toBe('data:gh');
    expect(next.pages[0]![1]?.kind === 'app' && next.pages[0]![1].icon).toBe('data:image/png;base64,xx');
    expect(next.pages[0]![2]?.kind === 'app' && next.pages[0]![2].icon).toBe(googleGh);
    const f = next.pages[0]![3];
    expect(f?.kind).toBe('folder');
    if (f?.kind !== 'folder') return;
    expect(f.children[0]?.icon).toBe('data:gm');
  });

  it('内置 SVG 不含 XML 非法控制符', () => {
    const illegal = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
    expect(deepseekSvg).not.toMatch(illegal);
    expect(bingSvg).not.toMatch(illegal);
  });

  it('svgDataUrl 剥掉 form feed，避免 img 裂图', () => {
    const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><!--\u000c--></svg>');
    const body = decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length));
    expect(body).not.toContain('\f');
    expect(bundledIconUrl('https://chat.deepseek.com')).toMatch(/^data:image\/svg\+xml/);
  });
});

describe('resolveAppIcon fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(getBestIcon).mockReset();
  });

  it('站点图标 fetch 失败则回退 Google', async () => {
    vi.mocked(getBestIcon).mockResolvedValue({ src: 'https://cdn.example/site.png' } as never);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('google.com/s2/favicons')) {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      return new Response('nope', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const icon = await resolveAppIcon('https://example.com');
    expect(icon).toContain('google.com/s2/favicons');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('cdn.example/site.png'))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('google.com/s2/favicons'))).toBe(true);
  });
});
