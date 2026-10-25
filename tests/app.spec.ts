import { test, expect, type Page } from '@playwright/test';

test('日记打开不生成，输入优先改变天气心情字样，模型失败保留原文并可重试', async ({ page }) => {
 const memory = '今天的疲惫被你轻轻写下，我陪你把脚步放慢。那首温柔的旋律，替我们收好了这个需要安慰的夜晚。';
 const celebration = '今天值得庆祝，我们把这份快乐写进日记，让以后再翻到这一页时，还能想起此刻一起微笑的样子。';
 let entry = { date: '2026-10-13', title: '今天的音乐记忆', body: '', minutes: 5, songCount: 1, mood: '', note: '', topSong: null, canEdit: true, isLocked: false,
  weather: { city: '广州', condition: '晴天', code: 0, temperature: 25, greeting: '', updatedAt: '2026-10-13T12:00:00+08:00' },
  inputs: { note: '', attachments: [], voiceTranscript: '', songId: null, song: null, location: null },
  story: { text: '', updatedAt: null as string | null, stale: true, canGenerate: true, version: 'one' } };
 let attempts = 0, automaticCalls = 0;
 await page.route('**/api/diary', route => route.fulfill({ json: { entries: [entry], total: 1 } }));
 await page.route('**/api/diary/*/story', route => { automaticCalls++; return route.fulfill({ json: { entry } }); });
 await page.route('**/api/diary/2026-10-13/inputs', async route => {
  attempts++;
  const inputs = route.request().postDataJSON();
  entry = { ...entry, inputs, note: inputs.note, mood: '难过' };
  if (attempts === 2) { await route.fulfill({ status: 503, json: { entry, error: '素材已收好，原有日记已保留，请重试。' } }); return; }
  const text = attempts === 1 ? memory : celebration;
  entry = { ...entry, body: text, story: { ...entry.story, text, updatedAt: '2026-10-13T15:00:00+08:00', stale: false } };
  await route.fulfill({ json: { entry } });
 });
 await page.goto('/'); await page.getByRole('button', { name: '日记', exact: true }).click();
 await expect(page.locator('.diary-paper .diary-day-label')).toHaveText('Sunny Day');
 await expect(page.getByLabel('写下今天的故事')).toBeVisible();
 expect(automaticCalls).toBe(0); expect(attempts).toBe(0);
 await page.screenshot({ path: 'docs/preview-diary-blank.png', fullPage: true });
 await page.getByLabel('写下今天的故事').fill('今天很累，需要一点安慰。');
 await expect(page.locator('.diary-paper .diary-day-label')).toHaveText('Be Gentle');
 await page.getByRole('button', { name: '把今天写进日记' }).click();
 await page.getByRole('button', { name: '写进今天的日记' }).click();
 await expect(page.locator('.diary-paper .diary-body')).toHaveText(memory);
 await page.getByRole('button', { name: '位置', exact: true }).click();
 await page.getByRole('textbox', { name: '今天想记住的事' }).fill('今天完成了项目，值得庆祝！');
 await expect(page.locator('.diary-paper .diary-day-label')).toHaveText('Happy Day');
 await page.getByRole('button', { name: '写进今天的日记' }).click();
 await expect(page.getByRole('alert')).toContainText('原有日记已保留');
 await expect(page.locator('.diary-paper .diary-body')).toHaveText(memory);
 await page.getByRole('button', { name: '写进今天的日记' }).click();
 await expect(page.locator('.diary-paper .diary-body')).toHaveText(celebration);
 await page.reload(); await page.getByRole('button', { name: '日记', exact: true }).click();
 await expect(page.locator('.diary-paper .diary-body')).toHaveText(celebration);
 await expect(page.locator('.diary-paper .diary-day-label')).toHaveText('Happy Day');
 expect(attempts).toBe(3); expect(automaticCalls).toBe(0);
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

test('日记纸页中央上下掀纸，历史只读，照片拍照语音位置与歌曲素材传入模型', async ({ page }) => {
 const memory = '今天的照片和声音一起留在了这一页。我们记住在珠江边分享音乐的时刻，也让那些没有说完的心事，有了温柔的落脚处。';
 const base = { title: '音乐记忆', body: '', minutes: 0, songCount: 0, mood: '', note: '', topSong: null,
  inputs: { note: '', attachments: [] as { id: string; kind: string; url: string; mimeType: string; name: string; caption: string }[], voiceTranscript: '', songId: null, song: null, location: null },
  story: { text: '', updatedAt: null as string | null, stale: false, canGenerate: false, version: 'one' } };
 let entry = { ...base, date: '2026-10-13', canEdit: true, isLocked: false, weather: { city: '广州', condition: '晴天', code: 0, temperature: 25, greeting: '', updatedAt: '' } };
 const past = { ...base, date: '2026-10-12', canEdit: false, isLocked: true, weather: { ...entry.weather, condition: '小雨', code: 61 }, body: '昨天的小雨，也被音乐留在了这一页。' };
 const inputCalls: any[] = [], uploadKinds: string[] = [], uploaded: any[] = [];
 const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aemkAAAAASUVORK5CYII=', 'base64');
 await page.route('**/api/diary', route => route.fulfill({ json: { entries: [entry, past], total: 2 } }));
 await page.route('**/api/diary/2026-10-13/attachments', async route => {
  const kind = /name="kind"\r\n\r\n([^\r]+)/.exec(route.request().postDataBuffer()!.toString())?.[1] || '';
  uploadKinds.push(kind);
  const attachment = { id: `photo-${uploadKinds.length}`, kind, url: `data:image/png;base64,${png.toString('base64')}`, mimeType: 'image/png', name: 'test.png', caption: '' }; uploaded.push(attachment);
  await route.fulfill({ json: { attachment } });
 });
 await page.route('**/api/diary/2026-10-13/inputs', async route => {
  const inputs = route.request().postDataJSON(); inputCalls.push(inputs);
  entry = { ...entry, inputs: { ...inputs, attachments: inputs.attachments.map((item: { id: string; caption: string }) => ({ ...uploaded.find(upload => upload.id === item.id), ...item })) }, note: inputs.note, body: memory, story: { ...entry.story, text: memory } };
  await route.fulfill({ json: { entry } });
 });
 await page.goto('/'); await page.getByRole('button', { name: '日记', exact: true }).click();
 const paper = page.locator('.diary-paper'), book = page.locator('.diary-book');
 await expect(page.getByLabel('写下今天的故事')).toBeVisible();
 const latest = await paper.getAttribute('aria-label');
 // Start at the actual centre textarea, not the header or a page edge.
 const area = (await page.getByLabel('写下今天的故事').boundingBox())!;
 await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2 + 40); await page.mouse.down();
 await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2 - 50, { steps: 8 }); await page.mouse.up();
 await expect(page.locator('.diary-turn-older')).toBeVisible();
 await expect(paper).not.toHaveAttribute('aria-label', latest!);
 await expect(paper.locator('.diary-day-label')).toHaveText('Rainy Melody');
 await expect(page.getByRole('button', { name: '照片', exact: true })).toBeDisabled();
 await expect(page.getByLabel('写下今天的故事')).toHaveCount(0);
 await expect(book).not.toHaveClass(/diary-is-turning/);
 const older = (await paper.boundingBox())!;
 await page.mouse.move(older.x + older.width / 2, older.y + older.height / 2 - 40); await page.mouse.down();
 await page.mouse.move(older.x + older.width / 2, older.y + older.height / 2 + 50, { steps: 8 }); await page.mouse.up();
 await expect(page.locator('.diary-turn-newer')).toBeVisible();
 await expect(paper).toHaveAttribute('aria-label', latest!);
 await expect(book).not.toHaveClass(/diary-is-turning/);
 await expect(paper.locator('.diary-day-label')).toHaveText('Sunny Day');
 for (const label of ['照片', '拍照']) {
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: label, exact: true }).click();
  await (await chooser).setFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.diary-input-attachment')).toHaveCount(label === '照片' ? 1 : 2);
  await page.getByLabel('照片里的故事').last().fill('和朋友一起庆祝，留下这份快乐。');
  await expect(paper.locator('.diary-day-label')).toHaveText('Happy Day');
  await page.getByRole('button', { name: '关闭日记输入' }).click();
 }
 await page.getByRole('button', { name: '语音', exact: true }).click();
 await page.getByRole('textbox', { name: '语音文字' }).fill('今天也有点疲惫，想让你陪我安静一会儿。');
 await expect(paper.locator('.diary-day-label')).toHaveText('Be Gentle');
 await page.getByRole('button', { name: '关闭日记输入' }).click();
 await page.getByRole('button', { name: '位置', exact: true }).click();
 await page.getByRole('textbox', { name: '日记位置' }).fill('广州 · 珠江边');
 await page.getByRole('button', { name: '关闭日记输入' }).click();
 await page.getByRole('button', { name: /选择一首歌/ }).click();
 await page.locator('.diary-song-picker > button').first().click();
 await page.getByRole('textbox', { name: '今天想记住的事' }).fill('我们一起留下了今天的回忆。');
 await page.getByRole('button', { name: '写进今天的日记' }).click();
 await expect(paper.locator('.diary-body')).toHaveText(memory);
 expect(uploadKinds).toEqual(['photo', 'camera']); expect(inputCalls).toHaveLength(1);
 expect(inputCalls[0].attachments).toHaveLength(2);
 expect(inputCalls[0].attachments.every((item: { caption: string }) => item.caption.includes('庆祝'))).toBeTruthy();
 expect(inputCalls[0].voiceTranscript).toContain('疲惫'); expect(inputCalls[0].location.text).toBe('广州 · 珠江边'); expect(inputCalls[0].songId).toBeTruthy();
 await page.reload(); await page.getByRole('button', { name: '日记', exact: true }).click();
 await expect(page.locator('.diary-paper .diary-body')).toHaveText(memory);
 expect(inputCalls).toHaveLength(1);
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-diary.png', fullPage: true });
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
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-report-year.png', fullPage: true });
 await page.getByText('更多音乐足迹', { exact: true }).click();
 await expect(page.getByRole('button', { name: /分享/ })).toBeVisible();
 await page.getByRole('button', { name: '选择报告日期' }).click();
 await page.getByLabel('报告日期', { exact: true }).fill('2025-10-01');
 await page.getByRole('button', { name: '查看报告' }).click();
 await expect(page.locator('.report-date-nav')).toContainText('2025年');
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
 expect(await page.locator('.weather-metrics').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight)).toBeTruthy();
 await expect(page.locator('.weather-page')).not.toContainText('Open-Meteo');
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-weather-shanghai-night.png', fullPage: true });
 for (const width of [320, 390, 1200]) {
  await page.setViewportSize({ width, height: 844 });
  expect(await page.locator('.weather-page').evaluate(el => ({ width: el.clientWidth, available: el.parentElement!.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth }))).toEqual({ width, available: width, overflow: false });
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
 await expect(page.locator('.chat-context')).toContainText('融入AI · 已连接');
 await expect(page.getByRole('button', { name: '聊聊工作', exact: true })).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});

test('新对话与历史对话隔离，切换保留草稿并支持刷新恢复', async ({ page, request }) => {
 const first = (await (await request.post('/api/conversations')).json()).conversationId;
 await request.post('/api/chat', { data: { message: '记住这段聊天', conversationId: first } });
 await page.goto('/');
 await page.getByRole('button', { name: '和音乐搭子聊天' }).click();
 const input = page.getByRole('textbox', { name: '对搭子说点什么' });
 await expect(page.locator('.chat-message.user')).toContainText('记住这段聊天');
 await input.fill('还没有发送的心情');
 await page.getByRole('button', { name: '开启新对话' }).click();
 await expect(page.locator('.chat-message.user')).toHaveCount(0);
 await expect(input).toHaveValue('');
 await input.fill('今天有点开心');
 await page.getByRole('button', { name: '发送消息' }).click();
 await expect(page.locator('.chat-message.user')).toHaveText('今天有点开心');
 await page.getByRole('button', { name: '选择历史对话' }).click();
 await page.getByRole('button', { name: /记住这段聊天.*条消息/ }).click();
 await expect(page.locator('.chat-message.user')).toHaveText('记住这段聊天');
 await expect(input).toHaveValue('还没有发送的心情');
 await page.reload();
 await page.getByRole('button', { name: '和音乐搭子聊天' }).click();
 await expect(page.locator('.chat-message.user')).toHaveText('记住这段聊天');
});

test('对话参考布局展示及窄屏适配', async ({ page }) => {
 await page.route('**/api/bootstrap', async route => {
  const data = await (await route.fetch()).json();
  await route.fulfill({ json: { ...data, mode: 'kugou', weather: { ...selectedWeather, condition: '阴天', greeting: '广州市现在是多云，24.2°C。不管窗外是什么颜色，我都在这里陪你听歌。' }, integration: { provider: '酷狗', configured: true, state: 'connected' } } });
 });
 await page.route('**/api/messages', route => route.fulfill({ json: { conversationId: 'preview', messages: [
  { id: 1, role: 'user', content: '想下班了', songs: [] },
  { id: 2, role: 'assistant', content: '老大，晚上好呀！广州今晚24度多，凉飕飕的，特别适合窝着听歌。今天忙了一天了吧，要不要我帮你挑首曲子放松一下？', songs: [] },
  { id: 3, role: 'user', content: '需要', songs: [] },
  { id: 4, role: 'assistant', content: '晚上好啊，小满。广州这会儿云层薄薄的，风也松了下来，是那种下班后想给自己留一段空白的天气。\n\n今天先不用急着说话，让音乐来搭把手。', songs: [] },
 ] } }));
 await page.goto('/'); await page.getByRole('button', { name: '和音乐搭子聊天' }).click();
 await expect(page.locator('.chat-title')).toHaveText('我在，慢慢说。');
 await page.locator('.chat-messages').evaluate(el => { el.scrollTop = 0; });
 await page.screenshot({ animations: 'disabled', path: 'docs/preview-chat.png' });
 for (const width of [320, 390, 430, 768]) {
  await page.setViewportSize({ width, height: 844 });
  expect(await page.locator('.chat-sheet').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.getByRole('textbox', { name: '对搭子说点什么' }).evaluate(el => el.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
 }
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



test('心情页先选择城市再选择心情生成卡片', async ({ page }) => {
 const calls = await modelCardsFixture(page, false);
 await page.route('**/api/location/search?*', route => route.fulfill({ json: { results: [{ id: 1, name: '广州', city: '广州', country: '中国', latitude: 23.12, longitude: 113.26 }] } }));
 await page.route('**/api/weather', route => route.fulfill({ json: selectedWeather }));
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '心情选歌', exact: true }).click();
 await expect(page.getByRole('button', { name: '专注时刻', exact: true })).toBeDisabled();
 expect(calls).toHaveLength(0);
 await page.getByRole('button', { name: '选择天气与位置' }).click();
 await page.getByRole('heading', { name: '天气与位置' }).waitFor();
 await page.getByRole('button', { name: '广州', exact: true }).click();
 await page.locator('.weather-city-result').first().click();
 await expect(page.locator('.weather-details')).toBeVisible();
 await page.getByRole('button', { name: '返回上一页', exact: true }).click();
 await expect(page.getByRole('heading', { name: '心情选歌' })).toBeVisible();
 await page.getByRole('button', { name: '专注时刻', exact: true }).click();
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
  await page.locator('.energy-card').click();
  await checkPage('.personal-energy-page');
  await page.getByRole('button', { name: '返回音乐小屋' }).click();
  for (const selector of ['.room-shortcuts button:last-child', '.companion-caption > button']) {
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
  await page.locator('.weather-pill').click();
  await checkPage('.weather-details');
  await page.getByRole('button', { name: '切换城市' }).click();
  await checkPage('.weather-sheet');
  await page.getByRole('button', { name: '返回上一页', exact: true }).click();
  await page.getByRole('button', { name: '返回上一页', exact: true }).click();
  await page.getByRole('button', { name: '更多玩法', exact: true }).click();
  await checkPage('.more-page');
  expect(await page.locator('.more-card-chat').evaluate(el => {
   const card = el.getBoundingClientRect(), shell = document.querySelector('.more-page')!.getBoundingClientRect();
   return card.left >= shell.left && card.right <= shell.right && card.width >= 44;
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

