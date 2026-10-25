# 首页资产

## 当前角色：面包体人

用户提供的 16 张 MBTI 角色 PNG 已原样复制到 `public/assets/personalities/<MBTI>.png`，保留透明通道。音乐人格图鉴使用此目录。默认 INFP；首页、顶部头像和火花卡片根据实际使用的类别读取人格或人物装扮图片。

## 当前人物装扮

图片统一位于 `public/assets/characters/`，PNG 原样复制，未重新绘制。`backend/outfits.py` 定义对应编号、名称和图片名。

H5 改用 `thumb-v1/` 的 320px WebP 缩略图与 `web-v1/` 的 768px WebP 预览图，保留透明通道。31 张原 PNG 合计 40,077,032 字节，缩略图合计 549,176 字节（减少 98.6%），预览图合计 2,016,806 字节（减少 95.0%）。卡片按需加载，预览优先加载；图片响应支持缓存与 ETag。PNG 原文件和 `imageName` 保持不变，供原生挂件映射。使用带 Pillow 的 Python 运行 `scripts/optimize_outfits.py` 可重新生成；如改变已发布文件内容，升级目录版本以避免旧缓存。

| 人物 | 文件名 | 来源 |
| --- | --- | --- |
| KUGUY | `lyn22.png` 至 `lyn27.png` | 用户的 `/Users/ikejin/Downloads/换装图鉴/展示图/` 同名原图，6 套 |
| KUGIRL | `zsh01.png` 至 `zsh08.png` | `output/imagegen/angela-zhang/` 中 01 至 08 的生成图，8 套，均为猫咪 |
| KUGUY | `lyn28.png` 至 `lyn35.png` | 用户提供的 `男.zip`，新增 8 套；其中 `6.png` 与已有 `lyn27.png` 完全相同，直接复用 |
| KUGIRL | `zsh09.png` 至 `zsh17.png` | 用户提供的 `女.zip`，按 `1.png` 至 `9.png` 顺序新增 9 套 |

KUGIRL 原有文件依次为：奶白星光、粉紫日常、黑银舞台、墨金国风、樱粉公主、蓝白学院、红金节庆、薄荷运动。项目文件名与接口返回值一致；客户端需使用同名资源。沿用原有编号前缀以兼容已保存的穿戴选择，人物显示名称统一为 KUGUY / KUGIRL。

前三行按用户参考图从左到右、从上到下排列，之后接原有装扮（不再重复“墨金江湖”）：

| 人物 / 行 | 左 | 中 | 右 |
| --- | --- | --- | --- |
| KUGUY / 1 | 黑曜主场 `lyn28`（男 7） | 银翼摇滚 `lyn29`（男 9） | 蓝焰电音 `lyn30`（男 8） |
| KUGUY / 2 | 月白清歌 `lyn31`（男 4） | 金风侠影 `lyn32`（男 5） | 墨金江湖 `lyn27`（男 6，复用） |
| KUGUY / 3 | 暖阳漫步 `lyn33`（男 1） | 暖阳开唱 `lyn34`（男 2） | 金色琴音 `lyn35`（男 3） |
| KUGIRL / 1 | 云朵白裙 `zsh09` | 纯白恋歌 `zsh10` | 月光琴语 `zsh11` |
| KUGIRL / 2 | 晴蓝微风 `zsh12` | 蓝莓甜心 `zsh13` | 绮梦熊语 `zsh14` |
| KUGIRL / 3 | 酷黑假日 `zsh15` | 暗夜主唱 `zsh16` | 绯红电音 `zsh17` |

## 历史换装素材

用户提供的“换装图鉴”已完整复制至 `public/assets/outfits/`，保留 PNG 原图及透明通道。`catalog/` 用于衣橱卡片，`display/` 用于试穿预览和首页，未对素材重绘或修改。

| ID | 装扮 | 原图鉴文件 | 原展示文件 |
| --- | --- | --- | --- |
| cream | 奶油晴天 | 未标题 -1 1.png | 未标题-2.png |
| blue | 蓝调时刻 | 图片 28.png | 图片 23.png |
| cozy | 猫耳假日 | 图片 29.png | 图片 24.png |
| black | 夜色序曲 | 图片 30.png | 图片 25.png |
| red | 心动主场 | 666.png | 图片 26.png |
| royal | 金阙长歌 | 图片 31.png | 图片 27.png |

每组分别命名为 `catalog/<ID>.png`、`display/<ID>.png`。原首页素材 `companion.png` 及旧换装素材保留在项目中，当前衣橱采用新的 `characters/` 目录，不再读取旧的衣橱编号。

## 原有首页素材

使用内置 imagegen 工具，参考用户提供的首页图片，保存于本项目：

- `public/assets/room.png`：移除小人、宠物及所有静态 UI 的房间背景。
- `public/assets/companion.png`：有透明 alpha 通道的小人和宠物图层，CSS 以脚底为轴旋转。
- `public/assets/room-original.png`：去掉 UI 后的完整场景参考。

提示词的核心要求：保留黑发、黄色西装、紫色话筒的小人和灰色雪纳瑞，保持阳光、奶油色房间、蓝天窗景、绿植与唱片机；去除原图状态栏、按钮、文字、气泡及底部卡片。第二次编辑仅移除角色并补齐房间；第三次编辑提取完整小人与宠物为真正透明背景素材。所有可交互文字和按钮均由前端渲染。
