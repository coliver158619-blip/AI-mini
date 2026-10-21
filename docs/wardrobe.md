# 音乐人格与人物装扮

保留两套独立选择，最后确认的类别作为首页当前形象；切换类别不会清空另一套选择。

- 更多玩法 → 音乐人格：16 型面包体人，支持分组、关键词、音乐偏好与陪伴风格。浏览不保存，确认后首页使用该人格。
- 更多玩法 → 形象：在预览卡下方先选刘宇宁或张韶涵，再试穿对应装扮。刘宇宁 6 套，张韶涵 8 套，张韶涵搭配猫咪。点击“穿上这套”后保存并返回首页。
- 衣橱同时记住每个人物上次确认的装扮。人物切换和试穿均不会改变当前首页，必须确认穿戴。
- 再次打开音乐人格，原来的选择仍在；即使编号没有改变，也可确认切回。衣橱同理。
- 首页小人、顶部头像、火花卡片与文件名接口统一读取当前使用的形象。昵称与人物名称互不覆盖。

底部确认区的不透明背景覆盖左右边缘、底部安全区和播放器预留区，底层卡片不会透出或被误点，最后一行可滚动到确认区上方。

音乐偏好和陪伴描述是创作的角色设定，未改变聊天模型或推荐接口。沿用现有单用户数据模型，所有访问者读取同一份选择。

## 接口与持久化

- `GET /api/personalities` 返回 `{personalities, groups, profile}`；`POST /api/personality` 接受 `{personalityId:"ENTJ"}`。
- `GET /api/outfits` 返回 `{characters, outfits, profile}`，共两个人物和 14 套装扮。
- `POST /api/outfit` 接受 `{outfitId:"zsh08"}`，返回 `{profile}`。无效编号返回 400，不改变选择。
- `profile.personalityId/personality` 是保存的人格；`profile.outfitId/outfit` 是保存的装扮。
- `profile.appearanceMode` 为 `personality` 或 `outfit`；`profile.appearance` 提供实际用于首页的 `id/name/imageName/imageUrl`。
- `profile.characterOutfitIds` 保存两个人物各自最近确认的装扮编号。
- SQLite `app_meta` 分别保存 `personality_id`、`outfit_id`、`appearance_mode`、`outfit_lyn`、`outfit_zsh`。升级时把原 `outfit_id` 中的 MBTI 迁移到人格选择，并保持原首页形象。昵称、聊天、笔记、收藏和听歌记录保留。
- 文件名接口保持原地址和 `{imageName}` 格式，返回当前实际使用的人格或装扮；详见 [客户端接口](personality-client.md)。确认保存后异步同步到 Sites，失败每 15 秒重试。

## 验证

```sh
npm run build
.venv/bin/python -m unittest discover -s backend -t .
npx playwright test -c playwright.personality.config.ts
npx playwright test -c playwright.fullscreen.config.ts
```

浏览器测试使用独立端口及临时数据库，覆盖 14 套装扮、16 型人格、独立保存与类别切换、每个人物的装扮记忆、预览不保存、确认后首页/头像/火花/接口联动、刷新恢复、失败重试、防重复提交和安全区遮挡。
