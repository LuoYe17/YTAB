/** 口令表单的共通校验。规则与文案只有这里一份，界面提交前先过这里。 */

import { passphraseOk } from './accountCrypto';

/** 口令面板交给宿主的输入；按模式取用，用不到的字段是空串。 */
export type PassphraseInput = {
  /** 已设的口令：解锁云端要对的、改口令要先对上的那串。 */
  oldPass: string;
  /** 要新设的口令；解锁模式下没这项。 */
  newPass: string;
};

/**
 * 新口令要两遍一致且达到最小长度。
 * @returns 给用户看的文案；通过则 null。
 */
export function newPassphraseError(newPass: string, confirmPass: string): string | null {
  if (newPass !== confirmPass) return '两次口令不一致';
  if (!passphraseOk(newPass)) return '恢复口令至少 8 位';
  return null;
}

/**
 * 已设的口令不能空着提交（解锁 / 改口令的旧口令框）。
 * @returns 给用户看的文案；通过则 null。
 */
export function oldPassphraseError(oldPass: string): string | null {
  if (!oldPass) return '请输入恢复口令';
  return null;
}
