<script lang="ts">
  // 账号面板内容；滚动与 fade 由 SettingsModal 的 .body 包。口令 confirm 仍在父级。
  import type { Snippet } from 'svelte';
  import {
    formatBackupAt,
    sessionUnlocked,
    type AccountSession,
  } from '../../lib/accountSession';

  type OpenSheet = 'set' | 'unlock' | 'change' | 'delete';

  let {
    session,
    accountBusy,
    onLogin,
    onLogout,
    onOpenSheet,
    helpMark,
    githubMark,
    resetRow,
  }: {
    session: AccountSession | null;
    accountBusy: boolean;
    onLogin: () => void;
    onLogout: () => void;
    onOpenSheet: (sheet: OpenSheet) => void;
    helpMark: Snippet<[string]>;
    githubMark: Snippet;
    resetRow: Snippet;
  } = $props();

  const unlocked = $derived(sessionUnlocked(session));
</script>

{#if !session}
  <div class="st-block st-inline">
    <div class="st-head">
      <span class="st-title">云端备份</span>
      {@render helpMark('登录后改完自己传到云端。卸扩展或换机再登录，用恢复口令解开。可以不登。传到云端的是加密后的整份，服务器只见密文。口令忘了只能删掉重来。')}
    </div>
    <button type="button" class="st-action with-mark" disabled={accountBusy} onclick={onLogin}>
      {@render githubMark()}
      {accountBusy ? '登录中…' : '用 GitHub 登录'}
    </button>
  </div>
{:else if session}
  <div class="st-block">
    <div class="st-inline-row">
      <div class="st-head">
        <span class="st-title">云端备份</span>
        {@render helpMark('改完会自己传。后写盖住先写。传到云端的是加密后的整份，服务器只见密文。退出后本机留下，不再上传。')}
      </div>
      <span class="when">
        {#if session.uploadedAt}
          {formatBackupAt(session.uploadedAt)}
        {:else if session.hasBackup}
          {unlocked ? '云端有一份' : '未解开'}
        {:else}
          还没传过
        {/if}
      </span>
    </div>
    <div class="acts">
      {#if unlocked}
        <button type="button" class="st-ghost" disabled={accountBusy} onclick={() => onOpenSheet('change')}>
          改口令
        </button>
      {:else if session.hasBackup !== false}
        <button type="button" class="st-action" disabled={accountBusy} onclick={() => onOpenSheet('unlock')}>
          解开
        </button>
      {:else}
        <button type="button" class="st-action" disabled={accountBusy} onclick={() => onOpenSheet('set')}>
          设口令
        </button>
      {/if}
      <button type="button" class="st-ghost" disabled={accountBusy} onclick={onLogout}>退出</button>
    </div>
  </div>
{/if}
<div class="st-block">
  {#if session}
    <div class="st-inline-row">
      <div class="st-head">
        <span class="st-title">删除云端</span>
        {@render helpMark('只丢掉服务器上的密文。本机不动。')}
      </div>
      <button type="button" class="st-danger" disabled={accountBusy} onclick={() => onOpenSheet('delete')}>
        删除
      </button>
    </div>
  {/if}
  {@render resetRow()}
</div>

<style>
  .st-block.st-inline .st-action {
    align-self: center;
    flex-shrink: 0;
  }
  .when {
    margin: 0;
    color: rgba(255, 255, 255, 0.48);
    font-size: 0.78rem;
    flex-shrink: 0;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  .st-action.with-mark {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .st-action.with-mark :global(svg) {
    flex-shrink: 0;
  }
</style>
