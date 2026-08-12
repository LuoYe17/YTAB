# 注释规范

**注释讲 why，代码讲 what。** 代码自己说不清时，先改代码（换名、拆函数），不用注释遮掩。

## 必写注释的地方

1. **领域规则**：为什么这么写、为什么不能那么写。范例（仓库现有）：
   - `appGrid.ts` 合文件夹：`/** 把一个 App 拖到另一个 App 上并短暂停住后... */`
   - `storage.ts`：`// Meta first and alone — wallpaper failure must never wipe Apps.`
2. **非直觉逻辑**：复杂算法、正则、性能取舍；临时 hack 附撤销条件。
3. **修复原因**：bug 修复注释防后人「修回去」；已知限制与边界。
4. **公共 API**：`src/lib/` 中被组件 import 的导出函数，TSDoc `/** */`——意图 + 参数/返回/异常 + 领域规则。内部函数不强制。
5. **模块头**：一句话职责与边界（如 `appGrid.ts` 的「纯逻辑，无 DOM / 无 persist」）。

## 写法

- 中文；完整句子
- 贴住所描述代码的最近处
- 与代码**同一次提交**更新——过期注释比没有更糟
- 外部复制的代码留来源链接
- 把注释预算留给上面清单里的内容；显而易见的代码不消费预算

## 公共 API 范例

```ts
/** 文件夹拖出：调用方已算好 insertAt（DOM 落点留在 UI）。 */
export function ejectFromFolderAt(
  view: AppGridView,
  folderId: string,
  appId: string,
  insertAt: number,
): AppGridView {
```
