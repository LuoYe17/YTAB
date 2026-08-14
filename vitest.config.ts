import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig } from 'vitest/config';

// pnpm 不把传递依赖提升到根；编译器插件已由 @wxt-dev/module-svelte 带上，不另装一份。
const require = createRequire(import.meta.url);
const { svelte } = (await import(
  pathToFileURL(
    require.resolve('@sveltejs/vite-plugin-svelte', {
      paths: [require.resolve('@wxt-dev/module-svelte')],
    }),
  ).href
)) as { svelte: (opts?: { configFile?: false }) => import('vite').PluginOption };

export default defineConfig({
  plugins: [
    // 只编译 .svelte；环境仍按文件 // @vitest-environment，lib 测试保持 node。
    svelte({ configFile: false }),
  ],
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
  assetsInclude: ['**/*.ico'],
  resolve: {
    // 否则 svelte 会走到 index-server，mount 在 jsdom 里不可用。
    conditions: ['browser'],
    alias: {
      // Node 条件会走到 CJS + node-fetch；测试与浏览器一样用 ESM（全局 fetch + DOMParser）
      'favicon-pro': fileURLToPath(new URL('./node_modules/favicon-pro/dist/index.esm.js', import.meta.url)),
    },
  },
});
