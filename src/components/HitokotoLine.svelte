<script lang="ts">
  let {
    text,
    from,
  }: {
    text: string;
    from: string;
  } = $props();
</script>

{#if text}
  <p class="hitokoto">
    <span class="text">「{text}」</span>
    {#if from}
      <span class="from">— {from}</span>
    {/if}
  </p>
{/if}

<style>
  .hitokoto {
    margin: 0;
    max-width: min(560px, 90vw);
    text-align: center;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    font-size: 0.95rem;
    line-height: 1.55;
  }
  .from {
    display: inline-block;
    margin-left: 0.35rem;
    opacity: 0.7;
    font-size: 0.85rem;
  }
</style>
