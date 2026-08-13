import { describe, expect, it } from 'vitest';
import {
  AUTOFILL_DEBOUNCE_MS,
  AUTOFILL_TIMEOUT_MS,
  MIN_SCAN_MS,
  SUCCESS_HOLD_MS,
  createAppDraft,
  type AppDraftSnapshot,
  type Clock,
} from './appDraft';
import type { AppItem } from './types';

function existing(): AppItem {
  return {
    id: 'x1',
    kind: 'app',
    name: '旧名字',
    url: 'https://old.example.com',
    icon: 'https://old.example.com/icon.png',
  };
}

/** 假时钟 + 可控网络：抓取结果由测试自己决定何时兑现。 */
function harness(options: { initial?: AppItem | null } = {}) {
  let now = 0;
  let seq = 0;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      seq += 1;
      jobs.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (id) => {
      jobs.delete(id);
    },
  };

  const iconCalls: string[] = [];
  const titleCalls: string[] = [];
  let iconValue = 'data:image/png;base64,ICON';
  let titleValue = '站点标题';
  let iconGate: Promise<void> | null = null;
  let openIconGate: (() => void) | null = null;
  let titleThrows = false;
  let fileThrows = false;

  let snap: AppDraftSnapshot;
  const draft = createAppDraft({
    initial: options.initial ?? null,
    onChange: (next) => {
      snap = next;
    },
    clock,
    resolveIcon: async (siteUrl) => {
      iconCalls.push(siteUrl);
      // 只挡住这一次，后面的抓取照常返回
      const gate = iconGate;
      iconGate = null;
      if (gate) await gate;
      return iconValue;
    },
    fetchTitle: async (siteUrl) => {
      titleCalls.push(siteUrl);
      if (titleThrows) throw new Error('title down');
      return titleValue;
    },
    readImageFile: async () => {
      if (fileThrows) throw new Error('read down');
      return 'data:image/png;base64,FILE';
    },
  });
  snap = draft.snapshot();

  return {
    draft,
    iconCalls,
    titleCalls,
    snap: () => snap,
    setIcon: (v: string) => {
      iconValue = v;
    },
    setTitle: (v: string) => {
      titleValue = v;
    },
    breakTitle: () => {
      titleThrows = true;
    },
    breakFileRead: () => {
      fileThrows = true;
    },
    /** 卡住下一次图标抓取，用来制造「慢的那次」 */
    holdIcon: () => {
      iconGate = new Promise<void>((resolve) => {
        openIconGate = resolve;
      });
    },
    releaseIcon: async () => {
      openIconGate?.();
      openIconGate = null;
      await flush();
    },
    /** 推进假时钟并让微任务跑完 */
    advance: async (ms: number) => {
      const until = now + ms;
      for (;;) {
        const due = [...jobs.entries()]
          .filter(([, job]) => job.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        jobs.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = until;
      await flush();
    },
    pending: () => jobs.size,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 走完一轮完整抓取：防抖 → 抓 → 最短扫描 → 成功停留 */
async function autofillFully(h: ReturnType<typeof harness>) {
  await h.advance(AUTOFILL_DEBOUNCE_MS);
  await h.advance(MIN_SCAN_MS);
  await h.advance(SUCCESS_HOLD_MS);
}

describe('app draft', () => {
  it('输入停住 480ms 才抓，边打边抓不发请求', async () => {
    const h = harness();
    h.draft.setUrl('exa');
    h.draft.setUrl('example.com');

    await h.advance(AUTOFILL_DEBOUNCE_MS - 1);
    expect(h.iconCalls).toEqual([]);

    await h.advance(1);
    expect(h.iconCalls).toEqual(['https://example.com']);
    expect(h.snap().phase).toBe('scan');
  });

  it('还在防抖里又改了网址，旧的那次不发出去', async () => {
    const h = harness();
    h.draft.setUrl('first.example.com');
    await h.advance(AUTOFILL_DEBOUNCE_MS - 50);
    h.draft.setUrl('second.example.com');
    await h.advance(AUTOFILL_DEBOUNCE_MS);

    // 不重排定时器的话这里会是两条
    expect(h.iconCalls).toEqual(['https://second.example.com']);
  });

  it('抓标题炸了不影响这一轮，名称退回主机名', async () => {
    const h = harness();
    h.breakTitle();
    h.draft.setUrl('example.com');
    await autofillFully(h);

    expect(h.snap().name).toBe('example.com');
    expect(h.snap().phase).toBe('idle');
    expect(h.snap().canSave).toBe(true);
  });

  it('图片读不出来要给话，不能没反应', async () => {
    const h = harness();
    h.breakFileRead();
    await h.draft.pickFile(new File([''], 'a.png', { type: 'image/png' }));

    expect(h.snap().fileError).toBe('这张图读不出来，换一张吧');
    expect(h.snap().icon).toBe('');
  });

  it('网址没成形不抓', async () => {
    const h = harness();
    h.draft.setUrl('https://');
    await h.advance(AUTOFILL_DEBOUNCE_MS * 2);

    expect(h.iconCalls).toEqual([]);
    expect(h.snap().phase).toBe('idle');
  });

  it('抓完补上名称与图标，扫描停够 700ms 才给成功', async () => {
    const h = harness();
    h.draft.setUrl('example.com');

    await h.advance(AUTOFILL_DEBOUNCE_MS);
    expect(h.snap().url).toBe('https://example.com');
    expect(h.snap().phase).toBe('scan');
    expect(h.snap().canSave).toBe(false);

    await h.advance(MIN_SCAN_MS);
    expect(h.snap().phase).toBe('success');
    expect(h.snap().canSave).toBe(true);
    expect(h.snap().name).toBe('站点标题');
    expect(h.snap().icon).toBe('data:image/png;base64,ICON');

    await h.advance(SUCCESS_HOLD_MS);
    expect(h.snap().phase).toBe('idle');
  });

  it('慢的那次回来时已经换了网址，结果作废', async () => {
    const h = harness();
    h.holdIcon();
    h.draft.setUrl('slow.example.com');
    await h.advance(AUTOFILL_DEBOUNCE_MS);
    expect(h.iconCalls).toEqual(['https://slow.example.com']);

    // 用户改了网址，第二轮抓的是新站
    h.setIcon('data:image/png;base64,FAST');
    h.draft.setUrl('fast.example.com');
    await h.advance(AUTOFILL_DEBOUNCE_MS);
    await autofillFully(h);
    expect(h.snap().url).toBe('https://fast.example.com');
    expect(h.snap().icon).toBe('data:image/png;base64,FAST');

    // 慢的那次这时才回来
    h.setIcon('data:image/png;base64,SLOW');
    await h.releaseIcon();
    expect(h.snap().icon).toBe('data:image/png;base64,FAST');
  });

  it('手填过图标地址后，自动抓取不再覆盖', async () => {
    const h = harness();
    h.draft.setIconField('https://cdn.example.com/mine.png');
    h.draft.setUrl('example.com');
    await autofillFully(h);

    expect(h.snap().icon).toBe('https://cdn.example.com/mine.png');
    expect(h.iconCalls).toEqual([]);
  });

  it('编辑已有 App 时不拿站点标题盖掉名字', async () => {
    const h = harness({ initial: existing() });
    h.draft.setUrl('new.example.com');
    await autofillFully(h);

    expect(h.snap().name).toBe('旧名字');
  });

  it('编辑带进来的图标算用户给的，不被覆盖', async () => {
    const h = harness({ initial: existing() });
    h.draft.setUrl('new.example.com');
    await autofillFully(h);

    expect(h.snap().icon).toBe('https://old.example.com/icon.png');
    expect(h.iconCalls).toEqual([]);
  });

  it('抓不到标题就退回主机名', async () => {
    const h = harness();
    h.setTitle('');
    h.draft.setUrl('example.com');
    await autofillFully(h);

    expect(h.snap().name).toBe('example.com');
  });

  it('图标抓取超时按抓不到算，不吊死扫描', async () => {
    const h = harness();
    h.holdIcon();
    h.draft.setUrl('example.com');
    await h.advance(AUTOFILL_DEBOUNCE_MS);

    // 超时兑现时早已过了最短扫描时长，直接给成功
    await h.advance(AUTOFILL_TIMEOUT_MS);
    expect(h.snap().phase).toBe('success');
    expect(h.snap().icon).toBe('');
  });

  it('改了网址就不能存，抓完才能存', async () => {
    const h = harness({ initial: existing() });
    expect(h.snap().canSave).toBe(true);

    h.draft.setUrl('new.example.com');
    expect(h.snap().canSave).toBe(false);

    await autofillFully(h);
    expect(h.snap().canSave).toBe(true);
  });

  it('保存要等未完成的抓取，存下来的是抓到的图', async () => {
    const h = harness();
    h.draft.setUrl('example.com');
    await h.advance(AUTOFILL_DEBOUNCE_MS);
    await h.advance(MIN_SCAN_MS);

    const saved = await h.draft.submit();
    expect(saved).toMatchObject({
      url: 'https://example.com',
      name: '站点标题',
      icon: 'data:image/png;base64,ICON',
    });
  });

  it('还不能存时 submit 返回空，不造出半份 App', async () => {
    const h = harness();
    h.draft.setUrl('example.com');

    expect(await h.draft.submit()).toBeNull();
  });

  it('选了不支持的文件给出提示，选对了则锁住图标', async () => {
    const h = harness();
    await h.draft.pickFile(new File([''], 'a.txt', { type: 'text/plain' }));
    expect(h.snap().fileError).toBe('仅支持 png / jpg / svg / webp');
    expect(h.snap().icon).toBe('');

    await h.draft.pickFile(new File([''], 'a.png', { type: 'image/png' }));
    expect(h.snap().fileError).toBe('');
    expect(h.snap().icon).toBe('data:image/png;base64,FILE');

    h.draft.setUrl('example.com');
    await autofillFully(h);
    expect(h.snap().icon).toBe('data:image/png;base64,FILE');
  });

  it('关掉对话框后，排着的抓取不再发出', async () => {
    const h = harness();
    h.draft.setUrl('example.com');
    h.draft.dispose();

    await h.advance(AUTOFILL_DEBOUNCE_MS * 2);
    expect(h.iconCalls).toEqual([]);
    expect(h.pending()).toBe(0);
  });
});
