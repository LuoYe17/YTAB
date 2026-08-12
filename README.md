# YTAB

Brave / Chrome MV3 新标签起始页扩展。

## 开发

```bash
pnpm install
pnpm dev
```

Brave：`brave://extensions` → 开发者模式 →「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`。

`pnpm dev` 已配置为启动本机 Brave（见 `wxt.config.ts` 的 `webExt.binaries.chrome`）。若 Brave 安装路径不同，改该路径即可。

```bash
pnpm check   # svelte-check
pnpm build   # 生产构建
```

## 文档

- 领域术语：`CONTEXT.md`
- Agent 约定：`AGENTS.md`、`docs/agents/`
- 决策：`docs/adr/`
