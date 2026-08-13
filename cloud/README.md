# 账号备份接口

Cloudflare Worker + R2。不打进扩展包。

1. 复制 `.dev.vars.example` 为 `.dev.vars`，填 `AUTH_SECRET` 和 GitHub OAuth。
2. `pnpm install` 后 `pnpm wrangler r2 bucket create ytab-backups`。
3. `pnpm wrangler secret put AUTH_SECRET`（以及 GitHub 两个 secret）。
4. DNS：`api.ytab.luoye.pro` CNAME 到 Worker。
5. `pnpm cf-deploy`（`deploy` 是 pnpm 内置命令，脚本名特意避开）。
6. 扩展 `src/lib/accountConfig.ts` 填 GitHub Client ID。没填则不显示登录。
7. GitHub OAuth App 的 Authorization callback URL 必须是 `https://api.ytab.luoye.pro/v1/oauth/github/callback`。
8. 域名 `luoye.pro` 在 Cloudflare 时，部署会挂上 `api.ytab.luoye.pro`。
