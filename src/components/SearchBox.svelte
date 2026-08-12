<script lang="ts">
  import type { BingEndpoint } from '../lib/types';
  import { bingSearchUrl } from '../lib/search';

  let {
    endpoint,
  }: {
    endpoint: BingEndpoint;
  } = $props();

  let query = $state('');

  function submit(e: Event) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    location.href = bingSearchUrl(q, endpoint);
  }
</script>

<form class="search" onsubmit={submit}>
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
  }
  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(10px);
    color: #fff;
    border-radius: 999px;
    padding: 0.72rem 1.2rem;
    font-size: 1rem;
    outline: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  input::placeholder {
    color: rgba(255, 255, 255, 0.55);
  }
  input:focus {
    border-color: rgba(255, 255, 255, 0.45);
    background: rgba(0, 0, 0, 0.38);
  }
</style>
