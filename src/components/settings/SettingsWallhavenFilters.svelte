<script lang="ts">
  // Wallhaven 尺度 / 分类 / 排序 / 标签；折叠壳与密钥行在别处。
  import type { Snippet } from 'svelte';
  import { foldMax } from '../../lib/foldMax';
  import { visibleTagPresets, type FilterAction } from '../../lib/settingsFilters';
  import { DEFAULT_SETTINGS, type Settings, type WallhavenSorting } from '../../lib/types';
  import CapsuleSwitch from '../CapsuleSwitch.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';

  const SORTING_OPTIONS: { value: WallhavenSorting; label: string }[] = [
    { value: 'random', label: '随机' },
    { value: 'date_added', label: '最新' },
    { value: 'relevance', label: '相关' },
    { value: 'views', label: '浏览' },
    { value: 'favorites', label: '收藏' },
    { value: 'toplist', label: '热门' },
  ];

  let {
    settings,
    glowFilters,
    onCommitFilter,
    helpMark,
  }: {
    settings: Settings;
    glowFilters: boolean;
    onCommitFilter: (action: FilterAction) => void;
    helpMark: Snippet<[string]>;
  } = $props();

  let tagsOpen = $state(false);

  const hasKey = $derived((settings.wallhavenApiKey ?? '').trim().length > 0);
  const tagPresets = $derived(visibleTagPresets(settings.wallhavenCategories));
  const sortingOptions = $derived(
    SORTING_OPTIONS.map((o) => ({
      ...o,
      collapsed: o.value === 'relevance' && (settings.wallhavenTags?.length ?? 0) === 0,
    })),
  );
</script>

<div class="filters">
  <div class="wh-row" class:st-glow={glowFilters}>
    <div class="st-head">
      <span class="st-title">尺度</span>
      {@render helpMark('想看少儿不宜的图。至少留一项。没密钥不能开「少儿不宜」。')}
    </div>
    <div class="caps tight">
      <CapsuleSwitch
        label="安全"
        tile
        on={settings.wallhavenPurity.sfw}
        onChange={(on) => onCommitFilter({ type: 'purity', key: 'sfw', on })}
      />
      <CapsuleSwitch
        label="擦边"
        tile
        on={settings.wallhavenPurity.sketchy}
        onChange={(on) => onCommitFilter({ type: 'purity', key: 'sketchy', on })}
      />
      <CapsuleSwitch
        label="少儿不宜"
        tile
        on={settings.wallhavenPurity.nsfw}
        disabled={!hasKey}
        onChange={(on) => onCommitFilter({ type: 'purity', key: 'nsfw', on })}
      />
    </div>
  </div>
  <div class="wh-row" class:st-glow={glowFilters}>
    <div class="st-head">
      <span class="st-title">分类</span>
      {@render helpMark('壁纸属于哪一类。至少留一项。')}
    </div>
    <div class="caps tight">
      <CapsuleSwitch
        label="常规"
        tile
        on={settings.wallhavenCategories.general}
        onChange={(on) => onCommitFilter({ type: 'category', key: 'general', on })}
      />
      <CapsuleSwitch
        label="动漫"
        tile
        on={settings.wallhavenCategories.anime}
        onChange={(on) => onCommitFilter({ type: 'category', key: 'anime', on })}
      />
      <CapsuleSwitch
        label="人物"
        tile
        on={settings.wallhavenCategories.people}
        onChange={(on) => onCommitFilter({ type: 'category', key: 'people', on })}
      />
    </div>
  </div>
  <div class="wh-row">
    <div class="st-head">
      <span id="wallpaper-sorting" class="st-title">排序</span>
      {@render helpMark('按什么顺序抽图。「热门」看近一个月。勾了标签才出现「相关」；从随机或最新勾上第一个标签会改到相关。')}
    </div>
    <SegmentedControl
      labelledBy="wallpaper-sorting"
      value={settings.wallhavenSorting || DEFAULT_SETTINGS.wallhavenSorting}
      options={sortingOptions}
      fill
      onChange={(v) => onCommitFilter({ type: 'sorting', value: v as WallhavenSorting })}
    />
  </div>
  <div
    class="st-head st-fold"
    role="button"
    tabindex="0"
    aria-expanded={tagsOpen}
    aria-label={tagsOpen ? '收起标签' : '展开标签'}
    onclick={(e) => {
      if ((e.target as HTMLElement).closest('.help')) return;
      tagsOpen = !tagsOpen;
    }}
    onkeydown={(e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if ((e.target as HTMLElement).closest('.help')) return;
      e.preventDefault();
      tagsOpen = !tagsOpen;
    }}
  >
    <span class="st-title">标签</span>
    <span class="st-fold-help">
      {@render helpMark('可选。跟着上面分类换。多选一起搜，全关就不限题材。')}
    </span>
    <span class="st-chev" class:open={tagsOpen} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14">
        <path
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M4 6.5 8 10.5 12 6.5"
        />
      </svg>
    </span>
  </div>
  <div class="st-fold-body" class:open={tagsOpen} use:foldMax={tagsOpen}>
    <div class="caps fill">
      {#each tagPresets as tag (tag.id)}
        <CapsuleSwitch
          label={tag.label}
          tile
          on={(settings.wallhavenTags ?? []).includes(tag.id)}
          onChange={(on) => onCommitFilter({ type: 'tag', id: tag.id, on })}
        />
      {/each}
    </div>
  </div>
</div>

<style>
  .filters {
    display: contents;
  }
  .wh-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    padding: 0.15rem 0;
    border-radius: 8px;
  }
  .caps.tight {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
  }
  .caps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .caps.fill {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.4rem;
  }
</style>
