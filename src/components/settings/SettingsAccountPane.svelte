<script lang="ts">
  // 账号编排：登录 / 登出 / 口令三态 / 删云端的活都在这里，设置弹窗只留侧栏与 frame。
  // 上传要用宿主的整份状态，走 onBackup 回调——面板本身不碰 YtabState。
  import type { Snippet } from 'svelte';
  import { deleteBackup, fetchBackup } from '../../lib/accountApi';
  import { signIn } from '../../lib/accountAuth';
  import { unlockBundle } from '../../lib/accountBackup';
  import { plainNotice } from '../../lib/notice';
  import type { PassphraseInput } from '../../lib/passphrase';
  import {
    clearSession,
    formatBackupAt,
    saveSession,
    sessionFromAuth,
    sessionUnlocked,
    type AccountSession,
  } from '../../lib/accountSession';
  import type { YtabState } from '../../lib/types';

  type AccountSheet = 'set' | 'unlock' | 'change' | 'choose' | 'delete';
  type PassMode = 'set' | 'unlock' | 'change';

  // session 由壳层加载并补头像（侧栏头像条在账号 tab 之外也要用）；这里只做改写。
  let {
    session = $bindable(null),
    busy = $bindable(false),
    onboardingDone,
    onOpenSheet,
    onCloseSheet,
    onApplyState,
    onBackup,
    helpMark,
    githubMark,
    resetRow,
  }: {
    session?: AccountSession | null;
    busy?: boolean;    onboardingDone: boolean;
    onOpenSheet: (sheet: AccountSheet) => void;
    onCloseSheet: () => void;
    onApplyState: (state: YtabState) => void | Promise<void>;
    /** 用宿主当前整份、以给定口令加密上传；返回写回后的会话。 */
    onBackup: (passphrase: string, session: AccountSession) => Promise<AccountSession>;
    helpMark: Snippet<[string]>;
    githubMark: Snippet;
    resetRow: Snippet;
  } = $props();

  const unlocked = $derived(sessionUnlocked(session));

  function fail(err: unknown, fallback: string) {
    plainNotice('fail', err instanceof Error ? err.message : fallback);
  }

  async function login() {
    if (busy) return;
    busy = true;
    try {
      const auth = await signIn();
      const next = await sessionFromAuth(auth);
      await saveSession(next);
      session = next;
      if (auth.hasBackup) {
        onOpenSheet(onboardingDone ? 'choose' : 'unlock');
      } else if (onboardingDone) {
        onOpenSheet('set');
      } else {
        plainNotice('ok', '云端还没有，先选一种起始');
      }
    } catch (err) {
      fail(err, '登录失败');
    } finally {
      busy = false;
    }
  }

  async function logout() {
    await clearSession();
    session = null;
    onCloseSheet();
    plainNotice('ok', '已登出');
  }

  /** 口令三张卡的统一提交口；校验已在 PassphraseSheet 做过。 */
  export async function submitPass(mode: PassMode, input: PassphraseInput) {
    if (busy) return;
    if (mode === 'unlock') await runUnlock(input.oldPass);
    else await runUpload(mode, input);
  }

  async function runUpload(mode: 'set' | 'change', input: PassphraseInput) {
    if (!session) return;
    busy = true;
    try {
      if (mode === 'change') {
        // 解开只为验旧口令，明文随即丢弃；上传的内容以这台当前状态为准（后写盖住先写）。
        const bundle = await fetchBackup(session.token);
        if (bundle) await unlockBundle(bundle, input.oldPass);
      }
      session = await onBackup(input.newPass, session);
      onCloseSheet();
      plainNotice('ok', mode === 'set' ? '已上传' : '已改口令');
    } catch (err) {
      fail(err, mode === 'set' ? '上传失败' : '改口令失败');
    } finally {
      busy = false;
    }
  }

  async function runUnlock(pass: string) {
    if (!session) return;
    busy = true;
    try {
      const bundle = await fetchBackup(session.token);
      if (!bundle) throw new Error('云端还没有');
      const got = await unlockBundle(bundle, pass);
      const next = {
        ...session,
        rawKey: got.rawKey,
        salt: got.salt,
        iter: got.iter,
        hasBackup: true,
        uploadedAt: session.uploadedAt,
      };
      await saveSession(next);
      session = next;
      await onApplyState(got.state);
      onCloseSheet();
      plainNotice('ok', '已恢复');
    } catch (err) {
      fail(err, '恢复失败');
    } finally {
      busy = false;
    }
  }

  export async function confirmDeleteCloud() {
    if (!session || busy) return;
    busy = true;
    try {
      await deleteBackup(session.token);
      const next = {
        ...session,
        rawKey: undefined,
        salt: undefined,
        iter: undefined,
        uploadedAt: undefined,
        hasBackup: false,
      };
      await saveSession(next);
      session = next;
      onCloseSheet();
      plainNotice('ok', '云端这份已删');
    } catch (err) {
      fail(err, '删除失败');
    } finally {
      busy = false;
    }
  }
</script>

{#if !session}
  <div class="st-block st-inline">
    <div class="st-head">
      <span class="st-title">云端备份</span>
      {@render helpMark('登录后改完自己传到云端。卸扩展或换机再登录，用恢复口令解开。可以不登。传到云端的是加密后的整份，服务器只见密文。口令忘了只能删掉重来。')}
    </div>
    <button type="button" class="st-action with-mark" disabled={busy} onclick={login}>
      {@render githubMark()}
      {busy ? '登录中…' : '用 GitHub 登录'}
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
        <button type="button" class="st-ghost" disabled={busy} onclick={() => onOpenSheet('change')}>
          改口令
        </button>
      {:else if session.hasBackup !== false}
        <button type="button" class="st-action" disabled={busy} onclick={() => onOpenSheet('unlock')}>
          解开
        </button>
      {:else}
        <button type="button" class="st-action" disabled={busy} onclick={() => onOpenSheet('set')}>
          设口令
        </button>
      {/if}
      <button type="button" class="st-ghost" disabled={busy} onclick={logout}>退出</button>
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
      <button type="button" class="st-danger" disabled={busy} onclick={() => onOpenSheet('delete')}>
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
