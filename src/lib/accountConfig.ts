/** 账号备份的公开配置。密钥只放 Worker。Client ID 可写进扩展。空着则不显示登录。 */

export const ACCOUNT_API = 'https://api.ytab.luoye.pro';
export const GITHUB_OAUTH_CLIENT_ID = 'Ov23lilDRiBWeqzeCjiW';
/** GitHub OAuth 回调。OAuth App 里必须填这一条，不能用 chromiumapp.org。 */
export const GITHUB_REDIRECT = `${ACCOUNT_API}/v1/oauth/github/callback`;

/** GitHub Client ID 配好了才显示登录。 */
export function accountConfigured(): boolean {
  return Boolean(ACCOUNT_API && GITHUB_OAUTH_CLIENT_ID);
}
