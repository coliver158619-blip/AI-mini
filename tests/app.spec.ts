import { test, expect, type Page } from '@playwright/test';

test('新对话和历史会话切换，保留草稿并在刷新后恢复', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: 'AI聊天', exact: true }).click();
 await page.getByRole('button', { name: '开启新对话', exact: true }).click();
 const input = page.getByRole('textbox', { name: '对搭子说点什么' });
 await expect(input).toBeEnabled();
 await input.fill('想聊这天的散步');
 await page.getByRole('button', { name: '发送消息', exact: true }).click();
 await expect(page.locator('.typing-dots')).toHaveCount(0);
 await expect(page.locator('.chat-message.user')).toHaveText('想聊这天的散步');
 await input.fill('这一段还没写完');
 await page.getByRole('button', { name: '开启新对话', exact: true }).click();
 await expect(input).toHaveValue('');
 await expect(page.locator('.chat-message.user')).toHaveCount(0);
 await input.fill('第二段聊明天');
 await page.getByRole('button', { name: '发送消息', exact: true }).click();
 await expect(page.locator('.typing-dots')).toHaveCount(0);
 await page.getByRole('button', { name: '选择历史对话', exact: true }).click();
 const panel = page.getByRole('region', { name: '历史对话', exact: true });
 await expect(panel.getByRole('button', { name: /想聊这天的散步/ })).toBeVisible();
 await expect(panel.getByRole('button', { name: /第二段聊明天/ })).toHaveAttribute('aria-current', 'true');
 await page.screenshot({ path: 'docs/preview-chat-history.png', fullPage: true });
 await panel.getByRole('button', { name: /想聊这天的散步/ }).click();
 await expect(input).toHaveValue('这一段还没写完');
 await expect(page.locator('.chat-message.user')).toHaveText('想聊这天的散步');
 await page.reload();
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: 'AI聊天', exact: true }).click();
 await expect(page.locator('.chat-message.user')).toHaveText('想聊这天的散步');
 await page.setViewportSize({ width: 320, height: 568 });
 expect(await page.locator('.chat-session-actions').evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('日记自动写专属回忆，保存新心情后更新，失败保留原文并可重试', async ({ page }) => {
 const memory = '那首《月亮来信》陪你放慢了脚步，你又告诉我项目终于完成了。今天，我们把这份终于能够松口气的快乐，留在这一页。';
 const updated = '想念朋友的此刻，那首《月亮来信》有了新的分量。我会陪你收好这份惦念，让这一页记住那些认真在意过的人。';
 let entry = { date: '2026-10-08', title: '今天的音乐记忆', body: '当天的听歌记录', minutes: 5, songCount: 1, mood: '放松', note: '', topSong: null,
  story: { text: '', updatedAt: null as string | null, stale: true, canGenerate: true, version: 'one' } };
 let attempts = 0;
 await page.route('**/api/diary', route => route.fulfill({ json: { entries: [entry], total: 1 } }));
 await page.route('**/api/diary/2026-10-08', async route => {
  entry = { ...entry, note: route.request().postDataJSON().note, story: { ...entry.story, stale: true, version: 'two' } };
  await route.fulfill({ json: { entry } });
 });
 await page.route('**/api/diary/2026-10-08/story', async route => {
  attempts++;
  if (attempts === 2) { await route.fulfill({ status: 503, json: { error: '专属回忆暂未写好，原有记录已保留。' } }); return; }
  const text = attempts === 1 ? memory : updated;
  entry = { ...entry, body: text, story: { ...entry.story, text, updatedAt: '2026-10-08T12:00:00+08:00', stale: false } };
  await route.fulfill({ json: { entry } });
 });
 await page.goto('/');
 await page.getByRole('button', { name: '日记', exact: true }).click();
 await expect(page.locator('.diary-body')).toHaveText(memory);
 await page.getByLabel('留一句话给今天').fill('现在有一点想念朋友');
 await page.getByRole('button', { name: '保存心情', exact: true }).click();
 await expect(page.getByRole('button', { name: '重试回忆' })).toBeVisible();
 await expect(page.locator('.diary-body')).toHaveText(memory);
 await page.getByRole('button', { name: '重试回忆' }).click();
 await expect(page.locator('.diary-body')).toHaveText(updated);
 await expect(page.getByLabel('留一句话给今天')).toHaveValue('现在有一点想念朋友');
 expect(attempts).toBe(3);
 await page.screenshot({ path: 'docs/preview-diary-memory.png', fullPage: true });
});

const selectedWeather = { city: '广州', condition: '多云', temperature: 26, code: 3, greeting: '今天也有音乐相伴。', updatedAt: new Date().toISOString(), latitude: 23.12, longitude: 113.26, cached: false };
async function modelCardsFixture(page: Page, withWeather = true) {
 const requests: { scene: string; message: string }[] = [];
 if (withWeather) await page.route('**/api/bootstrap', async route => {
  const response = await route.fetch();
  await route.fulfill({ json: { ...await response.json(), weather: selectedWeather } });
 });
 await page.route('**/api/recommendations', async route => {
  requests.push(route.request().postDataJSON());
  const bootstrap = await (await page.request.get('/api/bootstrap')).json();
  await route.fulfill({ json: { source: 'kugou', songs: bootstrap.songs.slice(0, 3).map((song: { title: string }) => ({ ...song, title: `模型推荐·${song.title}`, artist: '接口测试歌手' })), integration: { provider: '酷狗', configured: true, state: 'connected', detail: '已连接' } } });
 });
 return requests;
}


test('首页小人可互动，手机没有横向溢出', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 await page.goto('/');
 await expect(page.getByRole('button', { name: /听歌续火花/ })).toBeVisible();
 await page.getByRole('button', { name: '摸摸小人，听听他的问候' }).click();
 await expect(page.locator('.companion')).toHaveClass(/wiggle/);
 await expect(page.locator('.bubble-copy')).toContainText('被你发现');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
 await page.screenshot({ animations: 'disabled', timeout: 10000, path: 'docs/preview-home.png', fullPage: true });
 await expect(page.locator('.home-content > *')).toHaveCount(2);
 await page.getByRole('button', { name: '热门活动', exact: true }).click();
 await expect(page.getByRole('heading', { name: '运营活动', exact: true })).toBeInViewport();
 await page.getByRole('button', { name: '返回首页', exact: true }).click();
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await expect(page.getByRole('heading', { name: '更多玩法' })).toBeVisible();
 await expect(page.getByRole('button', { name: 'AI聊天', exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
 await page.screenshot({ animations: 'disabled', timeout: 10000, path: 'docs/preview-more.png', fullPage: true });
 await page.getByRole('button', { name: '返回首页', exact: true }).click();
 await expect(page.locator('.energy-card')).toBeVisible();
 expect(errors).toEqual([]);
});

test('小人每小时主动推荐一首歌，刷新不重复，离开首页暂缓触发', async ({ page }) => {
 const start = new Date('2026-10-01T12:00:00+08:00');
 await page.clock.install({ time: start });
 await page.clock.pauseAt(new Date(start.getTime() + 1000));
 await page.route('**/api/bootstrap', async route => { const data = await (await route.fetch()).json(); await route.fulfill({ json: { ...data, weather: null, mode: 'kugou', integration: { provider: '酷狗', configured: true, state: 'connected', detail: '已连接' } } }); });
 let generated = 0;
 let hourly: { songs: { id: string; title: string; artist: string; color: string; tags: string[] }[]; source: string; createdAt: string | null; nextAt: string | null; pending: boolean } = { songs: [], source: 'kugou', createdAt: null, nextAt: null, pending: false };
 await page.route('**/api/recommendations/hourly', async route => {
  if (route.request().method() === 'POST') {
   generated++;
   const now = await page.evaluate(() => Date.now());
   hourly = { songs: [{ id: `hourly-${generated}`, title: `第${generated}小时的歌`, artist: '模型推荐歌手', color: '#d5bc76', tags: [] }], source: 'kugou', createdAt: new Date(now).toISOString(), nextAt: new Date(now + 3600000).toISOString(), pending: false };
  }
  await route.fulfill({ json: hourly });
 });
 await page.goto('/'); await page.getByRole('button', { name: '更多玩法', exact: true }).waitFor();
 await page.clock.runFor(500);
 await expect(page.locator('.hourly-song')).toContainText('第1小时的歌');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(generated).toBe(1);
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-hourly-recommendation.png', fullPage: true });
 await page.reload(); await page.getByRole('button', { name: '更多玩法', exact: true }).waitFor();
 await page.clock.runFor(500);
 await expect(page.locator('.hourly-song')).toContainText('第1小时的歌');
 expect(generated).toBe(1);
 await page.clock.fastForward(3590000);
 expect(generated).toBe(1);
 await page.clock.fastForward(11000);
 await expect(page.locator('.hourly-song')).toContainText('第2小时的歌');
 expect(generated).toBe(2);
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.clock.fastForward(3601000);
 expect(generated).toBe(2);
 await page.getByRole('button', { name: '返回首页', exact: true }).click();
 await page.clock.runFor(500);
 await expect(page.locator('.hourly-song')).toContainText('第3小时的歌');
 expect(generated).toBe(3);
});

test('心情选歌生成卡片且不进入聊天，收藏刷新后保留', async ({ page, request }) => {
 const calls = await modelCardsFixture(page);
 const beforeMessages = (await (await request.get('/api/messages')).json()).messages.length;
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '心情选歌', exact: true }).click();
 await page.getByRole('button', { name: '有点难过', exact: true }).click();
 await expect(page.locator('.recommendation-song')).toHaveCount(3);
 expect(calls[0].scene).toBe('有点难过');
 await expect(page.locator('.chat-sheet')).toHaveCount(0);
 await expect(page.locator('.sheet-backdrop')).toHaveCount(0);
 expect((await (await request.get('/api/messages')).json()).messages.length).toBe(beforeMessages);
 const heart = page.locator('.recommendation-song-actions button').first();
 const before = await heart.getAttribute('aria-label');
 await heart.click();
 await expect(heart).not.toHaveAttribute('aria-label', before!);
 const after = await heart.getAttribute('aria-label');
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-mood.png', fullPage: true });
 await page.reload();
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '为你推荐', exact: true }).click();
 await expect(page.locator('.recommendation-song')).toHaveCount(3);
 await expect(page.locator('.recommendation-song-actions button').first()).toHaveAttribute('aria-label', after!);
 const count = calls.length;
 await page.getByRole('button', { name: '换一换', exact: true }).click();
 await expect.poll(() => calls.length).toBe(count + 1);
 await expect(page.locator('.recommendation-song')).toHaveCount(3);
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-recommendations.png', fullPage: true });
 expect(await page.locator('.recommendation-page').evaluate(el => el.getBoundingClientRect().width)).toBe(390);
});

test('日记编辑持久化，轻点纸页自然翻阅', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button', { name: '日记', exact: true }).click();
 const note = page.getByPlaceholder('此刻的心情，或一件值得记住的小事…');
 const paper = page.locator('.diary-paper');
 await expect(paper).toBeVisible();
 const latestDate = (await paper.getAttribute('aria-label'))!;
 await note.fill('今天的旋律很温柔，记住这份小小的开心。');
 await page.getByRole('button', { name: '保存心情' }).click();
 await expect(page.getByRole('button', { name: '已保存' })).toBeVisible();
 await expect(paper).toHaveAttribute('aria-label', latestDate);
 await expect(page.getByRole('button', { name: /上一篇|下一篇/ })).toHaveCount(0);
 const width = (await paper.boundingBox())!.width;
 await paper.click({ position: { x: width * .8, y: 14 } });
 await expect(page.locator('.diary-book')).toHaveClass(/diary-is-turning/);
 await expect(paper).not.toHaveAttribute('aria-label', latestDate);
 await expect(page.locator('.diary-book')).not.toHaveClass(/diary-is-turning/);
 await paper.click({ position: { x: width * .2, y: 14 } });
 await expect(page.locator('.diary-book')).toHaveClass(/diary-is-turning/);
 await expect(paper).toHaveAttribute('aria-label', latestDate);
 await expect(note).toHaveValue('今天的旋律很温柔，记住这份小小的开心。');
 await page.reload(); await page.getByRole('button', { name: '日记', exact: true }).click();
 await expect(note).toHaveValue('今天的旋律很温柔，记住这份小小的开心。');
 await page.screenshot({ animations: 'disabled', timeout: 10000, path: 'docs/preview-diary.png', fullPage: true });
});

test('周月年报告表情随真实时长变化，支持点击和周期切换', async ({ page, request }) => {
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '音乐报告', exact: true }).click();
 await expect(page.locator('.report-page')).toBeVisible();
 const tabs = page.getByRole('tab');
 await expect(tabs).toHaveCount(3);
 await tabs.nth(1).click(); await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
 await expect(page.locator('.report-loading')).toHaveCount(0);
 const month = await (await request.get('/api/reports?period=month&offset=0')).json();
 const minutes = month.trend.map((point: { minutes: number }) => point.minutes) as number[];
 const low = minutes.indexOf(Math.min(...minutes)), high = minutes.indexOf(Math.max(...minutes));
 const faces = page.locator('.report-trend-point');
 await expect(faces).toHaveCount(month.trend.length);
 await faces.nth(high).click();
 await expect(faces.nth(high)).toHaveAttribute('aria-pressed', 'true');
 await expect(page.locator('.report-trend-caption [role="status"]')).toHaveText(`${month.trend[high].label} · ${Math.round(minutes[high]).toLocaleString('zh-CN')} 分钟`);
 await expect(faces.nth(high)).toHaveAttribute('aria-label', /开怀大笑/);
 const lowFill = await faces.nth(low).locator('.report-face').getAttribute('fill');
 const highFill = await faces.nth(high).locator('.report-face').getAttribute('fill');
 expect(Number(highFill!.match(/ (\d+)%/)![1])).toBeGreaterThan(Number(lowFill!.match(/ (\d+)%/)![1]));
 await faces.nth(low).focus(); await page.keyboard.press('Enter');
 await expect(faces.nth(low)).toHaveAttribute('aria-pressed', 'true');
 await page.screenshot({ animations: 'disabled', timeout: 10000, path: 'docs/preview-report-month.png', fullPage: true });
 await tabs.nth(2).click(); await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
 await expect(page.locator('.report-loading')).toHaveCount(0);
 await expect(page.locator('.report-trend-point')).toHaveCount(5);
 await tabs.nth(0).click(); await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
 await page.screenshot({ animations: 'disabled', timeout: 10000, path: 'docs/preview-report-week.png', fullPage: true });
 await page.getByRole('button', { name: '返回更多玩法', exact: true }).click();
 await expect(page.getByRole('heading', { name: '更多玩法' })).toBeVisible();
});

test('天气授权失败有手动选城，公共接口错误不显示假天气', async ({ page, context }) => {
 await context.clearPermissions();
 await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_success: unknown, fail: (error: { code: number }) => void) => fail({ code: 1 }) } }));
 await page.route('**/api/location/search?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({error:'城市搜索服务暂时不可用'}) }));
 await page.goto('/'); await page.locator('.weather-pill').click();
 await expect(page.locator('.weather-page')).toBeVisible();
 expect(await page.locator('.weather-page').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))).toEqual({ width: 390, height: 844 });
 await expect(page.locator('dialog[open]')).toHaveCount(0);
 await page.getByRole('button', { name: /使用当前位置/ }).click();
 await expect(page.getByRole('alert')).toContainText('定位权限未开启');
 await page.getByRole('button', { name: '广州', exact: true }).click();
 await expect(page.getByText('城市搜索服务暂时不可用')).toBeVisible();
 await expect(page.getByRole('button', { name: '重新搜索' })).toBeVisible();
 await page.screenshot({ animations: 'disabled', timeout: 10000, path: 'docs/preview-weather.png' });
});

test('HTTP定位说明明确，手动选城后保留天气详情和城市景观', async ({ page }) => {
 await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { get: () => false }));
 await page.route('**/api/bootstrap', async route => { const data = await (await route.fetch()).json(); await route.fulfill({ json: { ...data, weather: null } }); });
 const shanghai = { ...selectedWeather, city: '上海', latitude: 31.23, longitude: 121.47, code: 2, temperature: 22, high: 24, low: 19, isDay: false, feelsLike: 23, humidity: 78, windSpeed: 12, precipitation: 0, weatherTime: '2026-10-01T20:15', greeting: '上海今晚多云，让音乐陪你放松。' };
 await page.route('**/api/location/search?*', route => route.fulfill({ json: { results: [{ id: 2, name: '上海', city: '上海', latitude: 31.23, longitude: 121.47, country: '中国' }] } }));
 await page.route('**/api/weather', route => route.fulfill({ json: shanghai }));
 await page.goto('/'); await page.locator('.weather-pill').click();
 await page.getByRole('button', { name: /使用当前位置/ }).click();
 await expect(page.getByRole('alert')).toContainText('HTTP 局域网地址');
 await expect(page.getByRole('link', { name: '在本机电脑打开' })).toHaveAttribute('href', /http:\/\/127\.0\.0\.1/);
 await page.getByRole('button', { name: '上海', exact: true }).click();
 await page.locator('.weather-city-result').first().click();
 await expect(page.locator('.weather-details')).toBeVisible();
 await expect(page.locator('.weather-scene')).toHaveAttribute('data-scene', 'shanghai');
 await expect(page.locator('.weather-scene')).toHaveAttribute('data-period', 'night');
 await expect(page.locator('.weather-high-low')).toContainText('最高 24°');
 await expect(page.locator('.weather-high-low')).toContainText('最低 19°');
 await expect(page.locator('.weather-temperature')).toHaveText('22°');
 await expect(page.locator('.weather-metrics')).toContainText('78%');
 await expect(page.locator('.weather-metrics>section')).toHaveCount(2);
 await expect(page.locator('.weather-page')).not.toContainText('风速');
 await expect(page.locator('.weather-page')).not.toContainText('当前降水');
 expect(await page.locator('.weather-metrics').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.weather-details')!.getBoundingClientRect().bottom - 28)).toBeTruthy();
 await expect(page.locator('.weather-page')).not.toContainText('Open-Meteo');
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-weather-shanghai-night.png', fullPage: true });
 for (const width of [320, 390, 1200]) {
  await page.setViewportSize({ width, height: 844 });
  expect(await page.locator('.weather-page').evaluate(el => ({ width: el.clientWidth, available: el.parentElement!.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ width: Math.min(width, 480), available: Math.min(width, 480), overflow: false });
 }
 await page.getByRole('button', { name: '返回上一页', exact: true }).click();
 await expect(page.locator('.weather-pill')).toContainText('上海 多云 22°');
 await page.locator('.weather-pill').click();
 await expect(page.locator('.weather-details')).toBeVisible();
});

test('授权坐标传后端解析城市，雨天场景刷新失败保留已知天气', async ({ page, context }) => {
 await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 23.13, longitude: 113.26 });
 await page.route('**/api/bootstrap', async route => { const data = await (await route.fetch()).json(); await route.fulfill({ json: { ...data, weather: null } }); });
 let count = 0; let location: { latitude: number; longitude: number; city: string } | undefined;
 await page.route('**/api/weather', route => {
  location = route.request().postDataJSON(); count++;
  return count === 1 ? route.fulfill({ json: { ...selectedWeather, code: 65, condition: '大雨', isDay: true, high: 29, low: 23, windSpeed: 27, precipitation: 8.5, feelsLike: 27, humidity: 90, severe: true } }) : route.fulfill({ status: 503, json: { error: '天气服务暂时不可用，请稍后重试。' } });
 });
 await page.goto('/'); await page.locator('.weather-pill').click(); await page.getByRole('button', { name: /使用当前位置/ }).click();
 await expect(page.locator('.weather-details')).toBeVisible();
 expect(location).toEqual({ latitude: 23.13, longitude: 113.26, city: '你所在的位置' });
 await expect(page.locator('.weather-scene')).toHaveAttribute('data-scene', 'guangzhou');
 await expect(page.locator('.weather-scene')).toHaveAttribute('data-weather', 'rain');
 await expect(page.locator('.weather-scene')).toHaveAttribute('data-period', 'day');
 await expect(page.getByRole('heading', { name: '天气提醒' })).toBeVisible();
 expect(await page.locator('.weather-metrics').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight)).toBeTruthy();
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-weather-guangzhou-rain.png', fullPage: true });
 await page.getByRole('button', { name: '刷新天气' }).click();
 await expect(page.getByRole('alert')).toContainText('天气服务暂时不可用');
 await expect(page.locator('.weather-condition')).toHaveText('大雨');
 await expect(page.getByRole('button', { name: '刷新天气' })).toBeEnabled();
 await page.getByRole('button', { name: '切换城市' }).click();
 await expect(page.getByRole('searchbox', { name: '搜索城市' })).toBeVisible();
 await page.getByRole('button', { name: '返回上一页' }).click();
 await expect(page.locator('.weather-details')).toBeVisible();
});

test('远程对话失败保留输入，重试成功展示真实来源与后续话题', async ({ page }) => {
 const integration = { provider: '酷狗', configured: true, state: 'ready', detail: '等待连接' };
 await page.route('**/api/bootstrap', async route => {
  const response = await route.fetch();
  await route.fulfill({ json: { ...await response.json(), mode: 'kugou-pending', integration } });
 });
 let attempts = 0;
 await page.route('**/api/chat', route => {
  attempts += 1;
  return attempts === 1
   ? route.fulfill({ status: 503, json: { error: '酷狗聊天暂时无法连接', source: 'kugou-error', integration: { ...integration, state: 'error', detail: '酷狗聊天暂时无法连接' } } })
   : route.fulfill({ json: { reply: '我在听，今天哪件事让你觉得累？', source: 'kugou', songs: [], quickCommands: ['聊聊工作', '听一首轻松的歌'], integration: { ...integration, state: 'connected' } } });
 });
 await page.goto('/');
 await page.getByRole('button', { name: '和音乐搭子聊天' }).click();
 const input = page.getByRole('textbox', { name: '对搭子说点什么' });
 const count = await page.locator('.chat-message.assistant').count();
 await input.fill('工作有些累');
 await page.getByRole('button', { name: '发送消息' }).click();
 await expect(page.getByRole('alert')).toContainText('酷狗聊天暂时无法连接');
 await expect(input).toHaveValue('工作有些累');
 await expect(page.locator('.chat-message.assistant')).toHaveCount(count);
 await expect(page.locator('.chat-context')).toContainText('连接异常');
 await page.getByRole('button', { name: '发送消息' }).click();
 await expect(page.locator('.chat-message.assistant').last()).toContainText('今天哪件事');
 await expect(page.locator('.chat-context')).toContainText('酷狗 AI · 已连接');
 await expect(page.getByRole('button', { name: '聊聊工作', exact: true })).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('真实音频播放后计入数据库，暂停不继续累计', async ({ page, request }) => {
 await page.addInitScript(() => Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true }));
 await modelCardsFixture(page);
 await page.goto('/');
 const before = await (await request.get('/api/reports?period=week')).json();
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '为你推荐', exact: true }).click();
 await page.locator('.recommendation-play').first().click();
 await expect(page.getByRole('button', { name: '暂停播放', exact: true })).toBeVisible();
 await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 15000 }).toBeGreaterThan(2);
 await page.getByRole('button', { name: '暂停播放', exact: true }).click();
 await expect.poll(async () => (await (await request.get('/api/reports?period=week')).json()).summary.playCount).toBeGreaterThan(before.summary.playCount);
 const paused = await page.locator('audio').evaluate((el: HTMLAudioElement) => el.paused);
 expect(paused).toBe(true);
 // Seek near the end, then let the actual media element end and replay it.
 await page.locator('audio').evaluate((el: HTMLAudioElement) => { el.currentTime = el.duration - .15; });
 await page.getByRole('button', { name: '继续播放', exact: true }).click();
 await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.ended)).toBe(true);
 await page.getByRole('button', { name: '继续播放', exact: true }).click();
 await expect.poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(2);
 await page.getByRole('button', { name: '暂停播放', exact: true }).click();
 await expect.poll(async () => (await (await request.get('/api/reports?period=week')).json()).summary.playCount).toBe(before.summary.playCount + 2);
});



test('心情页选择城市返回后自动结合心情生成卡片', async ({ page }) => {
 const calls = await modelCardsFixture(page, false);
 await page.route('**/api/location/search?*', route => route.fulfill({ json: { results: [{ id: 1, name: '广州', city: '广州', country: '中国', latitude: 23.12, longitude: 113.26 }] } }));
 await page.route('**/api/weather', route => route.fulfill({ json: selectedWeather }));
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '心情选歌', exact: true }).click();
 await page.getByRole('button', { name: '专注时刻', exact: true }).click();
 expect(calls).toHaveLength(0);
 await page.getByRole('button', { name: '选择天气与位置' }).click();
 await page.getByRole('heading', { name: '天气与位置' }).waitFor();
 await page.getByRole('button', { name: '广州', exact: true }).click();
 await page.locator('.weather-city-result').first().click();
 await expect(page.locator('.weather-details')).toBeVisible();
 await page.getByRole('button', { name: '返回上一页', exact: true }).click();
 await expect(page.getByRole('heading', { name: '心情选歌' })).toBeVisible();
 await expect(page.locator('.recommendation-song')).toHaveCount(3);
 expect(calls[0].scene).toBe('专注时刻');
 await expect(page.locator('.recommendation-context')).toContainText('广州 · 多云');
});

test('推荐接口失败时不展示演示卡片，支持重新推荐', async ({ page }) => {
 await modelCardsFixture(page);
 await page.route('**/api/recommendations', route => route.fulfill({ status: 503, json: { error: '音乐推荐暂时无法连接' } }));
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '为你推荐', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('音乐推荐暂时无法连接');
 await expect(page.locator('.recommendation-song')).toHaveCount(0);
 await expect(page.getByRole('button', { name: '重新推荐' })).toBeVisible();
 await expect(page.locator('.chat-sheet')).toHaveCount(0);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 1000 }, { width: 430, height: 932 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
 test(`响应式页面与弹层 ${viewport.width}×${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await modelCardsFixture(page);
  const checkPage = async (selector: string) => {
   await expect(page.locator(selector)).toBeVisible();
   const bounds = await page.locator(selector).evaluate(el => ({
    width: el.getBoundingClientRect().width, available: el.parentElement!.clientWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
   }));
   expect(bounds.overflow).toBe(false);
   expect(bounds.width).toBe(bounds.available);
  };
  await page.goto('/');
  await checkPage('.home-page');
  expect(await page.locator('.home-page').evaluate(el => el.getBoundingClientRect().height >= innerHeight - 1)).toBe(true);
  expect(await page.locator('.speech-bubble').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.companion')!.getBoundingClientRect().top)).toBe(true);
  if (viewport.height >= 932) {
   expect(await page.locator('.hot-activities').evaluate(el => {
    const rect = el.getBoundingClientRect(); return rect.bottom <= innerHeight && rect.bottom >= innerHeight - 40;
   })).toBe(true);
  }
  for (const selector of ['.energy-card', '.room-shortcuts button:last-child', '.companion-caption > button']) {
   await page.locator(selector).click();
   await expect.poll(() => page.locator('.bottom-sheet').evaluate(el => {
    const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1;
   })).toBe(true);
   await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  }
  await page.getByRole('button', { name: '日记', exact: true }).click();
  await checkPage('.diary-screen');
  await expect(page.locator('.diary-paper')).toBeVisible();
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  const homeBounds = await page.locator('.home-page').boundingBox();
  await page.locator('.weather-pill').click();
  await checkPage('.weather-details');
  const weatherBounds = await page.locator('.weather-details').boundingBox();
  expect(weatherBounds!.width).toBeCloseTo(homeBounds!.width, 1);
  expect(weatherBounds!.height).toBeCloseTo(homeBounds!.height, 1);
  await expect(page.locator('.home-page')).toHaveAttribute('inert', '');
  expect(await page.locator('.weather-details').evaluate(el => {
   const frame = el.getBoundingClientRect();
   return el.querySelector('.weather-header')!.getBoundingClientRect().top - frame.top >= 28
    && frame.bottom - el.querySelector('.weather-metrics')!.getBoundingClientRect().bottom >= 28;
  })).toBe(true);
  if (viewport.width === 390) await page.screenshot({ path: 'docs/preview-weather-matched.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '切换城市' }).click();
  await checkPage('.weather-sheet');
  await page.getByRole('button', { name: '返回上一页', exact: true }).click();
  await page.getByRole('button', { name: '返回上一页', exact: true }).click();
  await page.getByRole('button', { name: '更多玩法', exact: true }).click();
  await checkPage('.more-page');
  expect(await page.locator('.more-card-chat').evaluate(el => {
   const card = el.getBoundingClientRect(), shell = document.querySelector('.more-page')!.getBoundingClientRect();
   return card.left - shell.left <= 17 && shell.right - card.right <= 17;
  })).toBe(true);
  await page.getByRole('button', { name: 'AI聊天', exact: true }).click();
  const input = page.getByRole('textbox', { name: '对搭子说点什么' });
  await expect(input).toBeVisible();
  await expect.poll(() => input.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })).toBe(true);
  await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  for (const label of ['心情选歌', '为你推荐']) {
   await page.getByRole('button', { name: label, exact: true }).click();
   await checkPage('.recommendation-page');
   if (label === '心情选歌') await page.getByRole('button', { name: '放松一下', exact: true }).click();
   await expect(page.locator('.recommendation-song')).toHaveCount(3);
   await page.getByRole('button', { name: '返回更多玩法', exact: true }).click();
  }
  await page.getByRole('button', { name: '音乐报告', exact: true }).click();
  await checkPage('.report-page');
  for (const name of ['周报', '月报', '年报']) {
   await page.getByRole('tab', { name, exact: true }).click();
   await expect(page.locator('.report-loading')).toHaveCount(0);
   await checkPage('.report-page');
  }
 });
}

test('WebView安全区及软键盘可视高度适配', async ({ page }) => {
 await modelCardsFixture(page);
 await page.goto('/');
 await page.evaluate(() => {
  document.documentElement.style.setProperty('--safe-top', '44px');
  document.documentElement.style.setProperty('--safe-bottom', '34px');
 });
 await expect(page.locator('.home-nav')).toBeVisible();
 expect(await page.locator('.home-nav').evaluate(el => el.getBoundingClientRect().top >= 44)).toBe(true);
 expect(await page.locator('.energy-card').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight - 34)).toBe(true);
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: 'AI聊天', exact: true }).click();
 await page.evaluate(() => {
  Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 360 });
  Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 30 });
  window.visualViewport!.dispatchEvent(new Event('resize'));
 });
 await expect.poll(() => page.getByRole('textbox', { name: '对搭子说点什么' }).evaluate(el => {
  const r = el.getBoundingClientRect(); return r.top >= 30 && r.bottom <= 390 - 34;
 })).toBe(true);
 expect(await page.locator('.chat-messages').evaluate(el => el.clientHeight > 0)).toBe(true);
 await page.getByRole('textbox', { name: '对搭子说点什么' }).fill('键盘适配检查');
 await page.evaluate(() => {
  delete (window.visualViewport! as unknown as { height?: number }).height;
  delete (window.visualViewport! as unknown as { offsetTop?: number }).offsetTop;
  window.visualViewport!.dispatchEvent(new Event('resize'));
 });
 await expect.poll(() => page.locator('.sheet-backdrop').evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(844);
 await expect(page.getByRole('textbox', { name: '对搭子说点什么' })).toHaveValue('键盘适配检查');
});

