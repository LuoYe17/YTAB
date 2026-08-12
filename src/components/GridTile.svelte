<script lang="ts">
  import { createDraggable, createDroppable } from '@dnd-kit/svelte';
  import type { GridItem } from '../lib/types';

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
          {#if child?.icon}
            <img src={child.icon} alt="" draggable="false" />
          {:else if child}
            <span class="ph"></span>
          {:else}
            <span class="slot"></span>
          {/if}
        {/each}
      </div>
    {:else if merging}
      <div class="merge-preview" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
    {:else if item.icon}
      <img src={item.icon} alt="" draggable="false" />
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
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.14);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    display: grid;
    place-items: center;
    overflow: hidden;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }
  .icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    object-fit: cover;
    background: rgba(255, 255, 255, 0.35);
  }
  .folder-preview .ph {
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
