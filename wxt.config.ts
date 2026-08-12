import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'YTAB',
    description: '浏览器新标签起始页',
    permissions: ['storage', 'alarms', 'unlimitedStorage'],
    host_permissions: [
      'https://wallhaven.cc/*',
      'https://*.wallhaven.cc/*',
      'https://i.wallhaven.cc/*',
      'https://v1.hitokoto.cn/*',
      'https://www.google.com/s2/favicons*',
      'http://*/*',
      'https://*/*',
    ],
  },
  vite: () => ({
    optimizeDeps: {
      exclude: ['@dnd-kit/svelte', '@dnd-kit/svelte/sortable'],
    },
  }),
  // 作者本机只有 Brave，无 Chrome；把 chrome 通道指到 Brave
  webExt: {
    binaries: {
      chrome:
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    },
  },
});
