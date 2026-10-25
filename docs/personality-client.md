# 客户端人格文件名接口

当前 H5 使用 Tailscale Funnel 公网服务。iOS 原生挂件优先使用 `https://desktop-rjgij1s.tailc7b3e2.ts.net/api/widget/image`，需要同步版本时使用 `/api/widget/appearance`；见 [iOS Widget API](widget-api.md)。下方独立 Sites 为历史同步方式，不代表已同步最新衣橱目录。

公网接口：`https://ike-personality-image-api.dapperaphid7.chatgpt.site/api/personality/image`。

局域网接口：`http://10.230.52.36:5000/api/personality/image`。

两个接口均只返回文件名，不返回人格编号、图片地址或 PNG 内容。客户端按文件名匹配自己的资源。

## 获取当前文件名

`GET /api/personality/image`

成功返回 `200 application/json`：

```json
{ "imageName": "ENTP.png" }
```

`imageName` 为含扩展名的文件名，来自当前首页实际使用的音乐人格或人物装扮。只浏览或试穿不会改变返回值。响应为 `Cache-Control: no-store`。

```sh
curl -A 'AI-mini-Personality/1.0' \
  'https://ike-personality-image-api.dapperaphid7.chatgpt.site/api/personality/image'
```

原生客户端可使用常规应用 User-Agent。联调时 Sites 边缘拦截过 Python urllib 默认标识，应用标识 `AI-mini-Personality/1.0` 实测可访问；本地后端同步已使用该标识。

## 按编号查询

`GET /api/personality/image?personalityId=INFP`

```json
{ "imageName": "INFP.png" }
```

只接受一个有效的大写 MBTI 编号。空值、重复参数、未知编号或小写编号返回 `400` JSON `{error: "错误说明"}`。此查询不修改当前选择。人格图鉴和 `profile.personality` 的 `imageName` 也继续保留，原 H5 使用的图片字段不受影响。

## 按装扮编号查询

`GET /api/personality/image?outfitId=zsh08`

```json
{ "imageName": "zsh08.png" }
```

装扮编号为 `lyn22` 至 `lyn35`（KUGUY）及 `zsh01` 至 `zsh17`（KUGIRL）。文件在本项目 `public/assets/characters/`，客户端需要自行匹配同名资源。人格仍返回 `ENTJ.png` 等 MBTI 文件名。

`personalityId` 与 `outfitId` 只能提供其中一种，重复参数、错用编号类别和未知编号返回 400。带参数仅查询目录，不改变选择。

不带参数时，两类选择各自保留，返回最后确认使用的那一类。例如衣橱确认“薄荷运动”后为 `zsh08.png`，再确认原来的 ENTJ 人格后为 `ENTJ.png`；已保存的装扮仍为 `zsh08`。

## Sites 与本地同步

Sites 查询接口公开只读，无需登录；不托管 PNG，也不上传聊天、日记、收藏等原型数据。Sites D1 仅保存最近同步的当前形象编号及版本，用来解析文件名。首次同步前返回 503，电脑离线时仍返回最后同步成功的选择。

本地 Flask 后端配置 `PERSONALITY_SITE_URL` 为 Sites origin，并通过环境变量 `PERSONALITY_SITE_SYNC_TOKEN` 提供同步密钥：启动时上传当前选择，音乐人格或形象衣橱确认保存后自动同步，失败每 15 秒重试。电脑上的选择和递增版本保存在原 SQLite 数据库中。重启服务也需保留这两个环境变量；未配置时继续本地运行。

云端 `PUT /api/personality/image` 仅供本地服务同步 `{personalityId,revision}`（历史字段名 `personalityId` 在该内部同步协议中也接受装扮编号），必须带服务端鉴权。匿名客户端不能写入；旧版本不能覆盖新版本。云端密钥使用 Sites 运行时 secret `PERSONALITY_SYNC_TOKEN`，不能放入前端、客户端或 Git。

独立 Sites 源码仓库位于 `sites/personality-image-api/`，由 `.openai/hosting.json` 记录站点身份和 DB 绑定。当前仍是单用户原型，各客户端读取同一份选择。

## 命令号通知

本次提供 HTTP 文件名查询与本地到 Sites 的状态同步。项目尚无原生桥接或命令号协议；需客户端提供命令号、消息外层格式、发送方法及可用时机，才能接入主动通知。只预览或保存失败时不应发送切换通知。
