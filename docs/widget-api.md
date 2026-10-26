# iOS 原生挂件与 Widget 图片名 API

当前公网根地址：`https://desktop-rjgij1s.tailc7b3e2.ts.net`。接口已在本项目 Flask 后端实现，和 H5 使用同一昵称账户的数据，不依赖旧 Sites 同步。电脑和 Tailscale 服务需要保持运行。

## 登录 Cookie 与缓存（客户端必须处理）

启用昵称账户后，两个 Widget 接口都需要有效的 `music_room_session` Cookie。无需密码，但不能匿名读取某个用户的形象，也不能用 `userId` 代替 Cookie。旧版“所有设备共用一份选择、无需登录”的说明已失效。

- 浏览器：在同一个浏览器、同一个 HTTPS 域名的首页输入昵称，再打开接口。可用 `GET /api/auth/session` 检查：`user` 为对象表示该请求已登录，`user: null` 表示未登录或会话失效。完成引导后的 `profile: null` 是正常返回，不代表未登录。
- iOS 原生：可通过 `POST /api/auth/login`（已有昵称只需 `{"nickname":"你的昵称"}`）建立自己的会话，接收响应的 `Set-Cookie`，后续请求使用同一个 URLSession Cookie 存储。第一次注册还需 `gender: "male"` 或 `"female"`。
- WKWebView：网页登录不会自动把 Cookie 交给另一个 URLSession 或 Widget。使用下方示例从**实际显示登录页面的 WKWebView**读取 Cookie；HttpOnly Cookie 不能通过 `document.cookie` 获取。
- 接口返回 `Cache-Control: no-store`。原生端仍应使用 `.reloadIgnoringLocalCacheData`，避免读取历史版本留下的缓存。浏览器若 session 已登录、原地址仍显示 `LOGIN_REQUIRED`，强制刷新接口页面；也可临时添加 `?check=任意新值` 排除旧响应缓存。此参数不参与身份验证或账户选择。
- 只有重新发出的网络请求仍返回 401，才需要重新输入昵称；不要把旧缓存中的 401 当作当前会话失效。不要将 Cookie 放进 URL 或日志。

2026-10-26 联调：公开首页登录、完成引导、新标签打开接口、刷新首页及换装后读取均返回 200。用户原地址显示旧 `LOGIN_REQUIRED`，同浏览器访问带新查询参数的地址返回 `lyn32.png`、revision 1，确认该次浏览器故障与原地址的旧响应有关。

## 只取当前图片名

`GET /api/widget/image`

```json
{ "imageName": "zsh10.png" }
```

返回 `200 application/json`，响应头为 `Cache-Control: no-store`。无需业务参数，需要登录 Cookie。`imageName` 保留大小写和 `.png` 扩展名；H5 压缩使用的 WebP 地址不会影响此字段。该接口不返回图片二进制。

```powershell
$roomOrigin = 'https://desktop-rjgij1s.tailc7b3e2.ts.net'
$roomNickname = Read-Host '输入已经注册的小屋昵称'
$roomLoginBody = @{ nickname = $roomNickname } | ConvertTo-Json
Invoke-RestMethod "$roomOrigin/api/auth/login" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($roomLoginBody)) -SessionVariable roomSession | Out-Null
Invoke-RestMethod "$roomOrigin/api/widget/appearance" -WebSession $roomSession -Headers @{ 'Cache-Control' = 'no-cache' }
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

不对外暴露专辑、能量、聊天和日记内容。接口按 Cookie 对应的昵称账户隔离选择、解锁记录和版本。不同用户的 revision 不能相互比较。注销会撤销当前会话；另一设备独立建立的会话不受影响。

## WKWebView → 原生读取示例（iOS 15+）

登录及换装保存成功后调用。`expectedUserID` 使用当前登录响应的 `user.id`，用于防止切换账号后把另一账号的图片写入旧缓存；它本身不是登录凭证。

```swift
import Foundation
import WebKit

struct WidgetAppearance: Codable {
    let imageName: String
    let appearanceId: String
    let appearanceType: String
    let revision: Int
}

enum AppearanceError: Error {
    case loginRequired, accountChanged, http(Int)
}

@MainActor
func fetchAppearance(from webView: WKWebView, expectedUserID: String) async throws -> WidgetAppearance {
    let url = URL(string: "https://desktop-rjgij1s.tailc7b3e2.ts.net/api/widget/appearance")!
    let cookies = await webView.configuration.websiteDataStore.httpCookieStore.allCookies()
    guard let cookie = cookies.first(where: {
        $0.name == "music_room_session" && $0.domain == url.host! && $0.path == "/"
        && ($0.expiresDate.map { $0 > Date() } ?? true)
    }) else { throw AppearanceError.loginRequired }

    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    request.allHTTPHeaderFields = HTTPCookie.requestHeaderFields(with: [cookie])
    request.setValue(expectedUserID, forHTTPHeaderField: "X-Music-User")
    request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
    // Explicitly use this WebView's cookie, never another account's ambient cookie jar.
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false
    config.urlCache = nil
    let session = URLSession(configuration: config)
    defer { session.finishTasksAndInvalidate() }
    let (data, response) = try await session.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 { throw AppearanceError.loginRequired }
    if status == 409 { throw AppearanceError.accountChanged }
    guard status == 200 else { throw AppearanceError.http(status) }
    return try JSONDecoder().decode(WidgetAppearance.self, from: data)
}
```

Cookie 读取方式参见 [Apple：WKHTTPCookieStore.getAllCookies](https://developer.apple.com/documentation/webkit/wkhttpcookiestore/getallcookies(_:))，请求头转换参见 [Apple：HTTPCookieStorage.cookies(for:)](https://developer.apple.com/documentation/foundation/httpcookiestorage/cookies(for:))。收到结果后再次确认当前账户仍为 `expectedUserID`，再写入该账户的共享缓存，避免异步请求跨越退出或切换账户。

## 原生资源映射

- KUGUY：`lyn22.png` 至 `lyn35.png`，KUGIRL：`zsh01.png` 至 `zsh17.png`。
- 音乐人格：16 个 MBTI 文件，如 `INFP.png`、`ENTJ.png`。
- 原 PNG 保存在 `public/assets/characters/` 和 `public/assets/personalities/`，应同时加入主 App 和 Widget Extension 的资源目标；可用 `/api/outfits`、`/api/personalities` 的 `imageName` 核对完整目录。
- 如果采用 Asset Catalog，使用去除 `.png` 后的资源名，例如响应 `zsh10.png` 对应 `Image("zsh10")`；如果直接打包文件，按完整文件名查找。
- 遇到客户端缺少的新图片名或网络失败，保留最后成功显示的形象，不把现有图片清空。动态下载方案需由客户端另行实现；原图 GET 路径为 `/assets/characters/zsh10.png`，音乐人格为 `/assets/personalities/INFP.png`。

## 主 App 与 Widget 的同步流程

1. 主 App 打开、回到前台或得知 H5 保存成功后，携带当前会话 Cookie，以绕过缓存的策略请求 `/api/widget/appearance`。
2. 将解码后的整个响应缓存到 App 和 Widget 共用的 App Group 存储。发现较新的 revision 时更新；切换账户或服务地址时使用独立缓存。网络失败保留原记录。
3. 原生挂件按 `imageName` 更新本地图片。主 App 写入共享缓存后调用 `WidgetCenter.shared.reloadTimelines(ofKind: 实际WidgetKind)` 请求刷新。
4. Widget 的 TimelineProvider 读取共享缓存构造条目；初次安装无缓存时使用默认 `INFP.png`。Widget 不会自动继承主 App/WKWebView 的 Cookie，建议由主 App 拉取并缓存形象。若扩展要独立请求接口，需另外实现会话共享，不能只请求裸 URL。不要依赖持续后台轮询。
5. 退出或切换账户时清除当前显示缓存并请求 Widget 刷新，不能继续展示上一用户的图片。App Group 中只缓存形象响应和所属账户，不存储明文会话 Cookie。

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
