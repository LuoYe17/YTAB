# YTAB

> Replace your new tab with a Launchpad-style start page.

Chromium（Chrome / Brave 等）**MV3** 新标签**起始页**扩展：秒级**时钟**、Wallhaven **壁纸**、**一言**、Bing **搜索**，以及带文件夹与多页的 Launchpad 式 **App 网格**。

> 截图待补。

## 功能

- **时钟**：时:分:秒 + 日期
- **壁纸**：Wallhaven；桌面横屏比例；日更与预取池；可配 API Key / 纯度 / 分类
- **一言**：打开起始页尝试换一句；失败用本地缓存
- **搜索**：Bing（`cn.bing.com` / `www.bing.com`）
- **App 网格**：拖拽换位、停住合文件夹、多页与边缘翻页、文件夹叠加层
- **设置**：小弹窗（侧栏只有通用 / 壁纸，头像条进账号页）；账号备份、重置
- **首次启动**：作者默认配置 或 零配置；已有账号可登录拉回

## 开发与加载

```bash
pnpm install
pnpm dev
```

浏览器：`扩展程序` → 开发者模式 →「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`。

```bash
pnpm test    # Vitest
pnpm check   # svelte-check
pnpm build   # 生产构建 → .output/chrome-mv3
```

## 参与

欢迎 issue 与小修 PR。大改请先开 issue 讨论。PR 请提交到 **`dev`** 分支。

详见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 文档

- 领域术语：[`CONTEXT.md`](./CONTEXT.md)
- 分支模型：[`docs/agents/github-flow.md`](./docs/agents/github-flow.md)
- 决策记录：[`docs/adr/`](./docs/adr/)

## 许可

[MIT](./LICENSE)
