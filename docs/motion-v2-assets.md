# 完整人物逐帧动作素材

当前首页和陪伴空间使用 v2 完整人物帧。`src/character-frames.ts` 逐帧裁切，按原形象的可见高度、中心和脚底位置对齐，静止与动作统一将素材宽度收窄 10%，保持高度不变，短时混合相邻完整帧；不再使用局部手臂拼接或关节变形。统一固定画布，避免边缘露出相邻角色。素材就绪后静止和动作使用同套帧，加载失败显示衣橱原图。

使用内置 `image_gen`，基于第一版男女角色动作图编辑，保留形象、衣服及男生身旁的小狗。没有使用外部 API 或 CLI。

- 男生：`public/assets/character-motion/lyn22-v2.webp`，409,748 字节。
- 女生：`public/assets/character-motion/zsh09-v2.webp`，352,024 字节。
- 原始透明 PNG 保留在本地 `output/lyn22-motion-v2-source.png`、`output/zsh09-motion-v2-source.png`。
- 生成后只做 WebP 格式压缩，显示时根据每个人物的实际边界裁剪。原始图的排列并非严格等距，因此不再假设等分格子。

初始提示要求：透明背景，4 列 4 行共 16 个全身动作，同一角色、固定头部/躯干/双脚位置。顺序为站立、半闭眼、闭眼、半睁眼、站立、半闭单眼、wink、半睁单眼、手臂抬起 20 度、手到胸前、掌心略低于肩膀、掌心肩膀齐平、手腕向内、手腕向外、收手一半、站立。保留原衣服、发型、配件、小狗及透明背景；不要文字或网格线。

最后一轮编辑提示词（两套素材相同）：

> Edit this character animation atlas. Preserve all 16 poses and the character identity, clothing, expressions, pet if present. Fix its critical layout problem: characters currently touch neighboring rows. Produce a SQUARE 4-column by 4-row sprite atlas, evenly spaced identical square cells. Each FULL BODY character occupies ONLY 70% of its cell height, with a MINIMUM 15% cell-height EMPTY transparent margin above its hair and below its feet. All shoes and entire pet must be visible. Significant transparent gutters in BOTH directions. All 16 characters must have identical scale and alignment relative to their individual cell. No colored flecks, NO red or yellow fringe artifacts, clean transparent alpha edges. Nothing may cross the cell boundaries. 2048x2048. Keep poses in exact existing order. TRUE transparent background.

输出实际为 1254 × 1254，采用测量边界实现独立裁剪，不依赖提示中的尺寸。男生第 9 帧因眼神变化，播放时使用第 14 帧的中间收手姿态；眨眼/单眼半闭姿态复用第 3/7 帧，避免突然闭眼。

动作时间以首次 requestAnimationFrame 的时间戳为起点；绘制进度限制在有效范围。绘制失败时恢复原图，避免点击后画布空白。

## 全衣橱扩展（2026-10-25）

31 套装扮共用完整帧播放组件。已确认的 lyn22、zsh09 两套素材和 0.9 宽度系数保持原样；新增 29 套独立动作图放在 `public/assets/outfit-motion/`，每套 16 帧。首页与陪伴空间均根据当前装扮 ID 加载对应图集，只加载正在显示的人物。

基于每套衣橱原图通过内置 image_gen 生成，保留衣服、发型、乐器、饰品和宠物。统一要求透明背景、4 × 4 排列、完整人物、抬手到肩旁打招呼、双眼眨眼和单眼 wink；非挥手的手保留原有持物姿态。完整基础提示词保存在 `output/all-outfit-motion-prompt.txt`，原始生成路径在 `output/motion-source-paths.json`，原 PNG 副本在 `output/motion-all-sources/`。

`scripts/register_character_motion.py` 测量透明边界、头部中心并转换 WebP，不编辑角色像素。少数生成帧切换挥手方向或表情不正确，在 POSE_MAPS 中复用同套图集的完整正确姿态，最后一帧统一回到初始姿态。所有帧按相同可见高度绘制，身体不随手势宽度变化而整体缩放。

推荐页的六格装饰封面保存在 `public/assets/recommendation-art.webp`，通过内置 image_gen 生成粉紫晚霞、蓝色海浪、粉色花朵、窗边光影、月亮云层和浅色冰川。作为界面装饰封面使用，不声称是对应歌曲的官方唱片封面。
