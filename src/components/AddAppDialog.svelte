<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { AppItem } from '../lib/types';
  import { createAppFromUrl, hostnameFallback, normalizeUrl } from '../lib/defaults';
  import { resolveAppIcon } from '../lib/appIcons';

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
  let busy = $state(false);

  async function autofill() {
    const normalized = normalizeUrl(url);
    url = normalized;
    if (!name.trim()) name = hostnameFallback(normalized);
    busy = true;
    try {
      if (!icon.trim()) icon = await resolveAppIcon(normalized);
      // 标题抓取常被 CORS 挡；图标不依赖这次 fetch
      const res = await fetch(normalized, { method: 'GET' });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (m?.[1] && !initial) name = m[1].trim().slice(0, 40);
      }
    } catch {
      // keep hostname / icon fallbacks
    } finally {
      busy = false;
    }
  }

  function onUrlBlur() {
    if (url.trim()) void autofill();
  }

  function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type);
    if (!ok) {
      alert('仅支持 png / jpg / svg / webp');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      icon = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    const normalized = normalizeUrl(url);
    busy = true;
    try {
      let nextIcon = icon.trim();
      if (!nextIcon) nextIcon = await resolveAppIcon(normalized);
      const nextName = name.trim() || hostnameFallback(normalized);
      const base = initial
        ? { ...initial, url: normalized, name: nextName, icon: nextIcon }
        : createAppFromUrl(normalized, nextName, nextIcon);
      onSave(base);
    } finally {
      busy = false;
    }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" transition:fade={{ duration: 160 }}>
  <form class="card" onsubmit={submit} transition:scale={{ duration: 200, start: 0.96 }}>
    <h2>{initial ? '编辑 App' : '添加 App'}</h2>
    <label>
      网址
      <input bind:value={url} onblur={onUrlBlur} placeholder="https://" required />
    </label>
    <label>
      名称
      <input bind:value={name} placeholder="自动获取后可改" />
    </label>
    <label>
      图标 URL
      <input bind:value={icon} placeholder="自动 favicon / 图片链接" />
    </label>
    <label class="file">
      或本地上传
      <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp,image/*" onchange={onFile} />
    </label>
    {#if icon}
      <div class="preview"><img src={icon} alt="" /></div>
    {/if}
    <div class="row">
      <button type="button" class="ghost" onclick={onCancel}>取消</button>
      <button type="submit" disabled={busy}>{busy ? '获取中…' : '保存'}</button>
    </div>
  </form>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.4);
  }
  .card {
    width: min(400px, 92vw);
    background: rgba(28, 28, 32, 0.55);
    backdrop-filter: blur(24px) saturate(1.2);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #f5f5f7;
    border-radius: 12px;
    padding: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.05rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    opacity: 0.9;
  }
  input {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    border-radius: 8px;
    padding: 0.55rem 0.7rem;
    font-size: 0.92rem;
  }
  .file input {
    font-size: 0.8rem;
  }
  .preview {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    overflow: hidden;
  }
  .preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }
  button {
    appearance: none;
    border: 0;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    background: #0a84ff;
    color: #fff;
  }
  button.ghost {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  button:disabled {
    opacity: 0.6;
  }
</style>
