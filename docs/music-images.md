# 音乐形象与日记字体

音乐形象按照用户提供的 4 × 4 角色图排列，曲风文案集中在 `src/music-images.ts`。界面不再展示 MBTI 类型或性格维度。数据库和原生图片查询接口继续沿用原有 ID 与 PNG 文件名，用户已有选择与衣橱装扮不会丢失。API 响应在前端统一映射到新形象文案，首页、更多玩法、形象选择、聊天头像使用同一映射。

| 行 | 从左到右的曲风（保留 ID） |
|---|---|
| 1 | 灵魂乐 ENFJ、独立民谣 ENFP、摇滚 ENTJ、R&B ENTP |
| 2 | 甜系流行 ESFJ、流行舞曲 ESFP、古典 ESTJ、Hip-Hop ESTP |
| 3 | Lo-fi INFJ、梦幻流行 INFP、电子 INTJ、爵士 INTP |
| 4 | 轻音乐 ISFJ、独立流行 ISFP、氛围音乐 ISTJ、原声民谣 ISTP |

基于用户原图使用内置 image_gen 准备透明背景角色图集，再将各格导出为独立资源。网页资源位于 `public/assets/music-images/*.webp`，原生兼容资源位于 `public/assets/personalities/*.png`。完整图集与提示词分别保存在 `output/music-images-transparent-source.png`、`output/music-images-prompt.txt`，未使用外部生成 API。

提示要求：仅移除白色背景，保留全部 16 个角色的顺序、服装、头发、配件、颜色、全身比例和四行四列排列；透明底、清晰间隔，不增加角色、文字、描边或光效。

用户提供的《默陌硬笔手写体粗》原始字体保存在 `public/assets/fonts/momo-handwritten-bold.ttf`；同字形 WOFF2 位于同目录，保留全部 7545 个映射字符。仅日记及共享日记使用，字体加载期间显示系统字体，不阻塞正文。原始字体约 8.76 MB，WOFF2 约 4.62 MB。
