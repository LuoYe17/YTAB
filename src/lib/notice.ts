/**
 * 起始页顶部通知：同时只一条，新的顶掉旧的。
 *
 * 进出场时序也在这里：同一条文案连点只续时、不重播进出；换了文案则旧的先右溜、
 * 溜完新的再从左边滑入；2 秒后自动收走。宿主只负责渲染 view 与把 animationend 转回来。
 */

import type { WallpaperFailFocus } from './wallpaperFail';

export type NoticeTone = 'ok' | 'fail';

export type Notice = {
  id: number;
  tone: NoticeTone;
  before: string;
  action?: { text: string; focus: WallpaperFailFocus };
  after?: string;
};

/** 宿主要渲染的全部内容：哪条、正在进场还是退场。 */
export type NoticeView = {
  notice: Notice | null;
  phase: 'in' | 'out';
};

export type NoticeControllerDeps = {
  holdMs?: number;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
};

const HOLD_MS = 2000;

function sameCopy(a: Notice, b: Notice): boolean {
  return (
    a.tone === b.tone &&
    a.before === b.before &&
    a.after === b.after &&
    a.action?.text === b.action?.text &&
    a.action?.focus === b.action?.focus
  );
}

export function createNoticeController(deps: NoticeControllerDeps = {}) {
  const holdMs = deps.holdMs ?? HOLD_MS;
  const setTimer = deps.setTimeout ?? ((fn, ms) => window.setTimeout(fn, ms));
  const clearTimer = deps.clearTimeout ?? ((id) => window.clearTimeout(id));

  let seq = 0;
  let shown: Notice | null = null;
  let phase: 'in' | 'out' = 'in';
  /** 等旧的溜完才入场的下一条 */
  let pending: Notice | null = null;
  let hold: number | null = null;
  const listeners = new Set<(view: NoticeView) => void>();

  function view(): NoticeView {
    return { notice: shown, phase };
  }

  function emit() {
    const current = view();
    for (const fn of listeners) fn(current);
  }

  function clearHold() {
    if (hold !== null) clearTimer(hold);
    hold = null;
  }

  function armHold(id: number) {
    clearHold();
    // 只收自己这条：慢一步的定时器不能把后来居上的那条带走。
    hold = setTimer(() => {
      hold = null;
      if (shown?.id !== id) return;
      phase = 'out';
      emit();
    }, holdMs);
  }

  /** 新来一条：决定是续时、还是让旧的先溜。卡片要等 slip 播完才卸。 */
  function arrive(next: Notice) {
    if (shown && shown.id !== next.id) {
      if (sameCopy(shown, next)) {
        pending = null;
        shown = next;
        if (phase === 'out') phase = 'in';
        armHold(next.id);
        return;
      }
      pending = next;
      phase = 'out';
      return;
    }
    shown = next;
    phase = 'in';
    armHold(next.id);
  }

  return {
    /** 滑入一条新通知；已有的会被顶掉（先右溜再从左边入）。 */
    show(input: Omit<Notice, 'id'>): void {
      seq += 1;
      arrive({ ...input, id: seq });
      emit();
    },

    /** 关掉当前条（走退场动画）。传 id 时只关这一条。 */
    dismiss(id?: number): void {
      if (!shown) return;
      if (id !== undefined && shown.id !== id) return;
      clearHold();
      phase = 'out';
      emit();
    },

    /**
     * 宿主转发 animationend。`arrive` 被换成 `slip` 时也会冒泡，
     * 因此只认右溜结束才真正卸下并放行排队中的那条。
     */
    animationEnded(name: string): void {
      if (phase !== 'out' || name !== 'slip') return;
      shown = null;
      if (pending) {
        const next = pending;
        pending = null;
        shown = next;
        phase = 'in';
        armHold(next.id);
      }
      emit();
    },

    /** 订阅 view；立即回放一次，便于挂载时赶上已有通知。 */
    subscribe(fn: (view: NoticeView) => void): () => void {
      listeners.add(fn);
      fn(view());
      return () => {
        listeners.delete(fn);
      };
    },

    /** 宿主卸载时掐掉未开火的定时器。 */
    dispose(): void {
      clearHold();
      listeners.clear();
    },
  };
}

const controller = createNoticeController();

export function subscribeNotice(fn: (view: NoticeView) => void): () => void {
  return controller.subscribe(fn);
}

export function showNotice(input: Omit<Notice, 'id'>): void {
  controller.show(input);
}

export function dismissNotice(id?: number): void {
  controller.dismiss(id);
}

/** 无链接的短通知。 */
export function plainNotice(tone: NoticeTone, text: string): void {
  controller.show({ tone, before: text });
}

/** 宿主把 animationend 的动画名转回来。 */
export function noticeAnimationEnded(name: string): void {
  controller.animationEnded(name);
}
