/** IconSortGrid 拖拽对外口：会话起停与落点结果走同一判别联合；激活与右键不在此。 */

import type { GridItem } from './types';

/**
 * 拖拽过程中的会话信号与松手结果。
 * sessionStart / outsideDwell 发生在指针仍按下时，调用方用来快照或关壳，不是最终落点。
 */
export type IconSortDragOutcome =
  | { type: 'sessionStart' }
  | { type: 'sessionCancel' }
  | { type: 'reorder'; items: GridItem[] }
  | { type: 'merge'; fromId: string; ontoId: string }
  | { type: 'intoFolder'; appId: string; folderId: string }
  | {
      type: 'pageFlip';
      toPage: number;
      /** from 页已去掉 item；调用方须把 item 放进 to 页。 */
      fromPageWithoutItem: GridItem[];
      item: GridItem;
    }
  | { type: 'outsideDwell' }
  | {
      type: 'outsideDrop';
      /** 关窗跟手后松手：按坐标落到主网格。 */
      itemId: string;
      clientX: number;
      clientY: number;
    };
