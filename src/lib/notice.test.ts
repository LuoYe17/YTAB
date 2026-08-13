import { describe, expect, it } from 'vitest';
import { createNoticeController, type NoticeView } from './notice';

const HOLD = 2000;

/** 假时钟：只按到期顺序开火，好断言「差 1ms 不走、到点才走」。 */
function harness() {
  let now = 0;
  let seq = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const views: NoticeView[] = [];

  const controller = createNoticeController({
    holdMs: HOLD,
    setTimeout: (fn, ms) => {
      seq += 1;
      jobs.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => {
      jobs.delete(id);
    },
  });

  const unsubscribe = controller.subscribe((v) => views.push(v));

  return {
    controller,
    views,
    view: () => views.at(-1)!,
    unsubscribe,
    pending: () => jobs.size,
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...jobs.entries()]
          .filter(([, job]) => job.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        jobs.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
  };
}

describe('notice controller', () => {
  it('订阅时立即回放当前 view', () => {
    const h = harness();
    expect(h.view()).toEqual({ notice: null, phase: 'in' });
  });

  it('show 后进场，2s 到点转退场，slip 播完才卸', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '已导出' });

    expect(h.view().notice).toMatchObject({ tone: 'ok', before: '已导出' });
    expect(h.view().phase).toBe('in');

    h.advance(HOLD - 1);
    expect(h.view().phase).toBe('in');

    h.advance(1);
    expect(h.view().phase).toBe('out');
    expect(h.view().notice).not.toBeNull();

    h.controller.animationEnded('slip');
    expect(h.view().notice).toBeNull();
  });

  it('同一条文案连点只续时，不重播进出', () => {
    const h = harness();
    h.controller.show({ tone: 'fail', before: '换图失败' });
    h.advance(HOLD - 200);

    h.controller.show({ tone: 'fail', before: '换图失败' });
    expect(h.view().phase).toBe('in');

    // 续了一整轮：原本还剩 200ms
    h.advance(HOLD - 1);
    expect(h.view().phase).toBe('in');
    h.advance(1);
    expect(h.view().phase).toBe('out');
  });

  it('换了文案：旧的先溜，溜完新的才入场', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '已导出' });
    h.controller.show({ tone: 'fail', before: '导入失败' });

    expect(h.view().phase).toBe('out');
    expect(h.view().notice).toMatchObject({ before: '已导出' });

    h.controller.animationEnded('slip');
    expect(h.view()).toMatchObject({ phase: 'in', notice: { before: '导入失败' } });
  });

  it('arrive 结束不误卸', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '已导出' });
    h.controller.show({ tone: 'fail', before: '导入失败' });

    h.controller.animationEnded('arrive');
    expect(h.view()).toMatchObject({ phase: 'out', notice: { before: '已导出' } });
  });

  it('排队中再来一条会覆盖前一条排队的', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '第一条' });
    h.controller.show({ tone: 'fail', before: '第二条' });
    h.controller.show({ tone: 'fail', before: '第三条' });

    h.controller.animationEnded('slip');
    expect(h.view().notice).toMatchObject({ before: '第三条' });
  });

  it('退场途中收到同文案会回弹并重新计时', () => {
    const h = harness();
    h.controller.show({ tone: 'fail', before: '一言没换成' });
    h.advance(HOLD);
    expect(h.view().phase).toBe('out');

    h.controller.show({ tone: 'fail', before: '一言没换成' });
    expect(h.view().phase).toBe('in');

    // 计时从头算：不重排的话这里早该退场了
    h.advance(HOLD - 1);
    expect(h.view().phase).toBe('in');
    h.advance(1);
    expect(h.view().phase).toBe('out');
  });

  it('宿主卸载时若正在退场，就地收掉，不留给下次挂载重播', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '已导出' });
    h.advance(HOLD);
    expect(h.view().phase).toBe('out');

    h.unsubscribe();
    const replayed: NoticeView[] = [];
    h.controller.subscribe((v) => replayed.push(v));

    expect(replayed[0]?.notice).toBeNull();
  });

  it('还在进场时卸载，通知留着，下次挂载还能看到', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '已导出' });

    h.unsubscribe();
    const replayed: NoticeView[] = [];
    h.controller.subscribe((v) => replayed.push(v));

    expect(replayed[0]).toMatchObject({ phase: 'in', notice: { before: '已导出' } });
  });

  it('旧条的迟到定时器收不走新条', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '第一条' });
    h.advance(HOLD - 100);

    h.controller.show({ tone: 'fail', before: '第二条' });
    h.controller.animationEnded('slip');
    expect(h.view()).toMatchObject({ phase: 'in', notice: { before: '第二条' } });

    // 第一条原本的 2s 到点：不能把第二条带走
    h.advance(100);
    expect(h.view()).toMatchObject({ phase: 'in', notice: { before: '第二条' } });
  });

  it('dismiss 传旧 id 无效，传当前 id 才退场', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '第一条' });
    const first = h.view().notice!.id;
    h.controller.dismiss();
    h.controller.animationEnded('slip');
    h.controller.show({ tone: 'fail', before: '第二条' });

    h.controller.dismiss(first);
    expect(h.view().phase).toBe('in');

    h.controller.dismiss(h.view().notice!.id);
    expect(h.view().phase).toBe('out');
  });

  it('dismiss 不传 id 关当前；空状态下不抛', () => {
    const h = harness();
    expect(() => h.controller.dismiss()).not.toThrow();

    h.controller.show({ tone: 'ok', before: '已重置' });
    h.controller.dismiss();
    expect(h.view().phase).toBe('out');
  });

  it('带链接的通知按整条比较是否同文案', () => {
    const h = harness();
    const base = {
      tone: 'fail' as const,
      before: '一张合适的都没找到 (´;ω;`) ',
      action: { text: '去设置 → 壁纸把尺度或分类放宽一点', focus: 'filters' as const },
      after: '吧',
    };
    h.controller.show(base);
    h.controller.show({ ...base });
    expect(h.view().phase).toBe('in');

    h.controller.show({ ...base, action: { text: '去设置 → 壁纸填个密钥', focus: 'apiKey' } });
    expect(h.view().phase).toBe('out');
  });

  it('dispose 清掉定时器与状态，之后再订阅是干净的', () => {
    const h = harness();
    h.controller.show({ tone: 'ok', before: '已导出' });
    h.controller.dispose();
    expect(h.pending()).toBe(0);

    h.advance(HOLD * 2);
    const after: NoticeView[] = [];
    h.controller.subscribe((v) => after.push(v));
    expect(after[0]).toEqual({ notice: null, phase: 'in' });
  });
});
