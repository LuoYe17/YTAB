# App 网格拖拽：@dnd-kit/svelte + 停住合文件夹

原生 HTML5 拖拽跟手差，视觉天花板低；`svelte-dnd-action` 动画开箱好，但「停住才合文件夹」等自定义碰撞语义更拧。选定 **`@dnd-kit/svelte`**（Pointer + DragOverlay）做底座，让位动画用 Svelte 自带 **`animate:flip`**，合文件夹 / 放进文件夹均以短暂停住区分于换位。

## Considered Options

- 继续 HTML5 Drag and Drop — 否决：幽灵图与跟手体验不足
- `svelte-dnd-action` — 动画强，合文件夹停住语义要硬钩；可作为动画参考，不作底座
- `@dnd-kit/svelte` + `flip` — 采用：跟手、碰撞、自定义停住合文件夹最可控
- 自研 pointer — 工作量大，无必要先于库

## Consequences

正式实现前用 `prototypes/app-grid-dnd` 验证手感；**2026-08-12 用户确认手感通过**。让位约停 0.2s，合文件夹约停中心 0.4s；排序用应用状态 + `flip`，勿用会抢 DOM 的 `createSortable`。

**B（2026-08-12）**：拖到视口左右边缘停约 0.4s 翻页（蓝条提示）；打开文件夹后内部同样 dwell 换位（不合文件夹）。跨页拖 Esc 回滚整表快照。

**C（2026-08-13）**：上述停住规则从组件收进 `src/lib/gridDrag.ts` 的拖拽会话，时间经 clock 口注入、网格尺寸与文件夹壳经读取口注入，于是 0.4s / 0.22s / 0.32s / 翻页冷却都能用假时钟验证。会话按 scope 出事件子集（文件夹内没有合文件夹与翻页），文件夹拖出所需的主网格落点由起始页显式传入，不再跨组件 `querySelector`。`IconSortGrid` 退为 dnd-kit 接线与渲染。同时去掉 metrics 读不到时的 `elementFromPoint` 兜底：拖拽中网格必有磁贴，空文件夹会自动拆、空页会被丢弃，该分支不可达。
