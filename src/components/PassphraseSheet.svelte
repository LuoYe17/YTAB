<script lang="ts">
  // 设口令 / 解开 / 改口令三张确认卡共用的骨架：字段、校验、busy 都在这里，宿主只管提交后的活。
  // st-confirm* 与 st-head 系来自 settingsChrome.css，由宿主 SettingsModal 统一导入。
  import { fade } from 'svelte/transition';
  import HelpMark from './HelpMark.svelte';
  import { plainNotice } from '../lib/notice';
  import {
    newPassphraseError,
    oldPassphraseError,
    type PassphraseInput,
  } from '../lib/passphrase';
  import './passField.css';

  type Mode = 'set' | 'unlock' | 'change';

  let {
    mode,
    hasBackup = false,
    busy = false,
    onCancel,
    onSubmit,
  }: {
    mode: Mode;
    /** set 态文案分支：云端已有份时提醒会盖住。 */
    hasBackup?: boolean;
    busy?: boolean;
    onCancel: () => void;
    /** 校验已在这里做完；oldPass / newPass 按模式取，用不到的是空串。 */
    onSubmit: (input: PassphraseInput) => void | Promise<void>;
  } = $props();

  const COPY: Record<Mode, { title: string; help: string; action: string }> = {
    set: { title: '恢复口令', help: '用来加密云端这份。忘了就打不开，只能删掉重来。', action: '确定' },
    unlock: { title: '解开云端', help: '输入当时设的恢复口令。', action: '解开' },
    change: { title: '改口令', help: '要先对上现在的口令。', action: '确定' },
  };

  const blurb = $derived(
    mode === 'set'
      ? hasBackup
        ? '会用这台的内容盖住云端那份，旧口令随之作废。至少 8 位。'
        : '至少 8 位。再输入一次确认。'
      : mode === 'unlock'
        ? '解开后这台会记住，退出或卸扩展才忘。'
        : '新口令至少 8 位。',
  );

  // 改口令的新口令框带名字，设口令的只有强度提示——沿用各自原占位符。
  const newPlaceholder = $derived(mode === 'change' ? '新口令，至少 8 位' : '至少 8 位');

  let oldPass = $state('');
  let newPass = $state('');
  let confirmPass = $state('');

  async function submit() {
    if (busy) return;
    const err =
      mode === 'unlock' ? oldPassphraseError(oldPass) : newPassphraseError(newPass, confirmPass);
    if (err) {
      plainNotice('fail', err);
      return;
    }
    await onSubmit({ oldPass, newPass });
  }
</script>

<div class="st-confirm" transition:fade={{ duration: 140 }}>
  <div class="st-confirm-card">
    <div class="st-head">
      <span class="st-title">{COPY[mode].title}</span>
      <HelpMark text={COPY[mode].help} />
    </div>
    <p>{blurb}</p>
    {#if mode === 'unlock'}
      <input
        class="pass"
        type="password"
        autocomplete="current-password"
        placeholder="恢复口令"
        bind:value={oldPass}
      />
    {:else}
      {#if mode === 'change'}
        <input
          class="pass"
          type="password"
          autocomplete="current-password"
          placeholder="现在的口令"
          bind:value={oldPass}
        />
      {/if}
      <input
        class="pass"
        type="password"
        autocomplete="new-password"
        placeholder={newPlaceholder}
        bind:value={newPass}
      />
      <input
        class="pass"
        type="password"
        autocomplete="new-password"
        placeholder="再输入一次"
        bind:value={confirmPass}
      />
    {/if}
    <div class="st-confirm-row">
      <button type="button" class="st-ghost" onclick={onCancel}>取消</button>
      <button type="button" class="st-action" disabled={busy} onclick={submit}>
        {COPY[mode].action}
      </button>
    </div>
  </div>
</div>
