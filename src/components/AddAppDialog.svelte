<script lang="ts">
  import { tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { AppItem } from '../lib/types';
  import { faviconUrlFor, hostnameFallback } from '../lib/defaults';
  import { createAppDraft, type AppDraftSnapshot } from '../lib/appDraft';
  import { srcFor } from '../lib/appIcons';
  import DialogShell from './DialogShell.svelte';
  import FaceScan from './FaceScan.svelte';
  import HelpMark from './HelpMark.svelte';
  import OkTick from './OkTick.svelte';

  let {
    initial = null,
    onSave,
    onCancel,
  }: {
    initial?: AppItem | null;
    onSave: (app: AppItem) => void;
    onCancel: () => void;
  } = $props();

  let imgFailed = $state(false);
  let fileEl = $state<HTMLInputElement | null>(null);
  let urlEl = $state<HTMLInputElement | null>(null);
  let sheetEl = $state<HTMLFormElement | null>(null);

  let draft: ReturnType<typeof createAppDraft>;
  let snap = $state<AppDraftSnapshot>({
    url: '',
    name: '',
    icon: '',
    iconField: '',
    phase: 'idle',
    canSave: false,
    saving: false,
    fileError: '',
  });

  // initial 锁在草稿闭包里；换编辑对象时在这里重建，好让外壳 {#if} 能播进出场。
  $effect.pre(() => {
    const app = initial ?? null;
    const d = createAppDraft({
      initial: app,
      onChange: (next) => {
        snap = next;
      },
    });
    snap = d.snapshot();
    draft = d;
    return () => d.dispose();
  });

  function asApp(icon: string): AppItem {
    return { id: initial?.id ?? '', kind: 'app', name: snap.name, url: snap.url, icon };
  }
  /** 与网格同一条链：内存图 → 内置 → Google。裂图再退内置，避免编辑里只剩字母。 */
  const preview = $derived(srcFor(asApp(snap.icon)) || faviconUrlFor(snap.url));
  const previewFb = $derived(srcFor(asApp('')));
  const glyph = $derived((snap.name.trim() || hostnameFallback(snap.url) || 'A').slice(0, 1));

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

  function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void draft.pickFile(file);
    input.value = '';
  }

  async function submit(e: Event) {
    e.preventDefault();
    const app = await draft.submit();
    if (app) onSave(app);
  }

  function onPreviewError(e: Event) {
    const el = e.currentTarget as HTMLImageElement;
    if (previewFb && previewFb !== preview && el.dataset.fb !== '1') {
      el.dataset.fb = '1';
      el.src = previewFb;
      return;
    }
    imgFailed = true;
  }
</script>

<DialogShell labelledBy="app-dlg-title" zIndex={70} fadeMs={200} onClose={onCancel}>
  <form
    bind:this={sheetEl}
    class="sheet ios-sheet"
    onsubmit={submit}
    transition:scale|global={{ duration: 320, start: 0.78, easing: cubicOut }}
  >
    <button type="button" class="close" onclick={onCancel} aria-label="关闭">×</button>
    <h2 id="app-dlg-title">{initial ? '编辑 App' : '添加 App'}</h2>

    <div class="block inline">
      <button
        type="button"
        class="icon-btn ios-tile"
        onclick={() => fileEl?.click()}
        aria-label={snap.phase === 'scan' ? '正在获取' : snap.phase === 'success' ? '已获取' : '更换图标'}
        aria-busy={snap.phase === 'scan'}
        disabled={snap.phase !== 'idle'}
      >
        {#if preview && !imgFailed}
          <img
            src={preview}
            alt=""
            draggable="false"
            class:dim={snap.phase !== 'idle'}
            onerror={onPreviewError}
          />
        {:else}
          <span class="ph" class:dim={snap.phase !== 'idle'}>{glyph}</span>
        {/if}
        {#if snap.phase === 'scan'}
          <span class="faceid" aria-hidden="true">
            <FaceScan color="#fff" track="rgba(255, 255, 255, 0.22)" />
          </span>
        {:else if snap.phase === 'success'}
          <span class="ok" aria-hidden="true" out:fade={{ duration: 380 }}>
            <OkTick />
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
      <div class="field">
        <input
          value={snap.iconField}
          oninput={(e) => draft.setIconField(e.currentTarget.value)}
          placeholder="自动获取，也可填链接"
        />
        <span class="field-help">
          <HelpMark text="点左边从本机选图，或把图片链接贴进来。自动抓到的留空就行。" />
        </span>
      </div>
    </div>

    <div class="block inline">
      <div class="head">
        <span class="title">网址</span>
      </div>
      <div class="field">
        <input
          bind:this={urlEl}
          value={snap.url}
          oninput={(e) => draft.setUrl(e.currentTarget.value)}
          placeholder="https://"
          required
        />
        <span class="field-help">
          <HelpMark text="输入停住就会抓名称和图标，不必点出这个框。" />
        </span>
      </div>
    </div>

    <div class="block inline">
      <div class="head">
        <span class="title">名称</span>
      </div>
      <div class="field">
        <input
          value={snap.name}
          oninput={(e) => draft.setName(e.currentTarget.value)}
          placeholder="留空则用网站名"
        />
        <span class="field-help">
          <HelpMark text="网格里图标底下那行字。留空用网站名，自动填的也能改。" />
        </span>
      </div>
    </div>

    {#if snap.fileError}
      <p class="err">{snap.fileError}</p>
    {/if}

    <div class="row" class:ready={snap.canSave}>
      <button type="button" class="ghost" onclick={onCancel}>取消</button>
      <div class="save-slot">
        <button
          type="submit"
          class="action"
          disabled={!snap.canSave || snap.saving}
          tabindex={snap.canSave ? 0 : -1}
          aria-hidden={!snap.canSave}
        >
          {snap.saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  </form>
</DialogShell>

<style>
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
    padding: 0.85rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    font-size: 0.9rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    text-align: center;
    padding: 0.15rem 2.2rem 0.1rem;
  }
  .close {
    appearance: none;
    position: absolute;
    top: 0.7rem;
    right: 0.85rem;
    z-index: 2;
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
  .block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.7rem 0.8rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
  }
  .block.inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .block.inline .head {
    flex-shrink: 0;
  }
  .field {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .field input:not(.sr) {
    width: 100%;
    padding-right: 1.9rem;
  }
  .field-help {
    position: absolute;
    right: 0.48rem;
    top: 50%;
    transform: translateY(-50%);
    line-height: 0;
    z-index: 1;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.22rem 0.5rem;
  }
  .title {
    font-weight: 600;
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
    grid-template-columns: 1fr minmax(0, 0fr);
    column-gap: 0;
    margin-top: 0.15rem;
    transition:
      grid-template-columns 0.36s cubic-bezier(0.22, 1, 0.36, 1),
      column-gap 0.36s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .row.ready {
    grid-template-columns: 1fr minmax(0, 1fr);
    column-gap: 0.5rem;
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
