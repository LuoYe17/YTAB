<script lang="ts">
  let {
    on = false,
    labelledBy,
    onChange,
  }: {
    on: boolean;
    labelledBy?: string;
    onChange: (next: boolean) => void;
  } = $props();
</script>

<button
  type="button"
  class="knob"
  class:on
  role="switch"
  aria-checked={on}
  aria-labelledby={labelledBy}
  onclick={() => onChange(!on)}
></button>

<style>
  .knob {
    appearance: none;
    width: 42px;
    height: 26px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.2s ease;
  }
  .knob.on {
    background: #34c759;
  }
  .knob::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .knob.on::after {
    transform: translateX(16px);
  }
</style>
