<script lang="ts">
  import { createDraggable, createDroppable } from '@dnd-kit/svelte';
  import { srcFor } from '../lib/appIcons';
  import type { AppItem, GridItem } from '../lib/types';

  let {
    item,
    merging = false,
    dwelling = false,
    dragging = false,
    onActivate,
  }: {
    item: GridItem;
    merging?: boolean;
    dwelling?: boolean;
    dragging?: boolean;
    onActivate: () => void;
  } = $props();

  const draggable = createDraggable({
    get id() {
      return item.id;
    },
    get data() {
      return { kind: item.kind, name: item.name };
    },
  });

  const droppable = createDroppable({
    get id() {
      return item.id;
    },
    get data() {
      return { kind: item.kind, name: item.name };
    },
  });

  function childThumb(child: AppItem): string {
    return srcFor(child);
  }

  const iconSrc = $derived(item.kind === 'app' ? srcFor(item) : '');
  const showIcon = $derived(!!iconSrc);
  let imgFailed = $state(false);
  /** 远程裂图后再试站点图；都失败则走字号，与顶层 App 同一条回退链。 */
  let childFailed = $state(new Set<string>());
  $effect(() => {
    void iconSrc;
    if (item.kind === 'folder') void item.children;
    imgFailed = false;
    childFailed = new Set();
  });
</script>

<button
  type="button"
  class="tile"
  class:dragging
  class:dwelling
  class:merging
  data-tile-id={item.id}
  {@attach draggable.attach}
  {@attach droppable.attach}
  onclick={onActivate}
>
  <div class="icon" class:folder={item.kind === 'folder'} class:preview={merging}>
    {#if item.kind === 'folder'}
      <div class="folder-preview">
        {#each Array.from({ length: 4 }, (_, i) => item.children[i] ?? null) as child}
          {#if child}
            {@const src = childThumb(child)}
            {#if src && !childFailed.has(child.id)}
              <img
                src={src}
                alt=""
                draggable="false"
                onerror={(e) => {
                  const fb = srcFor({ ...child, icon: '' });
                  const el = e.currentTarget as HTMLImageElement;
                  if (fb && fb !== src && el.dataset.fb !== '1') {
                    el.dataset.fb = '1';
                    el.src = fb;
                  } else {
                    childFailed = new Set([...childFailed, child.id]);
                  }
                }}
              />
            {:else}
              <span class="ph">{child.name.slice(0, 1)}</span>
            {/if}
          {:else}
            <span class="slot"></span>
          {/if}
        {/each}
      </div>
    {:else if merging}
      <div class="merge-preview" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
    {:else if item.kind === 'app' && showIcon && !imgFailed}
      <img
        src={iconSrc}
        alt=""
        draggable="false"
        onerror={(e) => {
          const fb = item.kind === 'app' ? srcFor({ ...item, icon: '' }) : '';
          const el = e.currentTarget as HTMLImageElement;
          if (fb && fb !== iconSrc && el.dataset.fb !== '1') {
            el.dataset.fb = '1';
            el.src = fb;
          } else {
            imgFailed = true;
          }
        }}
      />
    {:else}
      <span class="ph">{item.name.slice(0, 1)}</span>
    {/if}
  </div>
  <span class="label">{item.name}</span>
</button>

<style>
  .tile {
    appearance: none;
    border: 0;
    background: transparent;
    color: #fff;
    width: 88px;
    cursor: grab;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    touch-action: none;
  }
  .tile:active {
    cursor: grabbing;
  }
  .tile.dragging {
    opacity: 0.35;
  }
  .icon {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: transparent;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    display: grid;
    place-items: center;
    overflow: hidden;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }
  .icon > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    pointer-events: none;
    -webkit-user-drag: none;
    user-select: none;
  }
  .icon.folder {
    background: rgba(255, 255, 255, 0.2);
  }
  .dwelling .icon {
    transform: scale(1.06);
    box-shadow:
      0 0 0 3px rgba(10, 132, 255, 0.55),
      0 8px 24px rgba(0, 0, 0, 0.28);
  }
  .merging .icon {
    transform: scale(1.1);
    box-shadow:
      0 0 0 3px rgba(10, 132, 255, 0.9),
      0 8px 28px rgba(0, 0, 0, 0.35);
  }
  .icon.preview {
    background: rgba(255, 255, 255, 0.28);
  }
  .folder-preview {
    animation: folder-in 0.28s ease;
  }
  @keyframes folder-in {
    from {
      opacity: 0;
      transform: scale(0.82);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .folder-preview,
  .merge-preview {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 3px;
    width: 78%;
    height: 78%;
    pointer-events: none;
  }
  .folder-preview img,
  .folder-preview .ph,
  .folder-preview .slot,
  .merge-preview span {
    width: 100%;
    height: 100%;
    min-height: 0;
    border-radius: 4px;
    object-fit: contain;
    background: rgba(255, 255, 255, 0.35);
  }
  .folder-preview img {
    background: rgba(255, 255, 255, 0.16);
  }
  .folder-preview .ph {
    display: grid;
    place-items: center;
    font-size: 0.62rem;
    font-weight: 650;
    background: rgba(0, 0, 0, 0.2);
  }
  .folder-preview .slot {
    background: transparent;
  }
  .ph {
    font-size: 1.4rem;
    font-weight: 600;
  }
  .label {
    font-size: 0.78rem;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
