import { expect, test, type Page } from '@playwright/test';

async function space(page: Page) {
 await page.goto('/');
 await page.getByRole('button', { name: /听歌充电/ }).click();
 await page.goto('/#/more'); await page.getByRole('button', { name: '陪伴空间', exact: true }).click();
 await expect(page.getByRole('heading', { name: '陪伴空间', exact: true })).toBeVisible();
}

test('专属日记保存重开、AI 失败保留、生成后手动编辑及历史日期', async ({ page, request }) => {
 const personalBefore = (await (await request.get('/api/diary')).json()).entries;
 await space(page); await page.getByRole('button', { name: '专属日记', exact: true }).click();
 const notes = page.getByRole('textbox', { name: '两人的共同经历' });
 const body = page.getByRole('textbox', { name: '专属日记正文' });
 await notes.fill('我们今天一起散步，聊了很多开心的小事。');
 await body.fill('亲手写下的共同回忆。');
 await page.getByRole('button', { name: '保存日记', exact: true }).click();
 await expect(page.getByRole('status')).toHaveText('共同回忆已保存。');
 await page.reload();
 await expect(body).toHaveValue('亲手写下的共同回忆。');
 await notes.fill('我们一起散步，也一起分享今天的心情。');
 await page.getByRole('button', { name: 'AI 总结共同经历' }).click();
 await expect(page.getByRole('alert')).toContainText('共同经历已保存');
 await expect(body).toHaveValue('亲手写下的共同回忆。');
 const day = await page.getByLabel('专属日记日期').inputValue();
 await page.route('**/api/shared-diary/*/story', async route => {
  const saved = (await (await request.get('/api/shared-diary')).json()).entries.find((entry: { date: string }) => entry.date === day);
  const response = await request.put(`/api/shared-diary/${day}`, { data: { ...saved, body: '我们把散步时的笑声收在这一页。很平常的一天，因为有彼此的陪伴，也变得值得好好记住。' } });
  await route.fulfill({ json: await response.json() });
 });
 await page.getByRole('button', { name: 'AI 总结共同经历' }).click();
 await expect(body).toHaveValue(/散步时的笑声/);
 await body.fill('这是我们修改后的共同日记。');
 await page.getByRole('button', { name: '保存日记', exact: true }).click();
 await expect(page.getByRole('status')).toHaveText('共同回忆已保存。');
 await page.screenshot({ path: 'test-results/shared-diary.png', fullPage: true });
 for (const width of [320, 844, 1440]) {
  await page.setViewportSize({ width, height: 852 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
 await page.getByLabel('专属日记日期').fill('2026-01-01');
 await notes.fill('补写我们一起看日出的经历。');
 await page.getByRole('button', { name: '保存日记', exact: true }).click();
 await expect(page.getByRole('status')).toHaveText('共同回忆已保存。');
 expect((await (await request.get('/api/diary')).json()).entries).toEqual(personalBefore);
 await page.getByRole('button', { name: '返回陪伴空间' }).click();
 await expect(page.getByRole('heading', { name: '陪伴空间', exact: true })).toBeVisible();
});

test('共同歌单只展示一起听记录，支持播放及窄屏', async ({ page, request }) => {
 await space(page); await page.getByRole('button', { name: '一起听歌单' }).click();
 await expect(page.getByRole('heading', { name: '第一首共同的歌，还在等我们' })).toBeVisible();
 await request.post('/api/play', { data: { songId: 'sunny-window', seconds: 30, context: 'together', sessionId: 'together-test', eventId: 'together-test-1' } });
 await page.getByRole('button', { name: '回空间，去一起听' }).click();
 await page.getByRole('button', { name: '一起听歌单' }).click();
 await expect(page.getByRole('heading', { name: '窗边的晴天' })).toBeVisible();
 await page.getByRole('button', { name: '播放窗边的晴天' }).click();
 await expect(page.getByRole('button', { name: '暂停窗边的晴天', exact: true })).toBeVisible();
 await expect.poll(() => page.locator('audio').evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeGreaterThan(1.5);
 const recorded = page.waitForRequest(request => request.url().endsWith('/api/play') && request.method() === 'POST' && request.postDataJSON().context === 'together');
 await page.getByRole('button', { name: '关闭播放器', exact: true }).click();
 expect((await recorded).postDataJSON().seconds).toBeGreaterThan(0);
 for (const width of [320, 393, 1440]) {
  await page.setViewportSize({ width, height: 852 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
 await page.screenshot({ path: 'test-results/together-playlist.png', fullPage: true });
});

test('男女等高，首页和情侣空间随机动作，没有整体晃动', async ({ page, request }) => {
 await request.post('/api/outfit/unlock', { data: { outfitId: 'lyn22' } });
 await request.post('/api/outfit', { data: { outfitId: 'lyn22' } });
 await request.post('/api/outfit', { data: { outfitId: 'zsh09' } });
 await page.goto('/');
 const home = page.locator('.companion .character-visual');
 await expect(home).toHaveAttribute('data-motion-ready', 'true');await expect(home).toHaveAttribute('data-wave-ready','true');
 await page.evaluate(() => { Math.random = () => 0.8; });
 await page.locator('.companion').click();
 await expect(home).toHaveAttribute('data-action', 'wink');
 await expect(home.locator('.character-frames')).toBeVisible();
 await page.screenshot({ path: 'test-results/home-wink.png', animations: 'disabled' });
 await expect(page.locator('.companion')).not.toHaveClass(/wiggle/);
 await space(page);
 const boy = page.getByRole('button', { name: '和 KUGUY 打招呼' }), girl = page.getByRole('button', { name: '和 KUGIRL 打招呼' });
 await expect(boy.locator('.character-visual')).toHaveAttribute('data-motion-ready', 'true');await expect(boy.locator('.character-visual')).toHaveAttribute('data-wave-ready','true');
 await expect(girl.locator('.character-visual')).toHaveAttribute('data-motion-ready', 'true');
 for (const size of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  await page.setViewportSize(size);
  const bounds = await page.locator('.space-scene .couple-figure').evaluateAll(items => items.map(item => { const r = item.getBoundingClientRect(); return { height: r.height, bottom: r.bottom }; }));
  expect(Math.abs(bounds[0].height - bounds[1].height)).toBeLessThan(1);
  expect(Math.abs(bounds[0].bottom - bounds[1].bottom)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/space-actions-${size.width}.png`, fullPage: true, animations: 'disabled' });
 }
 await page.setViewportSize({ width: 393, height: 852 });
 await page.clock.install();
 await page.clock.pauseAt(new Date());
 await page.evaluate(() => { Math.random = () => 0; });
 await boy.click(); await expect(boy.locator('.character-visual')).toHaveAttribute('data-action', 'wave');
 await page.clock.runFor(400);
 await expect(boy.locator('.character-frames')).toBeVisible();
 await page.screenshot({ path: 'test-results/space-wave.png' });
 await page.evaluate(() => { Math.random = () => 0.4; });
 await girl.click(); await expect(girl.locator('.character-visual')).toHaveAttribute('data-action', 'blink');
 await page.clock.runFor(500);
 await expect(girl.locator('.character-visual')).toHaveAttribute('data-action', 'idle');
});
