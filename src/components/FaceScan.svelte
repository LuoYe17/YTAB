<script lang="ts">
  let {
    color,
    size = 40,
  }: {
    color: string;
    /** 像素边长；各入口原来就不是同一尺寸。 */
    size?: number;
  } = $props();
</script>

<svg viewBox="0 0 64 64" width={size} height={size}>
  <g class="tail">
    <circle cx="32" cy="11" r="3.1" fill={color} />
    <circle cx="42.5" cy="15.2" r="2.5" fill={color} opacity="0.72" />
    <circle cx="50.2" cy="24" r="2" fill={color} opacity="0.48" />
    <circle cx="52.8" cy="34.5" r="1.5" fill={color} opacity="0.26" />
  </g>
</svg>

<style>
  .tail {
    transform-origin: 32px 32px;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
