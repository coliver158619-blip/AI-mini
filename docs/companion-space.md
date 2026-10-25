# 陪伴空间与一起听入口

首页「听歌续火花」面板中，「进入陪伴空间」位于「分享火花」左侧。火花卡片与陪伴空间共用男女双人形象，分别读取 `profile.characterOutfitIds.lyn` 与 `.zsh` 最近确认的装扮，默认 `lyn28`、`zsh09`。中间的粉色爱心持续跳动；系统开启减少动画时停止。衣橱锁图标居中，使用白色锁体与蓝紫粉渐变的玻璃光晕，不加硬边框。

陪伴空间与首页沿用原有房间背景，展示双人形象、陪伴天数、连续听歌与能量，右侧增加「共享日记」「一起听歌单」。男女按不透明轮廓归一到相同高度和脚底基线，不受素材透明留白影响。当前沿用单用户原型的数据，不引入情侣账号绑定或双用户同步。

## 点击动作

当前仅为男生「奶油晴天」`lyn22` 和女生「云朵白裙」`zsh09` 提供随机招手、眨眼、wink。使用 `src/character-frames.ts` 播放完整人物帧，统一人物可见高度、脚底和画布，静止与动作统一将素材宽度收窄 10%，高度和中心锚点保持不变，限制每帧的精确裁切范围。完整身体随姿势配合，不做局部手臂拉伸。静止与动作使用同套帧，原衣橱图作为加载或画布失败时的后备；其他装扮保持静态，Widget 图片名与接口不变。素材来源见 `motion-v2-assets.md`。

招手约 2.24 秒、眨眼 400 ms、wink 650 ms。连续点击不打断动作。切换到后台时停止播放；减少动态效果时不启动动作。旧局部动作代码和素材保留历史兼容，但当前页面不导入。

首页人物尺寸独立于对话文字。气泡按内容变宽、完整换行，无内部滚动和省略；手机始终居中竖排，仅宽度至少 700px 的短横屏采用旁置对话。陪伴空间双人等高，共享日记和一起听歌单复用首页按钮样式，相伴天数位于标题下方。

`src/theme.css` 仅作用于三张参考图对应的衣橱、心情选歌、为你推荐页面及衣橱解锁弹窗。首页、陪伴空间、更多玩法及原有图标保持旧视觉。首页火花数字和人物下方天数均读取 `profile.days`；真实连续听歌记录仍保留原字段 `profile.streak`。

## 共享日记

共享日记沿用纸页视觉，独立保存在 `shared_diary` 表；原有个人日记不变。可以选择今天或历史日期，编辑共同经历（最多 3000 字）和正文（最多 5000 字），手动保存，或先保存素材再请求真实 AI 总结。生成依据仅包含用户输入的共同经历及当天真实的一起听记录，不读取个人聊天或个人日记。AI 失败不会清空已有内容。模型正文可继续手动修改。

未保存输入暂存在当前浏览器，点击「保存日记」写入 SQLite。接口使用 `revision` 检查并发编辑，旧版本及慢返回的模型结果不能覆盖新版本。

| 接口 | 请求与返回 |
| --- | --- |
| `GET /api/shared-diary` | `{today, entries:[{date,note,body,source,revision,updatedAt}]}`，包含今日空页，日期倒序 |
| `PUT /api/shared-diary/YYYY-MM-DD` | `{note,body,revision}`，返回 `{entry}`；首次保存 revision 为 0，版本冲突返回 409 |
| `POST /api/shared-diary/YYYY-MM-DD/story` | `{revision}`，使用已保存共同经历生成正文，返回 `{entry}`；AI 未连接或失败返回 503 |

## 一起听歌单

`GET /api/together/playlist` 返回 `{songs}`，包含歌曲元数据及 `seconds`、`playCount`、`lastListenedAt`。按歌曲去重、最近收听倒序，只读取 `context=together` 且非演示的实际播放记录。收藏、普通个人播放、打开一起听入口不会计入。没有记录时展示空状态。

未来一起听页面在实际播放后调用现有 `POST /api/play`，例如：

```json
{"songId":"sunny-window","seconds":15,"context":"together","sessionId":"unique-song-session","eventId":"unique-progress-event"}
```

每个增量事件提供唯一 `eventId`，重试使用同一 ID；同一次歌曲播放复用 `sessionId`，播放新歌曲或切换场景时换新 session。`seconds` 为 1—3600 的实际新增秒数，不得上传累计总时长。`songId` 需已存在于曲库。未传 context 的旧客户端仍记录为个人播放。H5 共同歌单内重播也会标为 together，复用现有音频播放计时及离线重试；没有音源的歌曲显示「暂无可用音源」。

## 一起听接入

点击「一起听」按钮请求 `GET /api/listen-together/entry`。人物点击用于随机动作反馈。请求期间禁用重复点击，10 秒超时后可重试。

尚未配置目标页面时，返回 HTTP 200：

```json
{"available": false, "url": null}
```

页面提示「一起听即将上线，先在这里陪伴彼此吧」，不导航。此项目未实现一起听页面。

后续通过后端环境变量配置目标并重启后端：

```powershell
$env:TOGETHER_LISTEN_URL = 'https://your-domain.example/listen-together'
```

也支持站内路径（例如 `/listen-together`，需先接入对应页面）。配置有效时返回：

```json
{"available": true, "url": "https://your-domain.example/listen-together"}
```

前端通过 `window.location.assign(url)` 导航。目标仅允许 HTTPS 地址或单斜杠开头的站内路径；非法配置返回 503。接口使用 `Cache-Control: no-store`，不修改装扮、Widget 形象或解锁状态。后续原生页若需要自定义 scheme，应接入宿主桥接，不直接把 scheme 填入此配置。

## 验证

`python -m unittest backend.test_listen_together backend.test_shared_space -v` 覆盖接口配置、日记隔离与持久化、历史编辑、AI 失败保留、版本冲突及共同播放去重。`npx playwright test -c playwright.shared-space.config.ts` 覆盖新入口、日记编辑、歌单播放、默认人物动作、等高展示，以及 320px、393px、横屏和桌面布局。实际 iOS 微信与 WKWebView 仍需真机验收。
