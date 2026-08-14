<script lang="ts">
  import GhostTip from './GhostTip.svelte';

  let { text }: { text: string } = $props();
</script>

<GhostTip label={text} wrap>
  <button type="button" class="help" aria-label={text}>?</button>
</GhostTip>

<style>
  .help {
    appearance: none;
    width: 1rem;
    height: 1rem;
    margin: 0;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 50%;
    background: transparent;
    color: rgba(255, 255, 255, 0.48);
    font: inherit;
    font-size: 0.68rem;
    line-height: 1;
    cursor: help;
  }
  .help:hover {
    color: rgba(255, 255, 255, 0.88);
    border-color: rgba(255, 255, 255, 0.5);
  }
</style>
