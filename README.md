# 药品有效期管理

包含新增、编辑、删除、筛选、30 天内临期统计及 PWA 安装。页面打开时以及页面保持开启时自动刷新日期状态；不会在网页关闭时发送系统通知。

## 直接使用（本机模式）

当前 `config.js` 已填入你的 Supabase Project URL 和 publishable key，网页默认进入云端模式。若仅想在本机使用，可将 `config.js` 中的两个值都改为空字符串，记录会保存在当前浏览器的 localStorage 中；清理浏览器数据、换设备或使用无痕模式会丢失这些记录。部署前请备份已有本地记录；旧版本原本主要写入 Supabase，不能自动迁移到这个新本地空间。

本地检查可在文件夹内运行 `python3 -m http.server 8000`，然后打开 `http://localhost:8000/`。PWA 安装需要 HTTPS 或 localhost。不要直接双击 HTML 文件运行模块脚本。

## 可选：启用 Supabase 多设备同步

1. 创建 Supabase 项目，在 Authentication 设置中启用 Email 登录，并设置实际部署域名的 Site URL 和允许的 Redirect URL。根据邮箱验证设置，注册后可能需要点邮件中的链接。
2. 在 SQL Editor 执行 `schema.sql`。它建立 `drugs` 表和按登录用户隔离的访问规则。如果已有同名表，应先核对字段、旧数据及规则，再运行脚本；不要盲目覆盖原有结构。
3. 当前压缩包的 `config.js` 已填写 Project URL 与 **publishable** key。如更换项目，再替换这两个字符串。绝对不要使用 `service_role` 或 secret key。
4. 上传整个文件夹，使用 HTTPS 访问，注册/登录后即可添加云端记录。云端和本机数据相互独立，不会自动合并。云端模式需要联网；如果初始化失败，页面会明确提示并进入本机模式。

浏览器可能缓存旧版本。如修改 `config.js` 后未生效，强制刷新页面或清理该站点的 Service Worker 缓存。公开的前端 key 本身并不保密，数据隔离依赖数据库 RLS 与用户登录。

## 文件

- `index.html`：界面和样式
- `app.js`：药品管理、日期计算、认证及数据操作
- `config.js`：可选云端配置
- `schema.sql`：Supabase 表及访问规则
- `sw.js`、`manifest.json`、`icon.svg`：PWA 文件
