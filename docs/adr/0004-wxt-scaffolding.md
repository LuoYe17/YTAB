# 扩展脚手架采用 WXT

MV3 起始页扩展选用 **WXT** 作为构建与开发脚手架（配合 Vite + Svelte），而不是手写 Vite+manifest 或单独上 `@crxjs/vite-plugin`。目标是少维护 HMR、内容入口与打包细节，把时间留在产品行为上。与「性能优先用 Svelte」不冲突：WXT 负责扩展工程，Svelte 负责页面运行时重量。
