<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { AppItem } from '../lib/types';
  import { createAppFromUrl, hostnameFallback, normalizeUrl } from '../lib/defaults';
  import { resolveAppIcon, srcFor } from '../lib/appIcons';

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
  let fetching = $state(false);
  let saving = $state(false);
  let fileError = $state('');
  let imgFailed = $state(false);
  let fileEl = $state<HTMLInputElement | null>(null);
  let autofillJob: Promise<void> | null = null;

  const preview = $derived(
    srcFor({ id: initial?.id ?? '', kind: 'app', name, url, icon }),
  );
  const glyph = $derived((name.trim() || hostnameFallback(url) || 'A').slice(0, 1));

  $effect(() => {
    void preview;
    imgFailed = false;
  });

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  async function autofill() {
    const normalized = normalizeUrl(url);
    url = normalized;
    if (!name.trim()) name = hostnameFallback(normalized);
    fetching = true;
    const job = (async () => {
      const signal = AbortSignal.timeout(8000);
      try {
        if (!icon.trim()) {
          const resolved = await Promise.race([
            resolveAppIcon(normalized),
            new Promise<string>((r) => {
              signal.addEventListener('abort', () => r(''), { once: true });
            }),
          ]);
          if (!icon.trim()) icon = resolved;
        }
        // 标题抓取常被 CORS 挡；图标不依赖这次 fetch
        const res = await fetch(normalized, { method: 'GET', signal });
        if (res.ok) {
          const html = await res.text();
          const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
          if (m?.[1] && !initial) name = m[1].trim().slice(0, 40);
        }
      } catch {
        // keep hostname / icon fallbacks
      }
    })();
    autofillJob = job;
    try {
      await job;
    } finally {
      fetching = false;
      if (autofillJob === job) autofillJob = null;
    }
  }

  function onUrlBlur() {
    if (url.trim()) void autofill();
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
    if (!url.trim() || saving) return;
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

<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="app-dlg-title" transition:fade={{ duration: 160 }}>
  <button type="button" class="backdrop" aria-label="关闭" onclick={onCancel}></button>
  <form class="sheet ios-sheet" onsubmit={submit} transition:scale={{ duration: 200, start: 0.96, easing: cubicOut }}>
    <header>
      <button type="button" class="icon-btn ios-tile" onclick={() => fileEl?.click()} aria-label="更换图标">
        {#if preview && !imgFailed}
          <img
            src={preview}
            alt=""
            onerror={() => {
              imgFailed = true;
            }}
          />
        {:else}
          <span class="ph">{glyph}</span>
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
      <h2 id="app-dlg-title">{initial ? '编辑 App' : '添加 App'}</h2>
      <button type="button" class="close" onclick={onCancel} aria-label="关闭">×</button>
    </header>

    <div class="block">
      <div class="head">
        <span class="title">名称</span>
        <span class="hint">显示在图标下方，可随便改</span>
      </div>
      <input bind:value={name} placeholder="自动获取后可改" />
    </div>

    <div class="block">
      <div class="head">
        <span class="title">网址</span>
        <span class="hint">失焦后会尝试抓名称和图标</span>
      </div>
      <input bind:value={url} onblur={onUrlBlur} placeholder="https://" required />
    </div>

    <div class="block">
      <div class="head">
        <span class="title">图标链接</span>
        <span class="hint">可填图片地址，或点左上角图标从本地选</span>
      </div>
      <input bind:value={icon} placeholder="自动获取 / 图片链接" />
    </div>

    {#if fileError}
      <p class="err">{fileError}</p>
    {/if}

    <div class="row">
      <button type="button" class="ghost" onclick={onCancel}>取消</button>
      <button type="submit" class="action" disabled={saving}>{fetching || saving ? '获取中…' : '保存'}</button>
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
    padding: 0.85rem 0 0.15rem;
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
  .icon-btn {
    appearance: none;
    position: relative;
    flex-shrink: 0;
    width: 52px;
    height: 52px;
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
  .icon-btn img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
  }
  .ph {
    font-size: 1.25rem;
    font-weight: 650;
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
  .hint {
    color: rgba(255, 255, 255, 0.48);
    font-size: 0.75rem;
    line-height: 1.2;
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
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.15rem;
  }
  .action,
  .ghost {
    appearance: none;
    border: 0;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    font: inherit;
    transition: background 0.15s ease;
  }
  .action {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }
  .action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.24);
  }
  .action:disabled {
    opacity: 0.6;
  }
  .ghost {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.16);
  }
  .ghost:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
