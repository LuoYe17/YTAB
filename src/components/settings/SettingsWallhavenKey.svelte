<script lang="ts">
  // Wallhaven 密钥行；测钥与显隐留在这一块。折叠壳仍在父级。
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';
  import { scale } from 'svelte/transition';
  import { plainNotice } from '../../lib/notice';
  import type { FilterAction } from '../../lib/settingsFilters';
  import type { Settings } from '../../lib/types';
  import { testWallhavenKey } from '../../lib/wallhavenKey';

  const KEY_URL = 'https://wallhaven.cc/settings/account';

  let {
    settings,
    glowApiKey,
    onCommitFilter,
    onPatch,
    helpMark,
  }: {
    settings: Settings;
    glowApiKey: boolean;
    onCommitFilter: (action: FilterAction) => void;
    onPatch: (partial: Partial<Settings>) => void;
    helpMark: Snippet<[string]>;
  } = $props();

  let apiKeyEl = $state<HTMLInputElement | null>(null);
  let revealKey = $state(false);
  let keyFlash = $state<'ok' | 'fail' | null>(null);
  let testBusy = $state(false);

  const hasKey = $derived((settings.wallhavenApiKey ?? '').trim().length > 0);
  const keyOk = $derived(hasKey && settings.wallhavenKeyOk);

  $effect(() => {
    if (!glowApiKey) return;
    void tick().then(() => apiKeyEl?.focus());
  });

  async function testKey() {
    if (testBusy || !hasKey) return;
    testBusy = true;
    keyFlash = null;
    const key = settings.wallhavenApiKey;
    const result = await testWallhavenKey(key);
    testBusy = false;
    if (settings.wallhavenApiKey !== key) return;
    if (result === 'ok') {
      onPatch({ wallhavenKeyOk: true });
      keyFlash = 'ok';
      window.setTimeout(() => {
        if (keyFlash === 'ok') keyFlash = null;
      }, 800);
      return;
    }
    onPatch({ wallhavenKeyOk: false });
    keyFlash = 'fail';
    plainNotice('fail', result === 'invalid' ? '密钥无效' : '网络出现异常 请稍后再试');
    window.setTimeout(() => {
      if (keyFlash === 'fail') keyFlash = null;
    }, 450);
  }
</script>

<div class="key-block">
  <div class="st-head" class:st-glow={glowApiKey}>
    {#if keyOk}
      <span class="key-ok" transition:scale={{ duration: 220, start: 0.45 }} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            fill="none"
            stroke="#34c759"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 12.5 9.5 17 19 7"
          />
        </svg>
      </span>
    {/if}
    <span class="st-title">密钥</span>
    {@render helpMark('选填。填了拉图更稳，想看「少儿不宜」内容必须先填。')}
    <a class="get" href={KEY_URL} target="_blank" rel="noreferrer">去获取</a>
  </div>
  <div class="key-row">
    <div class="key-field" class:flash-ok={keyFlash === 'ok'} class:flash-fail={keyFlash === 'fail'}>
      <input
        bind:this={apiKeyEl}
        type={revealKey ? 'text' : 'password'}
        value={settings.wallhavenApiKey}
        placeholder="可选"
        autocomplete="off"
        oninput={(e) => onCommitFilter({ type: 'setKey', value: (e.currentTarget as HTMLInputElement).value })}
      />
      <button
        type="button"
        class="eye"
        onclick={() => (revealKey = !revealKey)}
        aria-label={revealKey ? '隐藏密钥' : '显示密钥'}
      >
        {#if revealKey}
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              d="M3 3l18 18M9.9 4.2A9 9 0 0 1 12 4c5.2 0 9.5 3.4 11 8.5a12 12 0 0 1-1.8 2.8M6.1 6.1C4 7.6 2.4 9.6 1 12.5 2.5 17.6 6.8 21 12 21c1.7 0 3.3-.4 4.7-1"
            />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M1 12.5C2.5 7.4 6.8 4 12 4s9.5 3.4 11 8.5C21.5 17.6 17.2 21 12 21S2.5 17.6 1 12.5Z"
            />
            <circle cx="12" cy="12.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
        {/if}
      </button>
    </div>
    {#if hasKey}
      <button type="button" class="st-action" disabled={testBusy} onclick={testKey}>测试</button>
    {/if}
  </div>
</div>

<style>
  .key-block {
    display: contents;
  }
  .get {
    margin-left: auto;
    color: #7ecbff;
    text-decoration: none;
    font-size: 0.8rem;
  }
  .get:hover {
    text-decoration: underline;
  }
  .key-ok {
    display: inline-grid;
    place-items: center;
    color: #34c759;
  }
  .key-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .key-field {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .key-field input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.25);
    color: inherit;
    border-radius: 8px;
    padding: 0.45rem 2.1rem 0.45rem 0.65rem;
    font: inherit;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .key-field input:focus {
    border-color: rgba(126, 203, 255, 0.55);
  }
  .key-field.flash-ok input {
    border-color: #34c759;
    box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.35);
  }
  .key-field.flash-fail {
    animation: shake 0.4s ease;
  }
  .key-field.flash-fail input {
    border-color: #ff3b30;
  }
  .eye {
    appearance: none;
    position: absolute;
    right: 0.28rem;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.42);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .eye:hover {
    color: rgba(255, 255, 255, 0.9);
  }
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    20% {
      transform: translateX(-6px);
    }
    40% {
      transform: translateX(6px);
    }
    60% {
      transform: translateX(-4px);
    }
    80% {
      transform: translateX(4px);
    }
  }
</style>
