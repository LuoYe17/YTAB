<script lang="ts">
  import { tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import type { Settings } from '../lib/types';
  import type { WallpaperFailFocus } from '../lib/wallpaperFail';

  type Tab = 'general' | 'wallpaper' | 'search' | 'data' | 'about';

  let {
    settings,
    highlight = null,
    onClose,
    onChange,
    onExport,
    onImport,
    onResetAll,
  }: {
    settings: Settings;
    highlight?: WallpaperFailFocus | null;
    onClose: () => void;
    onChange: (next: Settings) => void;
    onExport: (opts: { includeIcons: boolean; includeApiKey: boolean }) => void | Promise<void>;
    onImport: (file: File) => void | Promise<void>;
    onResetAll: () => void;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  let tab = $state<Tab>(highlight ? 'wallpaper' : 'general');
  /* svelte-ignore state_referenced_locally */
  let glow = $state<WallpaperFailFocus | null>(highlight ?? null);
  let includeIcons = $state(true);
  let includeApiKey = $state(false);
  let exportBusy = $state(false);
  let importError = $state('');
  let apiKeyEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!glow) return;
    const id = window.setTimeout(() => {
      glow = null;
    }, 1500);
    if (glow === 'apiKey') {
      void tick().then(() => apiKeyEl?.focus());
    }
    return () => window.clearTimeout(id);
  });

  function patch(partial: Partial<Settings>) {
    onChange({ ...settings, ...partial });
  }

  function handleResetAll() {
    const ok = window.confirm(
      '将清除全部 App、文件夹、设置、壁纸与一言缓存，并回到首次启动引导。此操作不可撤销。确定继续？',
    );
    if (!ok) return;
    onResetAll();
  }

  async function handleExportClick() {
    exportBusy = true;
    try {
      await onExport({
        includeIcons,
        includeApiKey,
      });
    } finally {
      exportBusy = false;
    }
  }

  async function onImportFile(e: Event) {
    importError = '';
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await onImport(file);
    } catch (err) {
      importError = err instanceof Error ? err.message : '导入失败';
    }
    input.value = '';
  }
</script>

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-label="设置"
  transition:fade={{ duration: 160 }}
>
  <div class="sheet" transition:scale={{ duration: 200, start: 0.96 }}>
    <aside>
      <button type="button" class:active={tab === 'general'} onclick={() => (tab = 'general')}>通用</button>
      <button type="button" class:active={tab === 'wallpaper'} onclick={() => (tab = 'wallpaper')}>壁纸</button>
      <button type="button" class:active={tab === 'search'} onclick={() => (tab = 'search')}>搜索</button>
      <button type="button" class:active={tab === 'data'} onclick={() => (tab = 'data')}>数据</button>
      <button type="button" class:active={tab === 'about'} onclick={() => (tab = 'about')}>关于</button>
    </aside>
    <section>
      <header>
        <h2>
          {#if tab === 'general'}通用
          {:else if tab === 'wallpaper'}壁纸
          {:else if tab === 'search'}搜索
          {:else if tab === 'data'}数据
          {:else}关于
          {/if}
        </h2>
        <button type="button" class="close" onclick={onClose} aria-label="关闭">×</button>
      </header>

      <div class="body">
        {#if tab === 'general'}
          <label class="row">
            <span>点击 App 时</span>
            <select
              value={settings.openTarget}
              onchange={(e) =>
                patch({ openTarget: (e.currentTarget as HTMLSelectElement).value as Settings['openTarget'] })
              }
            >
              <option value="current">当前标签打开</option>
              <option value="new">新标签打开</option>
            </select>
          </label>
        {:else if tab === 'wallpaper'}
          <label class="stack" class:glow={glow === 'apiKey'}>
            Wallhaven API Key
            <input
              type="password"
              bind:this={apiKeyEl}
              value={settings.wallhavenApiKey}
              placeholder="可选"
              oninput={(e) => patch({ wallhavenApiKey: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
          <div class="filters" class:glow={glow === 'filters'}>
            <fieldset>
              <legend>纯度</legend>
              <label><input type="checkbox" checked={settings.wallhavenPurity.sfw} onchange={(e) => patch({ wallhavenPurity: { ...settings.wallhavenPurity, sfw: (e.currentTarget as HTMLInputElement).checked } })} /> SFW</label>
              <label><input type="checkbox" checked={settings.wallhavenPurity.sketchy} onchange={(e) => patch({ wallhavenPurity: { ...settings.wallhavenPurity, sketchy: (e.currentTarget as HTMLInputElement).checked } })} /> Sketchy</label>
              <label><input type="checkbox" checked={settings.wallhavenPurity.nsfw} onchange={(e) => patch({ wallhavenPurity: { ...settings.wallhavenPurity, nsfw: (e.currentTarget as HTMLInputElement).checked } })} /> NSFW</label>
            </fieldset>
            <fieldset>
              <legend>分类</legend>
              <label><input type="checkbox" checked={settings.wallhavenCategories.general} onchange={(e) => patch({ wallhavenCategories: { ...settings.wallhavenCategories, general: (e.currentTarget as HTMLInputElement).checked } })} /> General</label>
              <label><input type="checkbox" checked={settings.wallhavenCategories.anime} onchange={(e) => patch({ wallhavenCategories: { ...settings.wallhavenCategories, anime: (e.currentTarget as HTMLInputElement).checked } })} /> Anime</label>
              <label><input type="checkbox" checked={settings.wallhavenCategories.people} onchange={(e) => patch({ wallhavenCategories: { ...settings.wallhavenCategories, people: (e.currentTarget as HTMLInputElement).checked } })} /> People</label>
            </fieldset>
          </div>
        {:else if tab === 'search'}
          <label class="row">
            <span>Bing 入口</span>
            <select
              value={settings.bingEndpoint}
              onchange={(e) =>
                patch({ bingEndpoint: (e.currentTarget as HTMLSelectElement).value as Settings['bingEndpoint'] })
              }
            >
              <option value="cn">国内 cn.bing.com</option>
              <option value="www">国际 www.bing.com</option>
            </select>
          </label>
        {:else if tab === 'data'}
          <p class="hint">导出为 `.ytab`（ZIP）。元数据在包内；图标按原文件存。</p>
          <label class="check"><input type="checkbox" bind:checked={includeIcons} /> 包含图标</label>
          <label class="check"><input type="checkbox" bind:checked={includeApiKey} /> 包含 Wallhaven API Key</label>
          <button type="button" class="action" disabled={exportBusy} onclick={handleExportClick}>
            {exportBusy ? '导出中…' : '导出备份'}
          </button>
          <label class="stack">
            导入备份
            <input type="file" accept=".ytab,application/zip" onchange={onImportFile} />
          </label>
          {#if importError}
            <p class="err">{importError}</p>
          {/if}
          <hr class="sep" />
          <p class="hint">重置会清除全部本地数据并回到首次启动，不可撤销。</p>
          <button type="button" class="danger" onclick={handleResetAll}>重置所有数据</button>
        {:else}
          <p>YTAB 起始页 · v0.1.0</p>
          <p class="hint">Chromium MV3 · 自用优先</p>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.28);
  }
  .sheet {
    width: min(640px, 94vw);
    height: min(420px, 80vh);
    display: grid;
    grid-template-columns: 148px 1fr;
    background: rgba(28, 28, 32, 0.52);
    backdrop-filter: blur(28px) saturate(1.25);
    color: #f5f5f7;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
    font-size: 0.9rem;
  }
  aside {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.75rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  aside button {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 0.45rem 0.7rem;
    border-radius: 6px;
    cursor: pointer;
  }
  aside button.active {
    background: rgba(255, 255, 255, 0.14);
  }
  aside button {
    transition: background 0.15s ease;
  }
  section {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
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
  }
  .body {
    padding: 1rem;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  select,
  input[type='password'] {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
  }
  fieldset {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    margin: 0;
    padding: 0.65rem 0.8rem;
  }
  legend {
    padding: 0 0.25rem;
    opacity: 0.7;
  }
  .action {
    appearance: none;
    border: 0;
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.24);
  }
  .action:disabled {
    opacity: 0.6;
  }
  .filters {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    border-radius: 10px;
    padding: 0.15rem;
  }
  .glow {
    border-radius: 10px;
    box-shadow: 0 0 0 2px rgba(126, 203, 255, 0.85);
    animation: glow-fade 1.5s ease forwards;
  }
  @keyframes glow-fade {
    0% {
      box-shadow: 0 0 0 2px rgba(126, 203, 255, 0.95);
    }
    100% {
      box-shadow: 0 0 0 2px rgba(126, 203, 255, 0);
    }
  }
  .danger {
    appearance: none;
    border: 0;
    align-self: flex-start;
    background: #ff3b30;
    color: #fff;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
  }
  .danger:hover {
    background: #e0352b;
  }
  .hint {
    margin: 0;
    opacity: 0.65;
    font-size: 0.82rem;
  }
  .err {
    color: #ff6b6b;
    margin: 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .sep {
    border: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 0.35rem 0;
    width: 100%;
  }
</style>
