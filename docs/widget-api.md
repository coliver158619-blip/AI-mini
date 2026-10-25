# iOS 原生挂件与 Widget 图片名 API

当前公网根地址：`https://desktop-rjgij1s.tailc7b3e2.ts.net`。接口已在本项目 Flask 后端实现，和 H5 使用同一 SQLite 数据库，不依赖旧 Sites 同步。电脑和 Tailscale 服务需要保持运行。

## 只取当前图片名

`GET /api/widget/image`

```json
{ "imageName": "zsh10.png" }
```

返回 `200 application/json`，响应头为 `Cache-Control: no-store`。无需传参数或密码。`imageName` 保留大小写和 `.png` 扩展名；H5 压缩使用的 WebP 地址不会影响此字段。该接口不返回图片二进制。

```powershell
Invoke-RestMethod 'https://desktop-rjgij1s.tailc7b3e2.ts.net/api/widget/image'
```

## 带版本的同步接口（推荐用于原生端）

`GET /api/widget/appearance`

```json
{
  "imageName": "zsh10.png",
  "appearanceId": "zsh10",
  "appearanceType": "outfit",
  "revision": 12
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| imageName | string | 当前首页实际穿戴的 PNG 文件名 |
| appearanceId | string | 装扮编号或大写 MBTI 编号 |
| appearanceType | string | `outfit` 或 `personality` |
| revision | integer | 当前数据库内递增的形象保存版本，重启保留 |

示例中的版本号仅用于说明。只浏览、试穿、解锁或保存失败都不会改变文件名和版本。`POST /api/outfit` 成功确认穿戴，或 `POST /api/personality` 成功切回人格后，两个 Widget GET 接口立即读取已提交的状态。旧接口 `GET /api/personality/image` 继续兼容。

不对外暴露专辑、能量、聊天和日记内容。当前原型没有用户登录和用户参数，所有设备读取同一份选择；接入正式用户系统时，服务端需按认证用户隔离选择、解锁记录和版本，不能直接用任意传入的 userId 取数据。

## 原生资源映射

- KUGUY：`lyn22.png` 至 `lyn35.png`，KUGIRL：`zsh01.png` 至 `zsh17.png`。
- 音乐人格：16 个 MBTI 文件，如 `INFP.png`、`ENTJ.png`。
- 原 PNG 保存在 `public/assets/characters/` 和 `public/assets/personalities/`，应同时加入主 App 和 Widget Extension 的资源目标；可用 `/api/outfits`、`/api/personalities` 的 `imageName` 核对完整目录。
- 如果采用 Asset Catalog，使用去除 `.png` 后的资源名，例如响应 `zsh10.png` 对应 `Image("zsh10")`；如果直接打包文件，按完整文件名查找。
- 遇到客户端缺少的新图片名或网络失败，保留最后成功显示的形象，不把现有图片清空。动态下载方案需由客户端另行实现；原图 GET 路径为 `/assets/characters/zsh10.png`，音乐人格为 `/assets/personalities/INFP.png`。

## 主 App 与 Widget 的同步流程

1. 主 App 打开、回到前台或得知 H5 保存成功后，请求 `/api/widget/appearance`。
2. 将解码后的整个响应缓存到 App 和 Widget 共用的 App Group 存储。发现较新的 revision 时更新；切换账户或服务地址时使用独立缓存。网络失败保留原记录。
3. 原生挂件按 `imageName` 更新本地图片。主 App 写入共享缓存后调用 `WidgetCenter.shared.reloadTimelines(ofKind: 实际WidgetKind)` 请求刷新。
4. Widget 的 TimelineProvider 读取共享缓存构造条目，并可在系统允许刷新时请求接口更新；初次安装无缓存时使用默认 `INFP.png`。不要依赖持续后台轮询。

App Group 配置需同时添加到主 App 和 Widget Extension，参见 [Apple：Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)。Widget 的刷新由系统调度，`reloadTimelines` 是刷新请求，无法保证桌面小组件立即刷新，参见 [Apple：Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)。

当前仓库没有 iOS / Widget 工程。本次已实现服务端接口和 H5 保存联动；原生资源接入、App Group、Widget TimelineProvider 及 WKWebView 保存回调需在客户端工程中实现。外部浏览器中的 H5 不能直接调用另一应用的 WidgetCenter。

## 解锁接口

`GET /api/outfits` 中每套装扮提供 `unlocked` 和 `unlockMethod`（`free` / `energy` / `album`）。

`POST /api/outfit/unlock`，请求体：

```json
{ "outfitId": "zsh10" }
```

成功返回 `outfit`（包含 `unlocked: true`）、`alreadyUnlocked`、`message` 和 `verificationMode: "demo"`。重复请求幂等，不重复创建解锁记录。错误编号/请求体返回 400；接口失败时前端保留锁并允许重试。

按当前确认的演示规则：点击即通过，不扣陪伴能量，不查询专辑购买记录。界面不显示“演示校验”字样；`verificationMode` 仅供接口调用方区分。真实能量门槛和专辑权益尚未接入。解锁本身不穿戴，仍需点击“穿上这套”；绕过前端直接穿戴未解锁装扮会返回 403，`code: "OUTFIT_LOCKED"`。

默认开放六套：`lyn28` 黑曜主场、`lyn31` 月白清歌、`lyn33` 暖阳漫步、`zsh09` 云朵白裙、`zsh12` 晴蓝微风、`zsh15` 酷黑假日。原有 14 套走专辑解锁（包含复用的 `lyn27` 墨金江湖），其余新装扮走能量解锁。历史已穿戴形象不强制替换，再次选用时遵循解锁规则。
