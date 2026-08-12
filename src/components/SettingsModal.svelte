<script lang="ts">
  import type { Settings, YtabState } from '../lib/types';
  import { downloadBlob, exportYtab, importYtab } from '../lib/backup';

  type Tab = 'general' | 'wallpaper' | 'search' | 'data' | 'about';

  let {
    settings,
    getState,
    onClose,
    onChange,
    onPrepareWallpaper,
    onCommitWallpaper,
    onImportState,
    onResetAll,
  }: {
    settings: Settings;
    getState: () => YtabState;
    onClose: () => void;
    onChange: (next: Settings) => void;
    onPrepareWallpaper: () => boolean | Promise<boolean>;
    onCommitWallpaper: () => void | Promise<void>;
    onImportState: (state: YtabState) => void;
    onResetAll: () => void;
  } = $props();

  let tab = $state<Tab>('general');
  let includeIcons = $state(true);
  let includeApiKey = $state(false);
  let exportBusy = $state(false);
  let importError = $state('');
  let wallpaperPhase = $state<'idle' | 'scan' | 'success' | 'error'>('idle');

  function patch(partial: Partial<Settings>) {
    onChange({ ...settings, ...partial });
  }

  async function handleRefreshWallpaper() {
    if (wallpaperPhase !== 'idle') return;
    wallpaperPhase = 'scan';
    const started = Date.now();
    let ok = false;
    try {
      ok = await onPrepareWallpaper();
      const left = 700 - (Date.now() - started);
      if (left > 0) await new Promise<void>((r) => setTimeout(r, left));
      if (ok) {
        // 绿勾与壁纸 crossfade 同时开始
        wallpaperPhase = 'success';
        await Promise.all([
          onCommitWallpaper(),
          new Promise<void>((r) => setTimeout(r, 650)),
        ]);
      } else {
        wallpaperPhase = 'error';
        await new Promise<void>((r) => setTimeout(r, 480));
      }
    } catch {
      wallpaperPhase = 'error';
      await new Promise<void>((r) => setTimeout(r, 480));
    } finally {
      wallpaperPhase = 'idle';
      await new Promise<void>((r) => setTimeout(r, 340));
    }
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
      const blob = await exportYtab(getState(), {
        includeIcons,
        includeApiKey,
      });
      downloadBlob(blob, `ytab-backup-${new Date().toISOString().slice(0, 10)}.ytab`);
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
      const state = await importYtab(file);
      onImportState(state);
    } catch (err) {
      importError = err instanceof Error ? err.message : '导入失败';
    }
    input.value = '';
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="设置">
  <div class="sheet">
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
          <label class="stack">
            Wallhaven API Key
            <input
              type="password"
              value={settings.wallhavenApiKey}
              placeholder="可选"
              oninput={(e) => patch({ wallhavenApiKey: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>
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
          <button
            type="button"
            class="wallpaper-btn"
            class:compact={wallpaperPhase !== 'idle'}
            disabled={wallpaperPhase !== 'idle'}
            onclick={handleRefreshWallpaper}
            aria-label="换一张壁纸"
            aria-live="polite"
          >
            <span class="wallpaper-label" class:hide={wallpaperPhase !== 'idle'}>换一张壁纸</span>

            <span class="glyph" class:show={wallpaperPhase === 'scan'} aria-hidden={wallpaperPhase !== 'scan'}>
              <svg viewBox="0 0 64 64" width="44" height="44">
                <circle class="faceid-track" cx="32" cy="32" r="22" />
                <circle class="faceid-arc" cx="32" cy="32" r="22" />
                <g class="faceid-mark" fill="none" stroke="#0a84ff" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke-width="2.4" d="M22 26V22h4" />
                  <path stroke-width="2.4" d="M42 22h4v4" />
                  <path stroke-width="2.4" d="M46 42v4h-4" />
                  <path stroke-width="2.4" d="M26 46h-4v-4" />
                  <ellipse cx="32" cy="33" rx="7.5" ry="9" stroke-width="2" />
                  <circle cx="29.2" cy="31.5" r="1.15" fill="#0a84ff" stroke="none" />
                  <circle cx="34.8" cy="31.5" r="1.15" fill="#0a84ff" stroke="none" />
                  <path stroke-width="1.8" d="M32 33.2v3.2" />
                </g>
              </svg>
            </span>

            <span class="glyph" class:show={wallpaperPhase === 'success'} aria-hidden={wallpaperPhase !== 'success'}>
              <svg viewBox="0 0 64 64" width="44" height="44">
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

            <span class="glyph fail" class:show={wallpaperPhase === 'error'} aria-hidden={wallpaperPhase !== 'error'}>
              <svg viewBox="0 0 64 64" width="44" height="44">
                <circle class="fail-ring" cx="32" cy="32" r="22" />
                <path
                  class="fail-x"
                  fill="none"
                  stroke="#ff3b30"
                  stroke-width="3.2"
                  stroke-linecap="round"
                  d="M24 24 40 40"
                />
                <path
                  class="fail-x"
                  fill="none"
                  stroke="#ff3b30"
                  stroke-width="3.2"
                  stroke-linecap="round"
                  d="M40 24 24 40"
                />
              </svg>
            </span>
          </button>
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
    background: rgba(0, 0, 0, 0.35);
  }
  .sheet {
    width: min(640px, 94vw);
    height: min(420px, 80vh);
    display: grid;
    grid-template-columns: 148px 1fr;
    background: rgba(40, 40, 42, 0.96);
    color: #f5f5f7;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5);
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
    background: #0a84ff;
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
    background: #0a84ff;
    color: #fff;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
  }
  .action:disabled {
    opacity: 0.6;
  }
  .wallpaper-btn {
    --morph: 0.32s cubic-bezier(0.2, 0.9, 0.2, 1);
    appearance: none;
    border: 0;
    align-self: flex-start;
    position: relative;
    background: #0a84ff;
    color: #fff;
    cursor: pointer;
    min-width: 132px;
    width: auto;
    height: 44px;
    padding: 0 0.9rem;
    border-radius: 8px;
    display: grid;
    place-items: center;
    overflow: hidden;
    transition:
      min-width var(--morph),
      width var(--morph),
      padding var(--morph),
      border-radius var(--morph),
      background 0.25s ease;
  }
  .wallpaper-btn:hover:not(:disabled) {
    background: #0077ed;
  }
  .wallpaper-btn:active:not(:disabled) {
    transform: scale(0.97);
  }
  .wallpaper-btn.compact {
    min-width: 44px;
    width: 44px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    cursor: default;
  }
  .wallpaper-btn:disabled {
    opacity: 1;
  }
  .wallpaper-label {
    white-space: nowrap;
    opacity: 1;
    transition: opacity 0.18s ease 0.14s;
  }
  .wallpaper-label.hide {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.14s ease;
  }
  .glyph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.14s ease;
  }
  .glyph.show {
    opacity: 1;
    transition: opacity 0.2s ease 0.12s;
  }
  .glyph.fail.show {
    animation: fail-shake 0.45s ease;
  }
  .faceid-track {
    fill: none;
    stroke: rgba(10, 132, 255, 0.18);
    stroke-width: 3;
  }
  .faceid-arc {
    fill: none;
    stroke: #0a84ff;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 42 96;
    transform-origin: 32px 32px;
  }
  .glyph.show .faceid-arc {
    animation: faceid-spin 0.9s linear infinite;
  }
  .faceid-mark {
    opacity: 0.55;
  }
  .glyph.show .faceid-mark {
    animation: faceid-pulse 0.9s ease-in-out infinite;
  }
  .success-ring {
    fill: none;
    stroke: #34c759;
    stroke-width: 3;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
  }
  .glyph.show .success-ring {
    animation: ring-draw 0.42s ease forwards;
  }
  .success-check {
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
  }
  .glyph.show .success-check {
    animation: check-draw 0.32s 0.18s ease forwards;
  }
  .fail-ring {
    fill: none;
    stroke: #ff3b30;
    stroke-width: 3;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
  }
  .glyph.show .fail-ring {
    animation: ring-draw 0.28s ease forwards;
  }
  .fail-x {
    stroke-dasharray: 28;
    stroke-dashoffset: 28;
  }
  .glyph.show .fail-x {
    animation: check-draw 0.22s 0.12s ease forwards;
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
  @keyframes fail-shake {
    0%,
    100% {
      transform: translateX(0);
    }
    12% {
      transform: translateX(-5px);
    }
    25% {
      transform: translateX(5px);
    }
    37% {
      transform: translateX(-5px);
    }
    50% {
      transform: translateX(5px);
    }
    62% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
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
