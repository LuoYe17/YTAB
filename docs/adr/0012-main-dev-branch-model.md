# 长期 main + 长期 dev 的分支模型

一人维护的扩展仓库需要「随时可装的发布线」和「可折腾的日常线」分开：选定 **`main` = 可装基线**、**`dev` = 唯一编码主线**；大改用短命分支 **squash** 进 `dev`，发布再 **squash** 进 `main`。否决了纯 GitHub Flow（无长期 dev）以及 Git Flow 式多条长期 release 线——前者无法满足「所有编码都在 dev」，后者过重。

## Considered Options

- 仅 `main` 的 GitHub Flow — 否决：与「所有编码在 dev」冲突
- Git Flow（`develop` + release/hotfix 多线）— 否决：一人仓库仪式过多
- `main` + `dev`（本决策）— 采用

## Consequences

Agent 与人类默认在 `dev` 工作；`main` 只接受来自 `dev` 的 PR。`prototypes/` 与 `.scratch/` 保持本地。细则见 `docs/agents/github-flow.md`。
