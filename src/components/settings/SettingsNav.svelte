<script lang="ts">
  // 设置侧栏：头像条、分类指示、页脚。详情面板由父级切换。
  import { tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { AccountSession } from '../../lib/accountSession';
  import type { SettingsTab } from '../../lib/types';
  import GhostTip from '../GhostTip.svelte';

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: '通用' },
    { id: 'wallpaper', label: '壁纸' },
  ];

  const REPO_URL = 'https://github.com/LuoYe17/YTAB';
  const VERSION = 'v0.1.0';

  let {
    tab,
    session,
    showWho,
    onSelectTab,
    githubMark,
  }: {
    tab: SettingsTab;
    session: AccountSession | null;
    showWho: boolean;
    onSelectTab: (id: SettingsTab) => void;
    githubMark: Snippet;
  } = $props();

  let navEl = $state<HTMLElement | null>(null);
  let pill = $state({ top: 0, height: 0 });
  let pillSlide = $state(false);

  $effect(() => {
    void tab;
    const slide = untrack(() => pillSlide);
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
</script>

{#snippet userMark()}
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" stroke="currentColor" stroke-width="2" />
    <path
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      d="M5.2 19.2c.9-3.2 3.6-4.8 6.8-4.8s5.9 1.6 6.8 4.8"
    />
  </svg>
{/snippet}

{#snippet tabIcon(id: SettingsTab)}
  {#if id === 'general'}
    <!-- Lucide settings，ISC https://lucide.dev -->
    <svg class="tab-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
    </svg>
  {:else}
    <!-- Lucide image，ISC https://lucide.dev -->
    <svg class="tab-ico" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" stroke="currentColor" stroke-width="2" />
      <circle cx="9" cy="9" r="2" stroke="currentColor" stroke-width="2" />
      <path
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
      />
    </svg>
  {/if}
{/snippet}

<aside>
  {#if showWho}
    <button type="button" class="who" class:on={tab === 'account'} onclick={() => onSelectTab('account')}>
      {#if session?.avatar}
        <img class="who-ava" src={session.avatar} alt="" />
      {:else}
        <span class="who-ava ph">{@render userMark()}</span>
      {/if}
      <span class="who-name">{session ? session.label : '登录'}</span>
    </button>
    <div class="who-rule"></div>
  {/if}
  <nav bind:this={navEl}>
    <div
      class="pill"
      class:on={pill.height > 0}
      class:slide={pillSlide}
      style:top="{pill.top}px"
      style:height="{pill.height}px"
    ></div>
    {#each TABS as item}
      <button type="button" data-tab={item.id} class:active={tab === item.id} onclick={() => onSelectTab(item.id)}>
        {@render tabIcon(item.id)}
        {item.label}
      </button>
    {/each}
  </nav>
  <div class="foot">
    <div class="foot-start">
      <GhostTip label="GitHub">
        <a class="icon" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub">
          {@render githubMark()}
        </a>
      </GhostTip>
    </div>
    <span class="ver">{VERSION}</span>
    <div class="foot-end"></div>
  </div>
</aside>

<style>
  aside {
    position: relative;
    z-index: 2;
    background: rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .who {
    appearance: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    margin: 0.55rem 0.5rem 0;
    padding: 0.85rem 0.5rem 0.65rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    min-width: 0;
  }
  .who:hover:not(.on) {
    background: rgba(255, 255, 255, 0.06);
  }
  .who.on {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }
  .who-rule {
    height: 1px;
    margin: 0.4rem 1.2rem 0;
    background: rgba(255, 255, 255, 0.12);
    flex-shrink: 0;
  }
  .who-ava {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.08);
  }
  .who-ava.ph {
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.5);
  }
  .who-ava.ph :global(svg) {
    width: 22px;
    height: 22px;
  }
  .who-name {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.82rem;
    text-align: center;
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
    display: flex;
    align-items: center;
    gap: 0.42rem;
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
  .tab-ico {
    flex-shrink: 0;
    opacity: 0.78;
  }
  nav button.active .tab-ico {
    opacity: 1;
  }
  .foot {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    margin-top: auto;
    padding: 0.45rem 0.6rem 0.7rem;
    background-image: linear-gradient(rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.12));
    background-size: calc(100% - 2.4rem) 1px;
    background-position: top center;
    background-repeat: no-repeat;
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
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }
  a.icon:hover {
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.08);
  }
</style>
