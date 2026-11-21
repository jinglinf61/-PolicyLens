# 据时 PolicyLen

据时是一套面向大学生的校园资料与成长工具。可检索官网通知、浏览 39 所高校的推免索引、阅读 415 篇经验导读、进行政策对照，并使用校园成长助手和时间与习惯。

[在线体验](https://policylens-campus.olicy-ens-web.workers.dev/) · [Windows x64 下载](https://github.com/jinglinf61/-PolicyLens/releases/latest)

## 在本机运行

- Windows 下载 ZIP 后完整解压，双击「启动据时.cmd」。程序会打开本机网页，校园成长助手和时间与习惯使用程序生成的「本机邀请凭证.txt」登录。Windows 包自带运行环境和本地模型。
- 开发预览需 Node.js 24 或更新版本。运行 `node local.mjs` 并打开控制台显示的地址。运行 `node prepare-cloud.mjs preview-invite` 导出本机预览凭证。
- Windows 包在解压目录保存数据。网页版同账号跨设备同步。官网检索需要联网。

## 部署到 Cloudflare

1. 运行 `npm install`，再运行 `npx wrangler login`。
2. 用 `npx wrangler d1 create policylens-campus` 创建数据库，将数据库 ID 填入 `wrangler.jsonc`。
3. 对 `schema.sql`、`site-schema.sql` 和 `planner-schema.sql` 分别执行 `npx wrangler d1 execute policylens-campus --remote --file <文件名>`。
4. 运行 `node prepare-cloud.mjs storage-key | npx wrangler secret put STORAGE_KEY`，并妥善保存 `.local/cloud-storage-key.txt`。可选配置 `BRAVE_API_KEY`。
5. 运行 `npm run deploy`。用 `node prepare-cloud.mjs invites 5 <ISO-8601截止时间>` 生成体验凭证，再执行 `npx wrangler d1 execute policylens-campus --remote --file .local/cloud-invites.sql`。从 `.local/cloud-invites.txt` 逐一发放独立凭证。
6. 运行 `npm test` 验证账号隔离、数据加密、跨会话同步和清除流程。

`release/` 包含网页及供浏览的公开资料链接与导读。第三方组件的许可与组件一起提供。模型、Node.js 和 llama.cpp 的许可随 Windows 包提供。
