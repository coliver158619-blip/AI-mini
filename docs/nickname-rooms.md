# 昵称入口与音乐形象

每台新设备首先显示昵称入口。昵称免密进入：同一昵称对应同一间小屋，不是密码认证。已有昵称可省略性别；新昵称必须选择男生或女生。昵称经过 NFKC 规范化、去除首尾空格和不区分大小写匹配。

## 客户端入口

- 首页：`https://desktop-rjgij1s.tailc7b3e2.ts.net/`
- 陪伴空间：`https://desktop-rjgij1s.tailc7b3e2.ts.net/#/companion-space`
- 新设备输入已有昵称后保留目标路由；首次生成完成后进入首页。

## 会话接口

| 请求 | 说明 |
| --- | --- |
| `GET /api/auth/session` | 返回 `enabled`、`user`；未登录 `user=null`；未完成生成时同时返回 `profile` |
| `POST /api/auth/login` | JSON `{ "nickname": "小蓝", "gender": "male" }`；性别也可为 `female`；返回 `user`、`profile`、`isNew` |
| `POST /api/auth/complete` | 确认首次生成完成，返回 `user` |
| `POST /api/auth/logout` | 撤销当前设备会话；其他设备不受影响 |

`user` 包含 `id`、`nickname`、`gender`、`onboardingComplete`。登录成功设置 30 天 HttpOnly、SameSite=Lax cookie `music_room_session`，HTTPS 下带 Secure。iOS WebView 和原生图片名接口须共享此 cookie；不需要把令牌放进 URL。`GET /api/widget/image` 仍返回 `{ "imageName": "...png" }`，现按登录昵称读取形象。

H5 请求携带 `X-Music-User` 防止另一个标签页切换账号后把旧页面操作写入新用户。播放 beacon 的 JSON 使用 `_accountId`。会话失效返回 401；标签页账号冲突返回 409、`code=ACCOUNT_CHANGED`。非同源写入被拒绝。

昵称可在原设置中更改，之后使用新昵称进入；已存在昵称不能覆盖。`更多玩法` 底部退出后回到入口。

## 数据和首次形象

账号注册表位于数据库相邻的 `<数据库名>-rooms/accounts.sqlite3`；每个账号使用 UUID 命名的独立 SQLite 数据库。聊天、个人/共享日记、收藏、播放、形象、解锁和推荐状态隔离；浏览器待上传播放和共享日记草稿也按账号隔离。旧单用户数据库保留，不自动归属任意新昵称。

首次随机池：所选性别的 8 个音乐形象 + 3 套免费装扮，共 11 个候选。确定的结果先保存在服务器，中断后恢复同一结果。新用户仅默认解锁 6 套免费装扮，额外解锁沿用原流程且只写入本账号。音乐形象本身可选。

生成页展示检测、分析、生成的体验动画；当前匹配按用户要求随机选择，并未新增真实歌单读取/偏好分析接口。

## 8 对音乐风格

| 曲风 | 男生 ID | 女生 ID |
| --- | --- | --- |
| 民谣 Folk | ENFJ | ENFP |
| R&B | INFJ | INFP |
| 摇滚 Rock | ENTP | ENTJ |
| Hip-Hop | ESTP | ESFP |
| 电音 Electronic | INTJ | INTP |
| 流行 Pop | ISTP | ISFP |
| 古典 Classical | ESFJ | ESTJ |
| 古风 Chinese Style | ISTJ | ISFJ |

`shared/music-images.json` 是前后端共用目录。稳定 ID 保持原选择/原生图片名兼容。古风男女和古典男生使用新素材，并同步完整动作帧、头像与趴在音乐报告上的形象。其原生 PNG 位于 `public/assets/personalities/`，WebP 和动作使用 `-v2` 文件避免旧缓存。

回归命令：`python -m unittest backend.test_accounts`、`node node_modules/@playwright/test/cli.js test --config playwright.accounts.config.ts`。已有单用户测试显式使用 `AUTH_ENABLED=false`，正式服务默认启用昵称入口。
