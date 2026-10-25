# 音乐形象动作与客户端直达链接

客户端 WebView 或浏览器直接打开：

`https://desktop-rjgij1s.tailc7b3e2.ts.net/#/companion-space`

使用前端 hash 路由，冷启动和刷新均进入陪伴空间；浏览器前后退同步页面。未知页面回到首页。更换部署域名时保留 `/#/companion-space` 即可。

16 个音乐形象使用独立完整人物帧，点击首页人物或音乐形象预览，随机触发招手、眨眼或 wink。共用原装扮动作播放器，保留系统减少动态效果设置、图片加载失败时的静态回退。音乐形象按原图可见高度和头部中心对齐，人物显示尺寸不随对话框或动作变化。

素材来源：`public/assets/music-images/*.webp`。使用内置 imagegen 工具生成；原始输出保存在 `output/music-motion-sources`，调用路径清单在 `output/music-motion-manifest.json`，提示词在 `output/music-motion-prompt.txt`。WebP 图集位于 `public/assets/music-image-motion/`，帧坐标和原图比例配置位于 `src/music-image-motion.json`。

运行 `scripts/register_music_image_motion.py` 测量透明边界和头部中心、编码 WebP 并更新配置。INFP 的 wink 复用第 6 格完整姿态，ESTP 的挥手复用同一侧手的有效完整帧，避免生成帧的手部异常。未修改已有 31 套装扮的比例及素材。

验证：`node node_modules/playwright/cli.js test -c playwright.music-interaction.config.ts`，覆盖 Chromium 与 WebKit 的直达/刷新/前后退、文字颜色、16 个角色三种动作不消失且容器尺寸固定，以及已有形象选择流程。
