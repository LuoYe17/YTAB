<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Settings } from '../lib/types';
  import type { WallpaperFailFocus } from '../lib/wallpaperFail';
  import CapsuleSwitch from './CapsuleSwitch.svelte';
  import FilePickButton from './FilePickButton.svelte';
  import GhostTip from './GhostTip.svelte';
  import MenuSelect from './MenuSelect.svelte';

  type Tab = 'general' | 'wallpaper' | 'data';

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: '通用' },
    { id: 'wallpaper', label: '壁纸' },
    { id: 'data', label: '数据' },
  ];

  const REPO_URL = 'https://github.com/LuoYe17/YTAB';
  const VERSION = 'v0.1.0';
  /** 官网未上线；上线后改为 true。 */
  const SITE_LIVE = false;
  const SITE_URL = 'https://ytab.luoye.pro';

  let {
    settings,
    highlight = null,
    origin = { x: 40, y: 40 },
    onClose,
    onChange,
    onExport,
    onImport,
    onResetAll,
  }: {
    settings: Settings;
    highlight?: WallpaperFailFocus | null;
    origin?: { x: number; y: number };
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
  let confirmReset = $state(false);
  let apiKeyEl = $state<HTMLInputElement | null>(null);
  let navEl = $state<HTMLElement | null>(null);
  let pill = $state({ top: 0, height: 0 });
  let pillSlide = $state(false);

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

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmReset) confirmReset = false;
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    void tab;
    const slide = pillSlide;
    void tick().then(() => {
      const btn = navEl?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      if (!btn) return;
      // offset* 是 layout 坐标。getBoundingClientRect 会吃到 sheet 的 scale，指示条会飞到顶上。
      pill = { top: btn.offsetTop, height: btn.offsetHeight };
      if (!slide) {
        requestAnimationFrame(() => {
          pillSlide = true;
        });
      }
    });
  });

  function patch(partial: Partial<Settings>) {
    onChange({ ...settings, ...partial });
  }

  async function handleExportClick() {
    exportBusy = true;
    try {
      await onExport({ includeIcons, includeApiKey });
    } finally {
      exportBusy = false;
    }
  }

  async function onImportPicked(file: File) {
    importError = '';
    try {
      await onImport(file);
    } catch (err: unknown) {
      importError = err instanceof Error ? err.message : '导入失败';
    }
  }

  function popFrom(node: HTMLElement, params: { x: number; y: number }) {
    const run = (x: number, y: number) => {
      const r = node.getBoundingClientRect();
      node.style.transformOrigin = `${x - r.left}px ${y - r.top}px`;
    };
    run(params.x, params.y);
    return {
      duration: 280,
      easing: cubicOut,
      css: (t: number) => `transform: scale(${0.14 + 0.86 * t}); opacity: ${t}`,
    };
  }
</script>

{#snippet globe()}
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8" />
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      d="M3 12h18M12 3c2.5 3 4 6.5 4 9s-1.5 6-4 9c-2.5-3-4-6.5-4-9s1.5-6 4-9Z"
    />
  </svg>
{/snippet}

<div
  class="overlay"
  role="dialog"
  aria-modal="true"
  aria-label="设置"
  transition:fade={{ duration: 180 }}
>
  <button type="button" class="backdrop" aria-label="关闭设置" onclick={onClose}></button>
  <div class="sheet" in:popFrom={{ x: origin.x, y: origin.y }} out:popFrom={{ x: origin.x, y: origin.y }}>
    <aside>
      <nav bind:this={navEl}>
        <div
          class="pill"
          class:on={pill.height > 0}
          class:slide={pillSlide}
          style:top="{pill.top}px"
          style:height="{pill.height}px"
        ></div>
        {#each TABS as item}
          <button
            type="button"
            data-tab={item.id}
            class:active={tab === item.id}
            onclick={() => (tab = item.id)}
          >
            {item.label}
          </button>
        {/each}
      </nav>
      <div class="foot">
        <div class="foot-start">
          <GhostTip label="GitHub" placement="ne">
            <a class="icon" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                />
              </svg>
            </a>
          </GhostTip>
        </div>
        <span class="ver">{VERSION}</span>
        <div class="foot-end">
          <GhostTip label="官方网站" placement="nw">
            {#if SITE_LIVE}
              <a class="icon" href={SITE_URL} target="_blank" rel="noreferrer" aria-label="官方网站">
                {@render globe()}
              </a>
            {:else}
              <span class="icon off" aria-label="官方网站" aria-disabled="true">
                {@render globe()}
              </span>
            {/if}
          </GhostTip>
        </div>
      </div>
    </aside>
    <section>
      <header>
        <h2>{TABS.find((t) => t.id === tab)?.label}</h2>
        <button type="button" class="close" onclick={onClose} aria-label="关闭">×</button>
      </header>

      <div class="pane">
        {#key tab}
          <div class="body" in:fade={{ duration: 160 }} out:fade={{ duration: 120 }}>
          {#if tab === 'general'}
            <div class="row">
              <span id="lbl-open">点击 App 时</span>
              <MenuSelect
                labelledBy="lbl-open"
                value={settings.openTarget}
                options={[
                  { value: 'current', label: '当前标签打开' },
                  { value: 'new', label: '新标签打开' },
                ]}
                onChange={(v) => patch({ openTarget: v as Settings['openTarget'] })}
              />
            </div>
            <div class="row">
              <span id="lbl-bing">Bing 入口</span>
              <MenuSelect
                labelledBy="lbl-bing"
                value={settings.bingEndpoint}
                options={[
                  { value: 'cn', label: '国内 cn.bing.com' },
                  { value: 'www', label: '国际 www.bing.com' },
                ]}
                onChange={(v) => patch({ bingEndpoint: v as Settings['bingEndpoint'] })}
              />
            </div>
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
                <CapsuleSwitch
                  label="SFW"
                  on={settings.wallhavenPurity.sfw}
                  onChange={(on) => patch({ wallhavenPurity: { ...settings.wallhavenPurity, sfw: on } })}
                />
                <CapsuleSwitch
                  label="Sketchy"
                  on={settings.wallhavenPurity.sketchy}
                  onChange={(on) => patch({ wallhavenPurity: { ...settings.wallhavenPurity, sketchy: on } })}
                />
                <CapsuleSwitch
                  label="NSFW"
                  on={settings.wallhavenPurity.nsfw}
                  onChange={(on) => patch({ wallhavenPurity: { ...settings.wallhavenPurity, nsfw: on } })}
                />
              </fieldset>
              <fieldset>
                <legend>分类</legend>
                <CapsuleSwitch
                  label="General"
                  on={settings.wallhavenCategories.general}
                  onChange={(on) =>
                    patch({ wallhavenCategories: { ...settings.wallhavenCategories, general: on } })}
                />
                <CapsuleSwitch
                  label="Anime"
                  on={settings.wallhavenCategories.anime}
                  onChange={(on) =>
                    patch({ wallhavenCategories: { ...settings.wallhavenCategories, anime: on } })}
                />
                <CapsuleSwitch
                  label="People"
                  on={settings.wallhavenCategories.people}
                  onChange={(on) =>
                    patch({ wallhavenCategories: { ...settings.wallhavenCategories, people: on } })}
                />
              </fieldset>
            </div>
          {:else if tab === 'data'}
            <p class="hint">导出为 `.ytab`（ZIP）。元数据在包内；图标按原文件存。</p>
            <div class="caps">
              <CapsuleSwitch label="包含图标" on={includeIcons} onChange={(on) => (includeIcons = on)} />
              <CapsuleSwitch
                label="包含 Wallhaven API Key"
                on={includeApiKey}
                onChange={(on) => (includeApiKey = on)}
              />
            </div>
            <button type="button" class="action" disabled={exportBusy} onclick={handleExportClick}>
              {exportBusy ? '导出中…' : '导出备份'}
            </button>
            <div class="stack">
              <span>导入备份</span>
              <FilePickButton label="选择备份" accept=".ytab,application/zip" onFile={onImportPicked} />
            </div>
            {#if importError}
              <p class="err">{importError}</p>
            {/if}
            <hr class="sep" />
            <p class="hint">重置会清除全部本地数据并回到首次启动，不可撤销。</p>
            <button type="button" class="danger" onclick={() => (confirmReset = true)}>重置所有数据</button>
          {/if}
          </div>
        {/key}
      </div>
    </section>

    {#if confirmReset}
      <div class="confirm" transition:fade={{ duration: 140 }}>
        <div class="confirm-card">
          <p>将清除全部 App、文件夹、设置、壁纸与一言缓存，并回到首次启动。此操作不可撤销。</p>
          <div class="confirm-row">
            <button type="button" class="ghost" onclick={() => (confirmReset = false)}>取消</button>
            <button
              type="button"
              class="danger"
              onclick={() => {
                confirmReset = false;
                onResetAll();
              }}>确定重置</button
            >
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 45;
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
    position: relative;
    background: rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  nav {
    position: relative;
    flex: 1;
    min-height: 0;
    padding: 0.75rem 0.5rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .pill {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    pointer-events: none;
    opacity: 0;
  }
  .pill.on {
    opacity: 1;
  }
  .pill.slide {
    transition:
      top 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      height 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
  nav button {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    padding: 0.45rem 0.7rem;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    z-index: 1;
    transition: color 0.15s ease;
  }
  nav button.active {
    color: #fff;
  }
  .foot {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    margin-top: auto;
    padding: 0.4rem 0.45rem 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  .foot-start {
    justify-self: start;
  }
  .foot-end {
    justify-self: end;
  }
  .ver {
    justify-self: center;
    font-size: 0.72rem;
    letter-spacing: 0.02em;
    opacity: 0.45;
    user-select: none;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.48);
    text-decoration: none;
    transition: color 0.15s ease, background 0.15s ease;
  }
  a.icon:hover {
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.08);
  }
  .icon.off {
    opacity: 0.38;
  }
  section {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
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
    transition: opacity 0.15s ease;
  }
  .close:hover {
    opacity: 1;
  }
  .pane {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .body {
    position: absolute;
    inset: 0;
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
  .caps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  input[type='password'] {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    font: inherit;
    outline: none;
    transition: border-color 0.15s ease;
  }
  input[type='password']:focus {
    border-color: rgba(126, 203, 255, 0.55);
  }
  fieldset {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0;
    padding: 0.65rem 0.8rem;
  }
  legend {
    padding: 0 0.25rem;
    opacity: 0.7;
  }
  .action,
  .danger,
  .ghost {
    appearance: none;
    border: 0;
    align-self: flex-start;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    cursor: pointer;
    font: inherit;
    transition:
      background 0.15s ease,
      transform 0.15s ease;
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
    background: #ff3b30;
    color: #fff;
  }
  .danger:hover {
    background: #e0352b;
  }
  .ghost {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.16);
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
  .sep {
    border: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 0.35rem 0;
    width: 100%;
  }
  .confirm {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.4);
    padding: 1rem;
  }
  .confirm-card {
    width: min(360px, 100%);
    background: rgba(32, 32, 36, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .confirm-card p {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .confirm-row {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
