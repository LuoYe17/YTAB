# 参与贡献

谢谢关注 YTAB。欢迎提 issue、修小问题、改文档。

## 怎么参与

1. **先搜 issue**：避免重复。
2. **大改先开 issue 讨论**：功能方向、交互大改、依赖更换等，先对齐再动手。
3. **小修与文档**：可直接开 PR（错别字、明显 bug、文档澄清）。
4. **行为准则**：见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 开发环境

需要 Node.js 与 [pnpm](https://pnpm.io/)。

```bash
pnpm install
pnpm dev          # 开发（可加载到 Chromium 系浏览器）
pnpm test         # Vitest
pnpm check        # svelte-check
pnpm build        # 产出 .output/chrome-mv3
```

在 Chrome / Brave / 其他 Chromium 浏览器：`扩展程序` → 开发者模式 →「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`。

## 分支与 PR

- 日常主线是 **`dev`**；可装基线是 **`main`**。
- **请向 `dev` 开 PR**，不要直推 `main`。
- 维护者会 **手动 squash** 合入；Agent / 机器人不会自动 merge。
- 细则：[`docs/agents/github-flow.md`](./docs/agents/github-flow.md)。

PR 打开前请尽量本地跑通：

```bash
pnpm test && pnpm check && pnpm build
```

## 报告问题

- Bug：复现步骤、期望行为、实际行为、浏览器与版本。
- 想法：要解决什么问题、大致交互；不需要一上来就贴大段实现。

## 许可

贡献内容默认按仓库 [MIT License](./LICENSE) 授权。
