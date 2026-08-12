# Domain Docs

工程技能在探索代码库时，应按如下方式消费本仓库的领域文档。

## 探索前先读这些

- 仓库根目录的 **`CONTEXT.md`**，或
- 若存在根目录 **`CONTEXT-MAP.md`**——它指向每个上下文各自的 `CONTEXT.md`。读与当前主题相关的那些。
- **`docs/adr/`** — 阅读与即将动手区域相关的 ADR。多上下文仓库中，还要检查 `src/<context>/docs/adr/` 下的上下文级决策。

若上述文件尚不存在，**静默继续**。不要把它们的缺失当成问题提出，也不要提前建议创建。`/domain-modeling` 技能（经 `/grill-with-docs` 与 `/improve-codebase-architecture` 进入）会在术语或决策真正敲定后按需创建。

## 文件结构

单上下文仓库（绝大多数仓库）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

本仓库为**单上下文**布局。

## 使用 glossary 中的词汇

输出中命名领域概念时（issue 标题、重构提案、假设、测试名等），使用 `CONTEXT.md` 中定义的术语。不要滑向 glossary 明确避免的同义词。

若需要的概念还不在 glossary 里——这是信号：要么你在发明项目不用的说法（请重新考虑），要么存在真实缺口（记下留给 `/domain-modeling`）。

## 标出与 ADR 的冲突

若你的输出与已有 ADR 矛盾，要显式指出，而不是默默覆盖：

> _与 ADR-0007（事件溯源订单）矛盾——但值得重开，因为……_
