# 作者默认 App 图标打进扩展；用户添加走站点最大图标库

Google `s2/favicons` 常把 16–32px 拉到磁贴上发糊。自建图床、自托管 besticon、挂公共聚合站都要运维或额度，否掉。作者默认那 11 个图标按 hostname 打进扩展，首次启动离线也清晰。ChatGPT / Claude / Gemini / DeepSeek 用 [Lobe Icons](https://github.com/lobehub/lobe-icons) 的 SVG 副本（MIT），不运行时打 CDN。用户后来添加的 App 用现成库在扩展里解析站点最大图标（favicon-pro），失败再回退 Google；不自己写 HTML 解析。已有网格启动时按 hostname 对照内置表升级，用户上传过的不动。站点本身只有小 ico 的（如网易邮箱）不保证靠抓取变清晰。
