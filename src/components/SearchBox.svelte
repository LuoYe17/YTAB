<script lang="ts">
  import bingMark from '../assets/bing.svg?raw';
  import type { BingEndpoint } from '../lib/types';
  import { bingSearchUrl } from '../lib/search';

  let {
    endpoint,
  }: {
    endpoint: BingEndpoint;
  } = $props();

  let query = $state('');
  const bingSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(bingMark)}`;

  function submit(e: Event) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    location.href = bingSearchUrl(q, endpoint);
  }
</script>

<form class="search" onsubmit={submit}>
  <img class="bing" src={bingSrc} alt="" width="22" height="22" draggable="false" />
  <input
    type="search"
    placeholder="搜索 Bing…"
    bind:value={query}
    autocomplete="off"
    spellcheck="false"
  />
</form>

<style>
  .search {
    width: min(520px, 86vw);
    display: flex;
    align-items: center;
    gap: 0.55rem;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(10px);
    border-radius: 999px;
    padding: 0 1.15rem 0 1.05rem;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .search:focus-within {
    border-color: rgba(255, 255, 255, 0.45);
    background: rgba(0, 0, 0, 0.38);
  }
  .bing {
    flex-shrink: 0;
    display: block;
    width: 22px;
    height: 22px;
  }
  input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    border: 0;
    background: transparent;
    color: #fff;
    padding: 0.72rem 0;
    font-size: 1rem;
    outline: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    appearance: none;
  }
  input::-webkit-search-decoration,
  input::-webkit-search-cancel-button,
  input::-webkit-search-results-button,
  input::-webkit-search-results-decoration {
    display: none;
  }
  input::placeholder {
    color: rgba(255, 255, 255, 0.55);
  }
</style>
