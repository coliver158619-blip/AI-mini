# Flask + SQLite 音乐陪伴后端

从项目根目录运行：

```powershell
python -m pip install -r requirements.txt
python -m backend.app
```

本地服务默认为 `http://127.0.0.1:5000`。开发时前端 Vite 将 `/api` 代理到本服务；运行 `npm run build` 后 Flask 同时提供 `dist/` 内的 H5 文件。`HOST`、`PORT` 可通过环境变量覆盖。局域网手机访问可设置 `HOST=0.0.0.0`，浏览器定位通常需要 HTTPS；无法定位时可手动搜索城市。

## 数据与示例

默认数据库为 `backend/data/companion.sqlite3`，可通过 `APP_DATABASE_PATH` 指向其他绝对路径。SQLite 保存用户昵称、陪伴能量、每日喂食、聊天记录、歌曲收藏、每段真实听歌时长、日记手写内容、城市与天气快照；页面刷新和服务重启不会丢失。

首次启动种入 128 天范围内的**示例听歌记录**，每条标记 `is_demo=1`，日记及报告返回 `isDemo` 供界面提示。示例数据只初始化一次。正式使用时，在**新数据库首次启动前**设置 `SEED_DEMO=false`；已有库不会被此选项删除或重置。演示记录和真实播放在统计中同时计入，带示例记录的周期会明确标识。

默认曲库为「陪伴音乐室」8 首原创程序化纯音乐小样，每首 32 秒。`/api/audio/<song-id>.wav` 支持 Range 请求。小样与真实酷狗歌曲分开标识，不会把合成旋律冒充商业歌曲。

`POST /api/play` 只应在音频实际播放后上报**增量**秒数；`sessionId` 用于同一次播放的多段心跳合并计数，`eventId` 用于单个心跳重试去重。报告按已收到的秒数聚合，不按点击播放按钮计算听歌时长。上报只接受 1—3600 秒整数。

这是单用户原型：所有访问者共享该数据库内的同一个用户。面向公开多用户部署前，需要增加认证和用户数据隔离。

## 公共天气接口

天气与城市搜索使用 [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) 和 [Weather Forecast API](https://open-meteo.com/en/docs)，无需密钥。位置由用户点击定位或手动城市选择后提交；页面不会后台获取位置。GPS 坐标没有附带城市名称时显示「你所在的位置」，不会伪造城市。

- `GET /api/location/search?q=广州`：返回 `{results:[{id,name,city,country,admin1,latitude,longitude}]}`。
- `POST /api/weather`，JSON `{latitude,longitude,city}`：返回 `{city,condition,temperature,code,greeting,updatedAt,latitude,longitude,severe,windSpeed,precipitation,source,cached}`。
- 天气按日期保存到 `weather_snapshots`。每日可保存多条快照，日记会总结当天已记录的晴雨情况；并不声称代表当天所有小时。
- 网络失败且存在相同坐标附近的历史结果时返回 `cached=true` 与 `notice`；完全没有可用结果时返回 503，不生成假天气。
- API 名称与来源在界面显示。商业上线前请按 Open-Meteo 许可及服务计划使用。

## 真实酷狗对话

默认自动读取本机接口配置。优先级为 `PET_CHAT_CONFIG_PATH` 环境变量、`backend/data/chat-config-path.txt` 中记录的原脚本路径、桌面 `kugou-pet-chat` 目录。文件只做 AST 字面量解析，不执行脚本；密钥不会复制到前端、数据库或仓库。

新提供的 `test.py` 对接 `/v2/assistant/stream`，默认使用已实测可用的线上配置（`PET_CHAT_ENV=prod`）。测试环境可设置 `PET_CHAT_ENV=test`，当前原脚本的测试配置返回时间/签名校验错误。旧目录的 `/v1/pet_chat/completions` 协议仍兼容。

聊天从 SQLite 读取最近 10 条真实对话作为上下文，并附带用户已分享的城市与天气。会话标识、回复和推荐歌曲持久保存，刷新或重启后继续对话。只有设置 `PET_CHAT_MODE=local` 才启用本地演示规则；远程连接、鉴权或签名失败时返回 503 和脱敏原因，不伪造回复。

`/api/bootstrap` 与 `/api/health` 返回 `integration` 连接状态；`/api/chat` 返回真实 `source=kugou`、正文、歌曲和后续话题。仅展示 SSE 的 `[TEXT]` 正文，内部思考事件不展示。推荐接口只提供歌曲元数据，当前未返回可播放音源；此类歌曲不会伪装成原创演示音乐播放。

环境变量模板见 `.env.example`，文件本身不会自动加载。原脚本应保留在本机；若移动文件，请更新上述路径引用。

## 主要接口

| 接口 | 作用 |
| --- | --- |
| `GET /api/health` | SQLite 及服务检查 |
| `GET /api/bootstrap` | 用户、歌曲、主动问候、最新天气 |
| `GET /api/location/search?q=广州` | 公共城市搜索，返回可选地点及坐标 |
| `POST /api/weather` | `{latitude,longitude,city?}` 获取坐标天气，未命名城市时反向解析 |
| `POST /api/chat` | `{message,scene?}` 场景及天气推荐，写入聊天历史 |
| `POST /api/recommendations` | `{scene?,message?}` 模型结合心情、已选城市坐标及天气生成歌曲卡片，不写聊天历史 |
| `GET /api/recommendations?scene=放松` | 恢复该心情最近一次已保存的推荐及生成时天气 |
| `GET /api/recommendations/hourly` | 首页最近单曲、下次推荐时间和生成状态 |
| `POST /api/recommendations/hourly` | 到期才向模型请求一首歌，未到期返回已存状态 |
| `GET /api/messages` | 最近 80 条聊天消息 |
| `POST /api/play` | `{songId,seconds,sessionId?,eventId?}` 保存真实播放增量 |
| `GET /api/diary` | 每日日记，日期倒序 |
| `PUT /api/diary/YYYY-MM-DD` | `{note}` 保存不超过 4000 字的随手记 |
| `GET /api/reports?period=week&offset=0` | 周/月/年聚合；`offset=-1` 为上期 |
| `POST /api/favorites` | `{songId,favorite?}` 收藏或取消；不传布尔值则切换 |
| `POST /api/profile` | `{name}` 改名，1—16 字 |
| `POST /api/feed` | 每日一次增加 40 能量 |

所有日期按 UTC+8 归档。周周期为周一至周日，月和年为自然周期。听歌指数为「活跃天数 / 周期已过天数」；月趋势含最近 6 月，年趋势含最近 5 年。没有记录的周期返回零与空列表，不补写虚拟数据。

## 验证

```powershell
python -m unittest backend.test_app backend.test_data_chain backend.test_kugou backend.test_recommendations backend.test_weather_details backend.test_hourly_recommendations -v
```

测试在临时目录创建数据库，覆盖重启持久化、示例初始化幂等、真实播放累积、报告周期边界、会话与重试去重、输入校验、天气失败与缓存、天气日记、真实聊天上下文、上游错误无假回复、SSE 提取以及音频 Range 响应。外部接口在单元测试中 mock，不需要密钥或网络。

手动验证真实公共天气及酷狗多轮对话（会调用外部服务，仅使用临时数据库，不写入日常预览数据）：

```powershell
python -m backend.probe_live
```

心情选歌和为你推荐只使用模型返回的 `9012` 歌曲卡片，不返回聊天正文或本地演示歌曲。新推荐前会按用户已保存的坐标刷新超过一小时的天气；刷新失败时明确传入缓存标记和原始时间，位置未分享则传入 `null`，不推测位置。结果及输入天气保存在 SQLite 的 `recommendation_requests` 表，歌曲进入共用曲库，可继续收藏。`PET_CHAT_MODE=local` 或模型未配置时该接口返回 503；模型未生成有效歌曲时返回 502。`POST /api/weather` 只提供真实天气，不再附带演示歌曲。

真实卡片联调（临时数据库，使用广州作为测试选址，不更改用户位置和历史）：`python -m backend.probe_recommendations`。

天气详情字段来自 Open-Meteo：`isDay`、`feelsLike`、`humidity`、当天 `high/low`、`windSpeed`、`precipitation`、`weatherTime`、`timezone`。缺失或无效的可选数值不返回，旧 SQLite 快照无需迁移。GPS 未命名坐标通过 [Photon](https://github.com/komoot/photon#demo-server) 反查城市，6 秒超时、最多每秒一次、坐标结果缓存 24 小时且最多 128 条；可用 `PHOTON_REVERSE_URL` 配置独立服务。反查失败只提示城市未识别，不影响按真实坐标查询天气。
