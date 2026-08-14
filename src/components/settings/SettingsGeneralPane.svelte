<script lang="ts">
  // 通用面板内容；滚动与 fade 由 SettingsModal 的 .body 包。
  import type { Snippet } from 'svelte';
  import type { Settings } from '../../lib/types';
  import SegmentedControl from '../SegmentedControl.svelte';

  let {
    settings,
    showReset,
    onChange,
    helpMark,
    resetRow,
  }: {
    settings: Settings;
    showReset: boolean;
    onChange: (next: Settings, invalidatePool?: boolean) => void;
    helpMark: Snippet<[string]>;
    resetRow: Snippet;
  } = $props();

  function patch(partial: Partial<Settings>) {
    onChange({ ...settings, ...partial });
  }
</script>

<div class="block inline">
  <div class="head">
    <span id="lbl-open" class="title">打开方式</span>
    {@render helpMark('点 App 时用当前这一页打开，还是另开一个标签。搜索框和页脚链接不受影响。')}
  </div>
  <SegmentedControl
    labelledBy="lbl-open"
    value={settings.openTarget}
    options={[
      { value: 'current', label: '当前标签' },
      { value: 'new', label: '新标签' },
    ]}
    onChange={(v) => patch({ openTarget: v as Settings['openTarget'] })}
  />
</div>
<div class="block inline">
  <div class="head">
    <span id="lbl-bing" class="title">搜索地区</span>
    {@render helpMark('搜索框用国内 Bing 还是国际 Bing。国内更贴中文结果。')}
  </div>
  <SegmentedControl
    labelledBy="lbl-bing"
    value={settings.bingEndpoint}
    options={[
      { value: 'cn', label: '国内' },
      { value: 'www', label: '国际' },
    ]}
    onChange={(v) => patch({ bingEndpoint: v as Settings['bingEndpoint'] })}
  />
</div>
{#if showReset}
  <div class="block">
    {@render resetRow()}
  </div>
{/if}

<style>
  .block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.7rem 0.8rem;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
  }
  .block.inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .block.inline .head {
    flex-wrap: nowrap;
    flex-shrink: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.22rem 0.5rem;
  }
  .title {
    font-weight: 600;
  }
</style>
