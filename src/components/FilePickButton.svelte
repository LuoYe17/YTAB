<script lang="ts">
  let {
    label,
    accept,
    onFile,
  }: {
    label: string;
    accept: string;
    onFile: (file: File) => void;
  } = $props();

  let inputEl = $state<HTMLInputElement | null>(null);

  function pick() {
    inputEl?.click();
  }

  function onChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onFile(file);
    input.value = '';
  }
</script>

<div class="box">
  <button type="button" class="pick" onclick={pick}>{label}</button>
  <input bind:this={inputEl} class="sr" type="file" {accept} onchange={onChange} tabindex="-1" />
</div>

<style>
  .box {
    position: relative;
    align-self: flex-start;
  }
  .pick {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    font: inherit;
    font-size: 0.86rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .pick:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.28);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
