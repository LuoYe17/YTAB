<script lang="ts">
  import { tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { AppItem } from '../lib/types';
  import { createAppFromUrl, hostnameFallback, normalizeUrl, urlReadyToFetch } from '../lib/defaults';
  import { resolveAppIcon, srcFor } from '../lib/appIcons';
  import GhostTip from './GhostTip.svelte';

  let {
    initial = null,
    onSave,
    onCancel,
  }: {
    initial?: AppItem | null;
    onSave: (app: AppItem) => void;
    onCancel: () => void;
  } = $props();

  /* one-shot seed from props when dialog opens */
  /* svelte-ignore state_referenced_locally */
  let url = $state(initial?.url ?? '');
  /* svelte-ignore state_referenced_locally */
  let name = $state(initial?.name ?? '');
  /* svelte-ignore state_referenced_locally */
  let icon = $state(initial?.icon ?? '');
  /* svelte-ignore state_referenced_locally */
  let iconField = $state(publicIconField(initial?.icon ?? ''));
  let phase = $state<'idle' | 'scan' | 'success'>('idle');
  /* svelte-ignore state_referenced_locally */
  let canSave = $state(!!initial);
  let saving = $state(false);
  let fileError = $state('');
  let imgFailed = $state(false);
  let fileEl = $state<HTMLInputElement | null>(null);
  let urlEl = $state<HTMLInputElement | null>(null);
  let sheetEl = $state<HTMLFormElement | null>(null);
  let autofillJob: Promise<void> | null = null;
  let autofillGen = 0;
  /* svelte-ignore state_referenced_locally */
  let lastFetched = initial ? normalizeUrl(initial.url) : '';

  const preview = $derived(
    srcFor({ id: initial?.id ?? '', kind: 'app', name, url, icon }),
  );
  const glyph = $derived((name.trim() || hostnameFallback(url) || 'A').slice(0, 1));

  $effect(() => {
    void preview;
    imgFailed = false;
  });

  function sheetTabbables(): HTMLElement[] {
    if (!sheetEl) return [];
    return [...sheetEl.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not(.sr)')];
  }

  $effect(() => {
    // aria-modal 不会锁 Tab；打开落到网址框，关掉把焦点还回去。
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = sheetTabbables();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !sheetEl?.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !sheetEl?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    void tick().then(() => {
      urlEl?.focus();
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener && document.contains(opener)) opener.focus();
    };
  });

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  /** 输入框只给人看/填的 http 地址；自动抓到的 data: 不摊进去。 */
  function publicIconField(value: string): string {
    return /^https?:\/\//i.test(value.trim()) ? value : '';
  }

  function applyIconField() {
    const v = iconField.trim();
    if (/^https?:\/\//i.test(v) || v.startsWith('data:')) icon = v;
  }

  $effect(() => {
    const raw = url;
    const ready = urlReadyToFetch(raw);
    const next = ready ? normalizeUrl(raw) : '';
    if (!ready || next !== lastFetched) canSave = false;
    if (!ready) return;
    if (next === lastFetched) return;
    if (phase === 'success') phase = 'idle';
    const timer = window.setTimeout(() => {
      void autofill();
    }, 480);
    return () => window.clearTimeout(timer);
  });

  async function autofill() {
    if (!urlReadyToFetch(url)) return;
    const normalized = normalizeUrl(url);
    if (normalized === lastFetched) return;
    lastFetched = normalized;
    url = normalized;
    if (!name.trim()) name = hostnameFallback(normalized);
    phase = 'scan';
    const jobUrl = normalized;
    const jobId = ++autofillGen;
    const started = Date.now();
    const stillCurrent = () => jobId === autofillGen && normalizeUrl(url) === jobUrl;
    const signal = AbortSignal.timeout(8000);
    const iconTask = (async () => {
      if (publicIconField(iconField)) return;
      try {
        const resolved = await Promise.race([
          resolveAppIcon(normalized),
          new Promise<string>((r) => {
            signal.addEventListener('abort', () => r(''), { once: true });
          }),
        ]);
        if (!stillCurrent() || publicIconField(iconField)) return;
        icon = resolved;
      } catch {
        /* 回退字母占位 */
      }
    })();
    const titleTask = (async () => {
      try {
        const res = await fetch(normalized, { method: 'GET', signal });
        if (!stillCurrent() || !res.ok) return;
        const html = await res.text();
        if (!stillCurrent()) return;
        const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (m?.[1] && !initial) name = m[1].trim().slice(0, 40);
      } catch {
        /* 标题常被 CORS 挡，名称已有主机名 */
      }
    })();
    const job = Promise.all([iconTask, titleTask]).then(() => {});
    autofillJob = job;
    try {
      await iconTask;
      if (!stillCurrent()) {
        if (jobId === autofillGen) phase = 'idle';
        return;
      }
      const left = 700 - (Date.now() - started);
      if (left > 0) await sleep(left);
      if (!stillCurrent()) {
        if (jobId === autofillGen) phase = 'idle';
        return;
      }
      phase = 'success';
      canSave = true;
      await sleep(650);
      if (jobId === autofillGen) phase = 'idle';
    } finally {
      if (autofillJob === job) autofillJob = null;
    }
  }

  function onPickedFile(file: File) {
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type);
    if (!ok) {
      fileError = '仅支持 png / jpg / svg / webp';
      return;
    }
    fileError = '';
    const reader = new FileReader();
    reader.onload = () => {
      icon = String(reader.result);
      iconField = '';
    };
    reader.readAsDataURL(file);
  }

  function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onPickedFile(file);
    input.value = '';
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!canSave || !url.trim() || saving) return;
    if (urlReadyToFetch(url) && normalizeUrl(url) !== lastFetched) void autofill();
    if (autofillJob) await autofillJob;
    const normalized = normalizeUrl(url);
    saving = true;
    try {
      let nextIcon = icon.trim();
      if (!nextIcon) nextIcon = await resolveAppIcon(normalized);
      const nextName = name.trim() || hostnameFallback(normalized);
      const base = initial
        ? { ...initial, url: normalized, name: nextName, icon: nextIcon }
        : createAppFromUrl(normalized, nextName, nextIcon);
      onSave(base);
    } finally {
      saving = false;
    }
  }
</script>

{#snippet helpMark(text: string)}
  <GhostTip label={text} placement="se" wrap>
    <button type="button" class="help" aria-label={text}>?</button>
  </GhostTip>
{/snippet}

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="app-dlg-title"
  in:fade={{ duration: 180 }}
  out:fade={{ duration: 160 }}
>
  <button type="button" class="backdrop" aria-label="关闭" onclick={onCancel}></button>
  <form
    bind:this={sheetEl}
    class="sheet ios-sheet"
    onsubmit={submit}
    in:scale={{ duration: 240, start: 0.9, easing: cubicOut }}
    out:scale={{ duration: 200, start: 0.9, easing: cubicOut }}
  >
    <header>
      <h2 id="app-dlg-title">{initial ? '编辑 App' : '添加 App'}</h2>
      <button type="button" class="close" onclick={onCancel} aria-label="关闭">×</button>
    </header>

    <div class="block">
      <div class="head">
        <span class="title">网址</span>
        {@render helpMark('填网站地址。输入完就会自动抓名称和图标。')}
      </div>
      <input bind:this={urlEl} bind:value={url} placeholder="https://" required />
    </div>

    <div class="block">
      <div class="head">
        <span class="title">名称</span>
        {@render helpMark('显示在图标下面。自动抓到后也能改。')}
      </div>
      <input bind:value={name} placeholder="留空则用网站名" />
    </div>

    <div class="block">
      <div class="head">
        <span class="title">图标</span>
        {@render helpMark('可填图片地址，或点左侧从本地选图。')}
      </div>
      <div class="icon-row">
        <button
          type="button"
          class="icon-btn ios-tile"
          onclick={() => fileEl?.click()}
          aria-label={phase === 'scan' ? '正在获取' : phase === 'success' ? '已获取' : '更换图标'}
          aria-busy={phase === 'scan'}
          disabled={phase !== 'idle'}
        >
          {#if preview && !imgFailed}
            <img
              src={preview}
              alt=""
              class:dim={phase !== 'idle'}
              onerror={() => {
                imgFailed = true;
              }}
            />
          {:else}
            <span class="ph" class:dim={phase !== 'idle'}>{glyph}</span>
          {/if}
          {#if phase === 'scan'}
            <span class="faceid" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="40" height="40">
                <circle class="faceid-track" cx="32" cy="32" r="22" />
                <circle class="faceid-arc" cx="32" cy="32" r="22" />
                <g class="faceid-mark" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke-width="2.4" d="M22 26V22h4" />
                  <path stroke-width="2.4" d="M42 22h4v4" />
                  <path stroke-width="2.4" d="M46 42v4h-4" />
                  <path stroke-width="2.4" d="M26 46h-4v-4" />
                  <ellipse cx="32" cy="33" rx="7.5" ry="9" stroke-width="2" />
                  <circle cx="29.2" cy="31.5" r="1.15" fill="#fff" stroke="none" />
                  <circle cx="34.8" cy="31.5" r="1.15" fill="#fff" stroke="none" />
                  <path stroke-width="1.8" d="M32 33.2v3.2" />
                </g>
              </svg>
            </span>
          {:else if phase === 'success'}
            <span class="ok" aria-hidden="true" out:fade={{ duration: 380 }}>
              <svg viewBox="0 0 64 64" width="40" height="40">
                <circle class="success-ring" cx="32" cy="32" r="22" />
                <path
                  class="success-check"
                  fill="none"
                  stroke="#34c759"
                  stroke-width="3.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M20 33.5 28.5 42 44 24"
                />
              </svg>
            </span>
          {/if}
        </button>
        <input
          bind:this={fileEl}
          class="sr"
          type="file"
          accept=".png,.jpg,.jpeg,.svg,.webp,image/*"
          onchange={onFileChange}
          tabindex="-1"
        />
        <input
          bind:value={iconField}
          oninput={applyIconField}
          placeholder="自动获取，也可填链接"
        />
      </div>
    </div>

    {#if fileError}
      <p class="err">{fileError}</p>
    {/if}

    <div class="row" class:ready={canSave}>
      <button type="button" class="ghost" onclick={onCancel}>取消</button>
      <div class="save-slot">
        <button
          type="submit"
          class="action"
          disabled={!canSave || saving}
          tabindex={canSave ? 0 : -1}
          aria-hidden={!canSave}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  </form>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
  }
  .backdrop {
    appearance: none;
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.28);
    cursor: default;
  }
  .sheet {
    position: relative;
    z-index: 1;
    transform-origin: center center;
    width: min(420px, 92vw);
    background: rgba(28, 28, 32, 0.52);
    backdrop-filter: blur(28px) saturate(1.25);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
    color: #f5f5f7;
    padding: 0 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    font-size: 0.9rem;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.95rem 0 0.1rem;
  }
  h2 {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .close {
    appearance: none;
    flex-shrink: 0;
    margin: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.35rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }
  .close:hover {
    opacity: 1;
  }
  .icon-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .icon-row input:not(.sr) {
    flex: 1;
    min-width: 0;
  }
  .icon-btn {
    appearance: none;
    position: relative;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    margin: 0;
    padding: 0;
    border: 0;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    display: grid;
    place-items: center;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  }
  .icon-btn:disabled {
    cursor: default;
  }
  .icon-btn img,
  .ph {
    opacity: 1;
    transition: opacity 0.38s ease;
  }
  .icon-btn img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }
  .icon-btn img.dim,
  .ph.dim {
    opacity: 0.22;
  }
  .ph {
    font-size: 1.1rem;
    font-weight: 650;
  }
  .faceid,
  .ok {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.48);
    pointer-events: none;
  }
  .faceid-track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.22);
    stroke-width: 3;
  }
  .faceid-arc {
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 42 96;
    transform-origin: 32px 32px;
    animation: faceid-spin 0.9s linear infinite;
  }
  .faceid-mark {
    animation: faceid-pulse 0.9s ease-in-out infinite;
  }
  .success-ring {
    fill: none;
    stroke: #34c759;
    stroke-width: 3;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
    animation: ring-draw 0.42s ease forwards;
  }
  .success-check {
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
    animation: check-draw 0.32s 0.18s ease forwards;
  }
  @keyframes faceid-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes faceid-pulse {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }
  @keyframes ring-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes check-draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.7rem 0.8rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.22rem 0.5rem;
  }
  .title {
    font-weight: 600;
  }
  .help {
    appearance: none;
    width: 1rem;
    height: 1rem;
    margin: 0;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 50%;
    background: transparent;
    color: rgba(255, 255, 255, 0.48);
    font: inherit;
    font-size: 0.68rem;
    line-height: 1;
    cursor: help;
  }
  .help:hover {
    color: rgba(255, 255, 255, 0.88);
    border-color: rgba(255, 255, 255, 0.5);
  }
  input:not(.sr) {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    border-radius: 8px;
    padding: 0.5rem 0.7rem;
    font: inherit;
    font-size: 0.92rem;
    outline: none;
    transition: border-color 0.15s ease;
  }
  input:not(.sr):focus {
    border-color: rgba(126, 203, 255, 0.55);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .err {
    margin: 0;
    color: #ff8a80;
    font-size: 0.8rem;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 0fr;
    gap: 0;
    margin-top: 0.15rem;
    transition:
      grid-template-columns 0.32s cubic-bezier(0.22, 1, 0.36, 1),
      gap 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .row.ready {
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .save-slot {
    min-width: 0;
    overflow: hidden;
    display: grid;
  }
  .action,
  .ghost {
    appearance: none;
    width: 100%;
    border: 0;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    font: inherit;
    white-space: nowrap;
  }
  .action {
    background: #fff;
    color: #111;
    opacity: 0;
    transform: scale(0.88);
    pointer-events: none;
    transition:
      opacity 0.22s ease,
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      background 0.15s ease;
  }
  .row.ready .action {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }
  .action:hover:not(:disabled) {
    background: #f2f2f7;
  }
  .ghost {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.28);
    transition: background 0.15s ease;
  }
  .ghost:hover {
    background: rgba(255, 255, 255, 0.28);
  }
</style>
