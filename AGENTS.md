## Agent skills

### Issue tracker

本仓库的 issues / specs 放在本地 `.scratch/` 目录（markdown）。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五类标准分诊角色，标签名与角色名一致（`needs-triage` 等）。详见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`。

### 注释

注释讲 **why** 不讲 what；代码讲不清时先改代码。公共 API（`src/lib/` 导出）用 TSDoc。详见 `docs/agents/commenting.md`。

### 本地预览

改完一块相关代码后由 Agent 自己跑 `pnpm build`，不要让维护者补编。不要把「请你 build / 重载」写进回复。

### Git 分支

长期 **`main`（可装基线）** + **`dev`（日常编码）**；大改短命分支开 PR（指派自己、按标题前缀打类型标签）后由维护者手动 squash 进 `dev`，发布同理进 `main`。相关大改攒成一条 PR 再开。Agent **不得**自动 `gh pr merge`。详见 `docs/agents/github-flow.md` 与 ADR-0012。

### 资产清单

**DialogShell**（`src/components/DialogShell.svelte`）：居中小弹窗的遮罩 / Esc / `role=dialog` 一律用它。禁止再复制 `.overlay` + `.backdrop`。文件夹叠加层（FolderOverlay）、首次启动、设置内层 confirm、CtxMenu 不走这套。
**blobToDataUrl**（`src/lib/dataUrl.ts`）：文件/Blob 转 dataURL 一律用它，禁止复制 FileReader 包装。
