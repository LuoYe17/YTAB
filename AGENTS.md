## Agent skills

### Issue tracker

本仓库的 issues / specs 放在本地 `.scratch/` 目录（markdown）。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五类标准分诊角色，标签名与角色名一致（`needs-triage` 等）。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

### Git 分支

长期 **`main`（可装基线）** + **`dev`（日常编码）**；大改短命分支开 PR 后由维护者手动 squash 进 `dev`，发布同理进 `main`。Agent **不得**自动 `gh pr merge`。详见 `docs/agents/github-flow.md` 与 ADR-0012。
