<script lang="ts">
  let {
    on = false,
    label,
    onChange,
  }: {
    on: boolean;
    label: string;
    onChange: (next: boolean) => void;
  } = $props();
</script>

<button
  type="button"
  class="cap"
  class:on
  role="switch"
  aria-checked={on}
  onclick={() => onChange(!on)}
>
  {label}
</button>

<style>
  .cap {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.72);
    border-radius: 999px;
    padding: 0.32rem 0.75rem;
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    transition:
      background 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
  }
  .cap:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .cap.on {
    background: rgba(126, 203, 255, 0.28);
    border-color: rgba(126, 203, 255, 0.55);
    color: #fff;
  }
  .cap:active {
    transform: scale(0.97);
  }
</style>
