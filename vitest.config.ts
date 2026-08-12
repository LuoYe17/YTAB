import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  assetsInclude: ['**/*.ico'],
  resolve: {
    alias: {
      // Node 条件会走到 CJS + node-fetch；测试与浏览器一样用 ESM（全局 fetch + DOMParser）
      'favicon-pro': fileURLToPath(new URL('./node_modules/favicon-pro/dist/index.esm.js', import.meta.url)),
    },
  },
});
