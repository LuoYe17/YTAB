<script lang="ts">
  let {
    labelledBy,
    value,
    options,
    onChange,
  }: {
    labelledBy?: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (next: string) => void;
  } = $props();
</script>

<div class="seg" role="radiogroup" aria-labelledby={labelledBy}>
  {#each options as opt}
    <button
      type="button"
      role="radio"
      aria-checked={value === opt.value}
      class:on={value === opt.value}
      onclick={() => onChange(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.28);
    padding: 2px;
    gap: 2px;
  }
  button {
    appearance: none;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.62);
    border-radius: 6px;
    padding: 0.28rem 0.7rem;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background 0.16s ease,
      color 0.16s ease;
  }
  button.on {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }
</style>
