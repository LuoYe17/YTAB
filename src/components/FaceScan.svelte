<script lang="ts">
  import './effects.css';

  let {
    color,
    track,
    size = 40,
  }: {
    color: string;
    track: string;
    /** 像素边长；各入口原来就不是同一尺寸。 */
    size?: number;
  } = $props();
</script>

<svg viewBox="0 0 64 64" width={size} height={size}>
  <circle class="faceid-track" cx="32" cy="32" r="22" stroke={track} />
  <circle class="faceid-arc" cx="32" cy="32" r="22" stroke={color} />
  <g class="faceid-mark" fill="none" stroke={color} stroke-linecap="round" stroke-linejoin="round">
    <path stroke-width="2.4" d="M22 26V22h4" />
    <path stroke-width="2.4" d="M42 22h4v4" />
    <path stroke-width="2.4" d="M46 42v4h-4" />
    <path stroke-width="2.4" d="M26 46h-4v-4" />
    <ellipse cx="32" cy="33" rx="7.5" ry="9" stroke-width="2" />
    <circle cx="29.2" cy="31.5" r="1.15" fill={color} stroke="none" />
    <circle cx="34.8" cy="31.5" r="1.15" fill={color} stroke="none" />
    <path stroke-width="1.8" d="M32 33.2v3.2" />
  </g>
</svg>

<style>
  .faceid-track {
    fill: none;
    stroke-width: 3;
  }
  .faceid-arc {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 42 96;
    transform-origin: 32px 32px;
    animation: fx-faceid-spin 0.9s linear infinite;
  }
  .faceid-mark {
    animation: fx-faceid-pulse 0.9s ease-in-out infinite;
  }
</style>
