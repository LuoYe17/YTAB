<script lang="ts">
  let {
    url = '',
  }: {
    url?: string;
  } = $props();

  let layerA = $state('');
  let layerB = $state('');
  let activeIsA = $state(true);
  let bootstrapped = $state(false);
  let gen = 0;
  let chain: Promise<void> = Promise.resolve();

  const FADE_MS = 420;

  $effect(() => {
    const next = url;
    if (!next) return;
    const my = ++gen;
    chain = chain.then(() => crossfadeTo(next, my)).catch(() => {
      /* 解码失败保持当前层 */
    });
  });

  async function crossfadeTo(next: string, my: number) {
    if (my !== gen) return;
    if (!bootstrapped) {
      layerA = next;
      activeIsA = true;
      bootstrapped = true;
      return;
    }
    const current = activeIsA ? layerA : layerB;
    if (current === next) return;

    await decodeUrl(next);
    if (my !== gen) return;

    if (activeIsA) {
      layerB = next;
      await frame();
      if (my !== gen) return;
      activeIsA = false;
    } else {
      layerA = next;
      await frame();
      if (my !== gen) return;
      activeIsA = true;
    }
    await sleep(FADE_MS);
  }

  function decodeUrl(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('wallpaper decode failed'));
      img.src = src;
    });
  }

  function frame() {
    return new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  }

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }
</script>

<div class="stage" aria-hidden="true">
  <div
    class="layer"
    class:on={activeIsA}
    style:background-image={layerA ? `url(${JSON.stringify(layerA)})` : 'none'}
  ></div>
  <div
    class="layer"
    class:on={!activeIsA}
    style:background-image={layerB ? `url(${JSON.stringify(layerB)})` : 'none'}
  ></div>
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    background: #1a1b1e;
  }
  .layer {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0;
    transition: opacity 420ms ease;
    will-change: opacity;
  }
  .layer.on {
    opacity: 1;
  }
</style>
