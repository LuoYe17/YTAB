<script lang="ts">
  import './effects.css';

  let {
    size = 40,
  }: {
    /** 像素边长；各入口原来就不是同一尺寸。 */
    size?: number;
  } = $props();
</script>

<svg viewBox="0 0 64 64" width={size} height={size}>
  <circle class="success-ring" cx="32" cy="32" r="22" />
  <path
    class="success-check"
    fill="none"
    stroke="#34c759"
    stroke-width="3.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    d="M20 33.5 28.5 42 44 24"
  />
</svg>

<style>
  .success-ring {
    fill: none;
    stroke: #34c759;
    stroke-width: 3;
    stroke-dasharray: 140;
    stroke-dashoffset: 140;
    animation: fx-ring-draw 0.42s ease forwards;
  }
  .success-check {
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
    animation: fx-check-draw 0.32s 0.18s ease forwards;
  }
</style>
