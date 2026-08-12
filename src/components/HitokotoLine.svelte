<script lang="ts">
  import { hitokotoFailNotice, type HitokotoFetchResult } from '../lib/hitokoto';
  import { plainNotice } from '../lib/notice';

  let {
    text,
    from,
    onRefresh,
  }: {
    text: string;
    from: string;
    onRefresh: () => Promise<HitokotoFetchResult>;
  } = $props();

  /* svelte-ignore state_referenced_locally */
  let shownText = $state(text);
  /* svelte-ignore state_referenced_locally */
  let shownFrom = $state(from);
  /** 含缩/展与失败提示时段，避免连点当成取消。 */
  let busy = $state(false);
  let fail = $state(false);
  let sx = $state(1);
  let ringOn = $state(false);

  $effect(() => {
    if (busy) return;
    shownText = text;
    shownFrom = from;
  });

  async function onClick() {
    if (busy || !shownText) return;
    busy = true;
    fail = false;
    sx = 0;
    ringOn = true;
    await sleep(280);
    const next = await onRefresh();
    if (next.ok) {
      shownText = next.value.text;
      shownFrom = next.value.from;
    }
    sx = 1;
    ringOn = false;
    await sleep(280);
    if (!next.ok) {
      fail = true;
      plainNotice('fail', hitokotoFailNotice(next.reason));
      await sleep(2000);
      fail = false;
    }
    busy = false;
  }

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }
</script>

{#if shownText}
  <div class="block">
    <div class="stage">
      <div class="squeeze" style:transform="scaleX({sx})">
        <button
          type="button"
          class="hitokoto"
          class:fail
          aria-busy={busy}
          onclick={onClick}
        >
          <span class="text">「{shownText}」</span>
          {#if shownFrom}
            <span class="from">— {shownFrom}</span>
          {/if}
        </button>
      </div>
      <span class="ring" class:on={ringOn} aria-hidden="true">
        <svg viewBox="0 0 32 32" width="22" height="22">
          <circle class="track" cx="16" cy="16" r="12" />
          <circle class="arc" cx="16" cy="16" r="12" />
        </svg>
      </span>
    </div>
  </div>
{/if}

<style>
  .block {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(560px, 90vw);
    max-width: 100%;
  }
  .stage {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
  }
  .squeeze {
    min-width: 0;
    max-width: 100%;
    transform-origin: center;
    transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .hitokoto {
    appearance: none;
    display: block;
    max-width: 100%;
    margin: 0;
    padding: 0.15rem 0.45rem;
    background: transparent;
    font: inherit;
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    font-size: 0.95rem;
    line-height: 1.55;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: 8px;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hitokoto:focus-visible {
    border-color: rgba(126, 203, 255, 0.55);
  }
  .hitokoto.fail {
    border-color: #ff4d4f;
    animation: shake 0.4s ease;
  }
  .from {
    display: inline-block;
    margin-left: 0.35rem;
    opacity: 0.7;
    font-size: 0.85rem;
  }
  .ring {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 22px;
    height: 22px;
    margin: -11px 0 0 -11px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .ring.on {
    opacity: 1;
  }
  .track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.28);
    stroke-width: 2.4;
  }
  .arc {
    fill: none;
    stroke: #fff;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-dasharray: 20 56;
    transform-box: fill-box;
    transform-origin: center;
  }
  .ring.on .arc {
    animation: ring-spin 0.8s linear infinite;
  }
  @keyframes ring-spin {
    to {
      transform: rotate(360deg);
    }
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
