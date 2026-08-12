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
3. **大改**：从 `dev` 开 `feat/…` / `fix/…` / `chore/…` → 开 PR（base=`dev`）→ **由维护者手动** **squash** 合入 `dev` → 删分支。**同一条线上的相关改动攒成一条 PR 再开**（CodeRabbit 试用约 3 次审查/小时；拆多条会把额度打光）。无关的两条线不要硬捏。  
4. **发布**：`dev` → 开 PR（base=`main`）→ **由维护者手动** **squash** 合入 `main`

提交说明用 **中文**，并加英文类型前缀（Conventional Commits 风格），例如：

- `feat:` 新能力 / 用户可见行为
- `fix:` 修 bug
- `docs:` 文档、贡献指南、流程说明
- `refactor:` 重构（行为不变或几乎不变）
- `chore:` 脚手架、依赖、仓库门面、杂项

示例：`docs: 约定 PR 由维护者手动合入，禁止 Agent 自动 merge。`  
合入 `main` / `dev` 的 PR 默认 **squash**（squash 标题也尽量带前缀）。  
**合入权在人**：Agent / 自动化 **不得** `gh pr merge`（或等价自动合入）；开好 PR、给链接即可，等维护者在 GitHub 上点合。

## 硬规则

- 不直推产品改动到 `main`（`main` 仅收来自 `dev` 的 PR）
- **`main` 受 GitHub Ruleset 保护**（Ruleset 名：`Protect main`）：禁止直推、强制推送与删除；合入须经 PR，且仅允许 **squash**；不要求审批人数（一人维护）。查看：[Rules](https://github.com/LuoYe17/YTAB/rules/20751987)
- **`dev` 不设分支保护**（允许小改直推）；大改仍走 PR 是流程约定
- **禁止自动合 PR**（含 squash / merge / rebase 合入）；除非用户当次明确说「合掉 / merge PR」
- 无第三长期线（不要再养 `develop` 以外的并行主线名）
- 暂不打版本 tag（上架再说）；本地以 `pnpm check && pnpm build` 为准，暂不上 CI；Ruleset **暂不**要求 status checks
- **`prototypes/`**：仅本地（gitignore），不推远程、不合任何长期分支
- **`.scratch/`**：本地 issues / specs，不进远程

## Agent

- 默认在 **`dev`** 上改代码与提交；用户说「提交 / push」且未指 `main` 时，对准 `dev`
- 提交信息：`英文前缀:` + 中文说明（见上文）；不要省略前缀
- **大改**：相关改动在同一短命分支上做完再 `gh pr create`（base=`dev`），然后 **停下**；把 PR URL 交给用户，**不要** `gh pr merge`。不要把可攒的切片拆成多条 PR。
- 发布进 `main`：仅当用户明确要求时开 `dev`→`main` 的 PR；同样 **不要** 自动合入
