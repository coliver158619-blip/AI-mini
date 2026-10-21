# 首页资产

## 当前角色：面包体人

用户提供的 16 张 MBTI 角色 PNG 已原样复制到 `public/assets/personalities/<MBTI>.png`，保留透明通道。音乐人格图鉴使用此目录。默认 INFP；首页、顶部头像和火花卡片根据实际使用的类别读取人格或人物装扮图片。

## 当前人物装扮

图片统一位于 `public/assets/characters/`，PNG 原样复制，未重新绘制。`backend/outfits.py` 定义对应编号、名称和图片名。

| 人物 | 文件名 | 来源 |
| --- | --- | --- |
| 刘宇宁 | `lyn22.png` 至 `lyn27.png` | 用户的 `/Users/ikejin/Downloads/换装图鉴/展示图/` 同名原图，6 套 |
| 张韶涵 | `zsh01.png` 至 `zsh08.png` | `output/imagegen/angela-zhang/` 中 01 至 08 的生成图，8 套，均为猫咪 |

张韶涵文件依次为：奶白星光、粉紫日常、黑银舞台、墨金国风、樱粉公主、蓝白学院、红金节庆、薄荷运动。项目文件名与接口返回值一致；客户端需使用同名资源。

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
