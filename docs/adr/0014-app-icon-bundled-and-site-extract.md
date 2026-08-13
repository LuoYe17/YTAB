# 作者默认 App 图标打进扩展；用户添加走站点最大图标库

Google `s2/favicons` 常把 16–32px 拉到磁贴上发糊。自建图床、自托管 besticon、挂公共聚合站都要运维或额度，否掉。作者默认那 15 个图标按 hostname 打进扩展，首次启动离线也清晰。ChatGPT / Claude / Gemini / DeepSeek 用 [Lobe Icons](https://github.com/lobehub/lobe-icons) 的 SVG 副本（MIT），不运行时打 CDN。Cloudflare 云标取自官网 logo（[cloudflare.com/logo](https://www.cloudflare.com/logo/)）；Cursor 立方体取自 [cursor.com/brand](https://cursor.com/brand) 的 `CUBE_2D_DARK`；Grok 标志取自 [grok.com](https://grok.com) 的 mark 路径。字标太扁，磁贴里只放官方图形，不手绘替代。用户后来添加的 App 用现成库在扩展里解析站点最大图标（favicon-pro），失败再回退 Google；不自己写 HTML 解析。已有网格启动时按 hostname 对照内置表升级，用户上传过的不动。站点本身只有小 ico 的（如网易邮箱）不保证靠抓取变清晰。

**B（2026-08-13）**：像素落盘从直接调 `indexedDB` 改为经两个注入口——`MetaStore`（chrome.storage，只放小 meta）与 `KvStore`（IndexedDB，像素 + 同事务 GC）。生产接真实介质，测试接内存 adapter，于是「壁纸像素先于 meta」「有新像素却写失败就不发 meta」「删掉的 App 图标在同一次事务里清掉」「legacy 壁纸 key 迁移」「像素读失败时退 favicon 但不回写」这些路径能用假件驱动。内存 adapter 到不了的仍有两处：IndexedDB 的事务原子性，以及图标 GC 的 key 列举放在事务内还是事务外——后者靠「所有写入排在同一条队列、单写者」这个论证保证等价，不是靠测试。
