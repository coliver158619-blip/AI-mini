# 前后端分离与数据联动

当前已按职责分离：`src/` 是 React + TypeScript 前端，`backend/` 是 Python Flask JSON API，SQLite 是持久化数据源。前端没有直接访问数据库，也没有在页面内写死报告趋势数据。

数据链为：音频实际播放 → 前端累计播放秒数 → `POST /api/play` → SQLite `plays` → `GET /api/reports` → 前端绘制报告。日记、聊天、收藏、昵称与天气也通过各自 `/api` 接口读写。

- `src/App.tsx` 每 15 秒及暂停/切歌时上报实际播放增量；失败记录暂存浏览器队列待重试。`eventId` 防止重复写入，`sessionId` 将一次播放的多段增量合并计次。
- `backend/app.py` 的 `plays_between()` 按日期查询 SQLite，`report_data()` 将秒数汇总为分钟。月报近 6 月、年报近 5 年的 `trend` 均从数据库计算。
- `src/Reports.tsx` 请求 `/api/reports?period=month|year|week&offset=...`，使用返回的 `trend`、`daily` 和 `summary` 绘图。表情和颜色只是展示映射，折线的统计指标仍是听歌时长，不代表对用户心理状态的测量。
- 初始化演示记录同样存入数据库并标记 `is_demo=1`。真实播放继续累计，包含演示记录的报告带 `isDemo` 提示。新数据库启动前设置 `SEED_DEMO=false` 可以从零开始。

## 真实聊天与持久化上下文

聊天默认自动连接真实接口。后端支持新版 `test.py` 使用的 `/v2/assistant/stream`，默认选择线上 `prod` 地址；该配置已实测收到真实回复。原 `kugou-pet-chat` 目录的 v1 协议继续兼容，接口差异由后端适配，前端仍调用项目自己的 `/api`。

本机配置入口是 `backend/data/chat-config-path.txt`，文件只引用原脚本的本机路径。后端只读解析原脚本中的配置常量，不执行原脚本，也不把凭据复制进仓库。`PET_CHAT_CONFIG_PATH` 可以覆盖引用路径；`PET_CHAT_ENV=test` 可以选择测试地址，未设置时默认使用 `prod`。部署到其他机器时，应将引用指向该机器可读的原脚本。

SQLite 持久化聊天消息与多轮上下文，后续请求使用已保存的会话记录，页面刷新及后端重启后仍可继续聊天。远程失败会向前端返回错误，不自动切换成演示回复。只有显式设置 `PET_CHAT_MODE=local` 才使用本地场景规则演示；这是测试或离线体验的独立选择。

## 日记的页面交互

`src/Diary.tsx` 从 `GET /api/diary` 读取每天的记录，默认打开最新一篇；笔记通过 `PUT /api/diary/<date>` 保存到 SQLite。用户轻点纸页右半部分翻看更早日记，轻点左半部分返回较新日记，页面不再提供独立的前后翻页按钮。左右方向键对应点击方向，左划翻看更早日记、右划返回较新日记，均保留纸页的 3D 翻转动画。

编辑控件、文字选择和拖动不会触发点页翻阅，滑动结束后的合成点击也不会重复翻页。页角提示可翻方向，首尾页与只有一篇日记时显示对应说明；日期选择和日记语音播报仍可独立使用。

## 两种运行方式

开发时前后端是两个独立进程：

```powershell
# 终端一：Flask API，默认 5000 端口
$env:PYTHONPATH = "$PWD\.python-deps" # 工作区已安装的依赖；常规 pip 安装后可省略
python -m backend.app
```

```powershell
# 终端二：Vite 前端，默认 5173 端口
npm run dev
```

浏览器访问 `http://localhost:5173`，`vite.config.ts` 将 `/api` 转发到 `http://127.0.0.1:5000`。前端页面与 Python API 可以分别修改、启动和验证。

交付预览时运行 `npm run build`，再由 Flask 提供 `dist/` 静态文件，访问 `http://127.0.0.1:5000`。这是便于启动的同源静态托管；页面依然用 HTTP JSON API 交互，不是 Flask 服务端模板渲染。

若独立部署静态前端与 API，静态服务需将同域 `/api/` 反向代理到 Flask 服务，并让其他页面路径回退到 `index.html`。当前相对路径接口与音频地址无需修改。项目没有自动配置跨域 API 域名或 CORS；仅将 `dist/` 放到不含 `/api` 代理的静态站点会缺少数据服务。此项目无需为逻辑分离额外引入跨域中间件或 ORM。

## 验证证据

```powershell
$env:PYTHONPATH = "$PWD\.python-deps"
python -m unittest backend.test_app backend.test_data_chain backend.test_kugou -v
```

`backend/test_data_chain.py` 在独立临时 SQLite 上启动真实本地 HTTP 服务，不修改用户数据库，也不 mock 报告接口：

1. 新库月趋势 6 个值全部为 0。
2. 经 HTTP 上报同一播放会话的 120 秒和 60 秒，并重复发送首条事件。
3. 直接查询 SQLite 得到 2 行、180 秒、1 次会话；重复事件没有增加数据。
4. 月报当月趋势和年报当年趋势变为 3 分钟，上月仍为 0。
5. 关闭后端、用同一数据库重建应用与 HTTP 服务，趋势和日记仍为 3 分钟。

其余后端测试覆盖请求校验、聊天/收藏/日记持久化、周期边界、天气缓存及外部服务失败反馈；聊天远程失败直接报错，不返回演示内容。当前是单用户原型；多用户账号隔离与公网正式部署配置不在这次 H5 原型的实现范围内。

## 独立端口的浏览器联调

`vite.config.ts` 支持通过环境变量或 `.env` 的 `API_PROXY_TARGET` 指定后端地址；没有配置时使用 `http://127.0.0.1:5000`。开发服务与 `vite preview` 使用同一代理规则。例如：

```powershell
$env:API_PROXY_TARGET = 'http://127.0.0.1:5001'
npm run dev -- --port 5175 --strictPort
```

下面的独立测试配置自动启动两个进程：Flask API 使用 `5001`，Vite 开发服务使用 `5175`，浏览器访问 Vite，所有 `/api` 请求再转发给 Flask：

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.split.config.ts
```

每次测试都创建独立临时 SQLite，显式设置 `PET_CHAT_MODE=local` 使用演示聊天，并禁止复用已有服务器，因此不会调用线上聊天接口或读写日常预览数据库。配置运行现有 `tests/app.spec.ts`，涵盖首页互动、聊天、日记保存与点页翻阅、周月年报告、天气失败反馈和实际音频播放统计。端口冲突时，可在命令前设置 `$env:SPLIT_FRONTEND_PORT = '5176'`；后端仍使用 `5001`。请保留已占用端口上的其他项目服务。

2026-09-23 验证结果：前端构建成功；24 项后端测试通过；Vite 5175 → Flask 5001 → 独立 SQLite 的 7 项浏览器测试全部通过。报告测试读取真实接口的趋势数据，对照节点数量、最高点表情、颜色饱和度、点击和键盘选择后的时长，同时验证月报和年报切换。手机截图见 `docs/preview-report-month.png`。

另外使用临时数据库实测了新版线上接口：公共城市搜索及实时天气成功，多轮对话在重建 Flask 应用后仍能记住约定称呼，天气相关推荐返回真实歌曲；手机浏览器真实发送、收到 `source=kugou`、刷新恢复对话均成功，无页面错误或横向溢出。详情见 [integration-check.md](integration-check.md)。
