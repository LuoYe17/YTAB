import type { GridItem } from './types';

/** IconSortGrid 拖拽对外只报结果，不暴露指针阶段。 */
export type IconSortDragOutcome =
  | { type: 'sessionStart' }
  | { type: 'sessionCancel' }
  | { type: 'reorder'; items: GridItem[] }
  | { type: 'merge'; fromId: string; ontoId: string }
  | { type: 'intoFolder'; appId: string; folderId: string }
  | {
      type: 'pageFlip';
      toPage: number;
      fromPageWithoutItem: GridItem[];
      item: GridItem;
    }
  | { type: 'outsideDwell' }
  | { type: 'outsideDrop'; itemId: string; clientX: number; clientY: number };
