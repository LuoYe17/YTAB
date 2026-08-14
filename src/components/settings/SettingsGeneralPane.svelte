<script lang="ts">
  // 通用面板内容；滚动与 fade 由 SettingsModal 的 .body 包。
  import type { Snippet } from 'svelte';
  import type { Settings } from '../../lib/types';
  import SegmentedControl from '../SegmentedControl.svelte';

  let {
    settings,
    showReset,
    onPatch,
    helpMark,
    resetRow,
  }: {
    settings: Settings;
    showReset: boolean;
    onPatch: (partial: Partial<Settings>) => void;
    helpMark: Snippet<[string]>;
    resetRow: Snippet;
  } = $props();
</script>

<div class="st-block st-inline">
  <div class="st-head">
    <span id="lbl-open" class="st-title">打开方式</span>
    {@render helpMark('点 App 时用当前这一页打开，还是另开一个标签。搜索框和页脚链接不受影响。')}
  </div>
  <SegmentedControl
    labelledBy="lbl-open"
    value={settings.openTarget}
    options={[
      { value: 'current', label: '当前标签' },
      { value: 'new', label: '新标签' },
    ]}
    onChange={(v) => onPatch({ openTarget: v as Settings['openTarget'] })}
  />
</div>
<div class="st-block st-inline">
  <div class="st-head">
    <span id="lbl-bing" class="st-title">搜索地区</span>
    {@render helpMark('搜索框用国内 Bing 还是国际 Bing。国内更贴中文结果。')}
  </div>
  <SegmentedControl
    labelledBy="lbl-bing"
    value={settings.bingEndpoint}
    options={[
      { value: 'cn', label: '国内' },
      { value: 'www', label: '国际' },
    ]}
    onChange={(v) => onPatch({ bingEndpoint: v as Settings['bingEndpoint'] })}
  />
</div>
{#if showReset}
  <div class="st-block">
    {@render resetRow()}
  </div>
{/if}
