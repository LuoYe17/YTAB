/**
 * 添加 / 编辑 App 的草稿：输入停住后自动抓名称与图标。
 *
 * 这里管的是竞态与时序——防抖、旧请求作废、抓取超时、扫描动画最短时长、
 * 保存前等未完成的抓取。网络与文件读取都经注入口，因此可用假时钟整条验证。
 * 对话框只负责把输入喂进来、把 snapshot 画出去。
 */

import { resolveAppIcon } from './appIcons';
import { realClock, type Clock } from './clock';
import { createAppFromUrl, hostnameFallback, normalizeUrl, urlReadyToFetch } from './defaults';
import type { AppItem } from './types';

/** 输入停住多久才抓 */
export const AUTOFILL_DEBOUNCE_MS = 480;
/** 单次抓取上限，超时按抓不到处理 */
export const AUTOFILL_TIMEOUT_MS = 8000;
/** 扫描动画最短时长：抓得太快会闪一下，反而像没抓 */
export const MIN_SCAN_MS = 700;
/** 成功勾停留多久再回到常态 */
export const SUCCESS_HOLD_MS = 650;

const ICON_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export type AppDraftPhase = 'idle' | 'scan' | 'success';

export type AppDraftSnapshot = {
  url: string;
  name: string;
  /** 真正会存下来的图标：data: / http / 空 */
  icon: string;
  /** 输入框里给人看的地址；自动抓到的 data: 不摊进去 */
  iconField: string;
  phase: AppDraftPhase;
  canSave: boolean;
  saving: boolean;
  fileError: string;
};

export type AppDraftDeps = {
  /** 编辑已有 App 时传入；添加时为空 */
  initial?: AppItem | null;
  onChange: (snapshot: AppDraftSnapshot) => void;
  resolveIcon?: (siteUrl: string) => Promise<string>;
  /** 抓站点标题；跨域常被挡，抓不到返回空串。 */
  fetchTitle?: (siteUrl: string) => Promise<string>;
  readImageFile?: (file: File) => Promise<string>;
  clock?: Clock;
};

/** 输入框只放人看得懂的 http 地址。 */
function publicIconField(value: string): string {
  return /^https?:\/\//i.test(value.trim()) ? value : '';
}

async function fetchSiteTitle(siteUrl: string): Promise<string> {
  try {
    const res = await fetch(siteUrl, { method: 'GET', signal: AbortSignal.timeout(AUTOFILL_TIMEOUT_MS) });
    if (!res.ok) return '';
    const html = await res.text();
    return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
  } catch {
    // 标题常被 CORS 挡，名称已有主机名兜底
    return '';
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * 建一份草稿。`initial` 只在建的时候读一次，所以换编辑对象时对话框必须重建
 * （`App.svelte` 用 `{#key}` 保证）。
 */
export function createAppDraft(deps: AppDraftDeps) {
  const clock = deps.clock ?? realClock;
  const resolveIcon = deps.resolveIcon ?? resolveAppIcon;
  const fetchTitle = deps.fetchTitle ?? fetchSiteTitle;
  const readImageFile = deps.readImageFile ?? readFileAsDataUrl;
  const initial = deps.initial ?? null;

  let url = initial?.url ?? '';
  let name = initial?.name ?? '';
  let icon = initial?.icon ?? '';
  let iconField = publicIconField(initial?.icon ?? '');
  /** 用户给过的图（上传、手填、编辑带入）不被自动抓取盖掉 */
  let iconLocked = Boolean((initial?.icon ?? '').trim());
  let phase: AppDraftPhase = 'idle';
  let canSave = Boolean(initial);
  let saving = false;
  let fileError = '';
  /** 已经抓过的规范化网址；同一个不重复抓 */
  let lastFetched = initial ? normalizeUrl(initial.url) : '';
  let debounce: number | null = null;
  let job: Promise<void> | null = null;
  let gen = 0;

  function snapshot(): AppDraftSnapshot {
    return { url, name, icon, iconField, phase, canSave, saving, fileError };
  }

  function emit() {
    deps.onChange(snapshot());
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      clock.setTimeout(resolve, ms);
    });
  }

  function clearDebounce() {
    if (debounce !== null) clock.clearTimeout(debounce);
    debounce = null;
  }

  /** 抓图标，超时按抓不到算；不让一个卡住的站点吊死整个扫描。 */
  async function resolveIconWithCap(siteUrl: string): Promise<string> {
    let timer: number | null = null;
    try {
      return await Promise.race([
        resolveIcon(siteUrl),
        new Promise<string>((resolve) => {
          timer = clock.setTimeout(() => resolve(''), AUTOFILL_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== null) clock.clearTimeout(timer);
    }
  }

  async function autofill(): Promise<void> {
    if (!urlReadyToFetch(url)) return;
    const normalized = normalizeUrl(url);
    if (normalized === lastFetched) return;
    lastFetched = normalized;
    url = normalized;
    if (!name.trim()) name = hostnameFallback(normalized);
    phase = 'scan';
    emit();

    const jobUrl = normalized;
    const jobId = ++gen;
    const started = clock.now();
    // 换了网址或又发起了新一轮，旧结果一律丢掉。
    const stillCurrent = () => jobId === gen && normalizeUrl(url) === jobUrl;

    const iconTask = (async () => {
      if (iconLocked || publicIconField(iconField)) return;
      try {
        const resolved = await resolveIconWithCap(normalized);
        if (!stillCurrent() || iconLocked || publicIconField(iconField)) return;
        icon = resolved;
        emit();
      } catch {
        /* 回退字母占位 */
      }
    })();

    const titleTask = (async () => {
      // 抓不到标题不算事故：名称已经有主机名兜底，别把整轮抓取拖成 rejection。
      const title = await fetchTitle(normalized).catch(() => '');
      if (!title || !stillCurrent()) return;
      // 编辑已有 App 时不动用户自己起的名字。
      if (initial) return;
      name = title.slice(0, 40);
      emit();
    })();

    const running = Promise.all([iconTask, titleTask]).then(() => {});
    job = running;
    try {
      await iconTask;
      if (!stillCurrent()) {
        if (jobId === gen) phase = 'idle';
        emit();
        return;
      }
      const left = MIN_SCAN_MS - (clock.now() - started);
      if (left > 0) await sleep(left);
      if (!stillCurrent()) {
        if (jobId === gen) phase = 'idle';
        emit();
        return;
      }
      phase = 'success';
      canSave = true;
      emit();
      await sleep(SUCCESS_HOLD_MS);
      if (jobId === gen) phase = 'idle';
      emit();
    } finally {
      if (job === running) job = null;
    }
  }

  return {
    snapshot,

    /** 网址每次变都要重排防抖；改了网址就不能存，直到重新抓完。 */
    setUrl(next: string): void {
      url = next;
      clearDebounce();
      const ready = urlReadyToFetch(next);
      const normalized = ready ? normalizeUrl(next) : '';
      if (!ready || normalized !== lastFetched) canSave = false;
      if (ready && normalized !== lastFetched) {
        if (phase === 'success') phase = 'idle';
        debounce = clock.setTimeout(() => {
          debounce = null;
          void autofill();
        }, AUTOFILL_DEBOUNCE_MS);
      }
      emit();
    },

    setName(next: string): void {
      name = next;
      emit();
    },

    /** 手填图标地址：填了就锁住，之后的自动抓取不再覆盖。 */
    setIconField(next: string): void {
      iconField = next;
      const value = next.trim();
      if (/^https?:\/\//i.test(value) || value.startsWith('data:')) {
        icon = value;
        iconLocked = true;
      }
      emit();
    },

    async pickFile(file: File): Promise<void> {
      if (!ICON_TYPES.includes(file.type)) {
        fileError = '仅支持 png / jpg / svg / webp';
        emit();
        return;
      }
      fileError = '';
      emit();
      try {
        icon = await readImageFile(file);
      } catch {
        // 读不出来要说话，否则用户看着没反应还以为选上了
        fileError = '这张图读不出来，换一张吧';
        emit();
        return;
      }
      iconField = '';
      iconLocked = true;
      emit();
    },

    /**
     * 存下这一份。返回 null 表示还不能存（没抓完 / 网址为空 / 正在存）。
     * 网址改过但还没抓的，这里补抓一次并等它完成，避免存下半份。
     */
    async submit(): Promise<AppItem | null> {
      if (!canSave || !url.trim() || saving) return null;
      clearDebounce();
      if (urlReadyToFetch(url) && normalizeUrl(url) !== lastFetched) void autofill();
      if (job) await job;
      const normalized = normalizeUrl(url);
      saving = true;
      emit();
      try {
        const nextIcon = icon.trim() || (await resolveIcon(normalized));
        const nextName = name.trim() || hostnameFallback(normalized);
        return initial
          ? { ...initial, url: normalized, name: nextName, icon: nextIcon }
          : createAppFromUrl(normalized, nextName, nextIcon);
      } finally {
        saving = false;
        emit();
      }
    },

    /** 对话框关掉时掐掉未开火的防抖。 */
    dispose(): void {
      clearDebounce();
      gen += 1;
    },
  };
}