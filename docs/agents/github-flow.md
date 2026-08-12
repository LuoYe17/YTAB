# GitHub 分支模型（main + dev）

本仓库用 **长期 `main` + 长期 `dev`**，功能用短命分支。不是「只有 main」的纯 GitHub Flow。

## 两条长期线

| 分支 | 角色 |
|------|------|
| **`main`** | **发布 / 可装基线**。只有认定「能长期用」才从 `dev` 合入。日常不在此编码。 |
| **`dev`** | **唯一日常主线**。所有编码（含小修、文档）都在此。 |

默认分支（GitHub）仍为 **`main`**（克隆看到的发布线）。本地日常检出 **`dev`**。

## 日常

1. 同步并检出 `dev`
2. **小改**：直接提交在 `dev` 上并 push  
3. **大改**：从 `dev` 开 `feat/…` / `fix/…` / `chore/…` → PR → **squash** 进 `dev` → 删分支  
4. **发布**：`dev` → PR → **squash** 进 `main`

提交说明用 **中文**。合入 `main` / `dev` 的 PR 默认 **squash**。

## 硬规则

- 不直推产品改动到 `main`（`main` 仅收来自 `dev` 的 PR）
- 无第三长期线（不要再养 `develop` 以外的并行主线名）
- 暂不打版本 tag（上架再说）；本地以 `pnpm check && pnpm build` 为准，暂不上 CI
- **`prototypes/`**：仅本地（gitignore），不推远程、不合任何长期分支
- **`.scratch/`**：本地 issues / specs，不进远程

## Agent

- 默认在 **`dev`** 上改代码与提交；用户说「提交 / push」且未指 `main` 时，对准 `dev`
- 发布进 `main` 须用户明确要求（开 `dev`→`main` 的 PR）
