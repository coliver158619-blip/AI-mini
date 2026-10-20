import { expect, test, type Page } from '@playwright/test';

async function setInsets(page: Page, top: number, bottom: number) {
 await page.evaluate(({ top, bottom }) => {
  document.documentElement.style.setProperty('--safe-top', `${top}px`);
  document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`);
 }, { top, bottom });
}

async function swipe(page: Page, start: { x: number; y: number }, delta: { x: number; y: number }, during?: () => Promise<void>) {
 const session = await page.context().newCDPSession(page);
 await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
 for (let step = 1; step <= 8; step++) {
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + delta.x * step / 8, y: start.y + delta.y * step / 8 }] });
 }
 if (during) await during();
 await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
 await session.detach();
}

test('更多玩法在手机和横屏中完整显示全部入口，不产生纵向滚动', async ({ page }) => {
 for (const device of [
  { width: 393, height: 852, top: 59, bottom: 34 },
  { width: 393, height: 700, top: 0, bottom: 0 },
  { width: 320, height: 568, top: 20, bottom: 0 },
  { width: 440, height: 956, top: 62, bottom: 34 },
  { width: 844, height: 390, top: 0, bottom: 21 },
 ]) {
  await page.setViewportSize(device);
  await page.goto('/'); await setInsets(page, device.top, device.bottom);
  await page.getByRole('button', { name: '更多玩法', exact: true }).click();
  await expect(page.locator('.more-card')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const card of await page.locator('.more-card').all()) {
   expect(await card.evaluate((el, device) => {
    const box = el.getBoundingClientRect();
    return box.top >= device.top && box.bottom <= innerHeight - device.bottom && box.height >= 44;
   }, device)).toBe(true);
  }
  await page.screenshot({ path: `test-results/more-fitted-${device.width}-${device.height}.png`, animations: 'disabled' });
 }
});

test('播放器显示时更多玩法也完整显示，入口仍可打开', async ({ page, request }) => {
 await request.post('/api/favorites', { data: { songId: 'sunny-window', favorite: true } });
 await page.setViewportSize({ width: 320, height: 568 });
 await page.goto('/'); await setInsets(page, 20, 0);
 await page.getByRole('button', { name: '收藏', exact: true }).click();
 await page.getByRole('button', { name: '播放窗边的晴天', exact: true }).click();
 await page.getByRole('button', { name: '关闭面板' }).click();
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
 for (const card of await page.locator('.more-card').all()) {
  expect(await card.evaluate(el => {
   const box = el.getBoundingClientRect();
   return box.height >= 44 && box.bottom < document.querySelector('.mini-player')!.getBoundingClientRect().top;
  })).toBe(true);
 }
 await page.getByRole('button', { name: '音乐人格', exact: true }).click();
 await expect(page.getByRole('heading', { name: '音乐人格', exact: true })).toBeVisible();
});

test('火花面板随下拉移动，松手关闭，短拉和横向划动不会误关闭', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: /听歌续火花/ }).click();
 const sheet = page.locator('.bottom-sheet');
 const header = page.locator('.sheet-heading h2');
 const original = await sheet.boundingBox();
 const heading = await header.boundingBox();
 await swipe(page, { x: heading!.x + heading!.width / 2, y: heading!.y + 10 }, { x: 0, y: 34 });
 await expect(sheet).toBeVisible();
 await expect.poll(async () => Math.abs((await sheet.boundingBox())!.y - original!.y) < 2).toBe(true);
 await swipe(page, { x: heading!.x + 20, y: heading!.y + 10 }, { x: 120, y: 15 });
 await expect(sheet).toBeVisible();
 await swipe(page, { x: heading!.x + 40, y: heading!.y + 10 }, { x: 0, y: 160 }, async () => {
  await expect.poll(async () => (await sheet.boundingBox())!.y > original!.y + 70).toBe(true);
 });
 await expect(sheet).toHaveCount(0);
 await expect(page.getByRole('button', { name: /听歌续火花/ })).toBeFocused();
});

test('火花面板内容未到顶部时向下滑只滚动内容，到顶部后可下拉关闭', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 568 });
 await page.goto('/');
 await page.getByRole('button', { name: /听歌续火花/ }).click();
 const content = page.locator('.energy-detail');
 await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
 expect(await content.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
 const rect = await content.boundingBox();
 await swipe(page, { x: rect!.x + 15, y: rect!.y + 80 }, { x: 0, y: 110 });
 await expect(page.locator('.bottom-sheet')).toBeVisible();
 await content.evaluate(el => { el.scrollTop = 0; });
 await swipe(page, { x: rect!.x + 15, y: rect!.y + 80 }, { x: 0, y: 160 });
 await expect(page.locator('.bottom-sheet')).toHaveCount(0);
});

test('头像和耳机角标在同一框内对齐，小屏长昵称不挤压布局', async ({ page, request }) => {
 await request.post('/api/profile', { data: { name: '陪你听歌的音乐小伙伴' } });
 for (const code of ['INFP', 'ENTP']) {
  await request.post('/api/personality', { data: { personalityId: code } });
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto('/');
  await expect(page.locator('.streak-avatar-character')).toHaveAttribute('style', new RegExp(`${code}.png`));
  expect(await page.locator('.streak-avatar-wrap').evaluate(el => {
   const wrap = el.getBoundingClientRect(), avatar = el.querySelector('.streak-avatar-character')!.getBoundingClientRect(), badge = el.querySelector('.streak-headphone-badge')!.getBoundingClientRect();
   return avatar.left >= wrap.left && avatar.top >= wrap.top && badge.right <= wrap.right + 1 && badge.bottom <= wrap.bottom + 1 && badge.left < avatar.right && badge.top < avatar.bottom;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/streak-avatar-${code}.png`, animations: 'disabled' });
 }
});

test('聊天标题可下拉关闭，短拉回弹、横滑不关闭，草稿与焦点保留', async ({ page }) => {
 await page.goto('/');
 const trigger = page.getByRole('button', { name: '和音乐搭子聊天', exact: true });
 await trigger.click();
 const sheet = page.locator('.chat-sheet');
 await expect.poll(() => sheet.evaluate(el => el.getAnimations().every(a => a.playState === 'finished'))).toBe(true);
 const input = page.getByRole('textbox', { name: '对搭子说点什么' });
 await input.fill('下次接着聊的草稿');
 const original = await sheet.boundingBox();
 const header = await page.locator('.sheet-heading h2').boundingBox();
 const start = { x: header!.x + 20, y: header!.y + 10 };
 await swipe(page, start, { x: 0, y: 34 });
 await expect.poll(async () => Math.abs((await sheet.boundingBox())!.y - original!.y) < 2).toBe(true);
 await swipe(page, start, { x: 120, y: 15 });
 await expect(sheet).toBeVisible();
 await swipe(page, start, { x: 0, y: 160 }, async () => {
  await expect.poll(async () => (await sheet.boundingBox())!.y > original!.y + 70).toBe(true);
 });
 await expect(sheet).toHaveCount(0);
 await expect(trigger).toBeFocused();
 expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
 await trigger.click();
 await expect(input).toHaveValue('下次接着聊的草稿');
});

test('聊天消息滚动不误关闭，在顶部下拉消息可关闭', async ({ page }) => {
 await page.route('**/api/messages', route => route.fulfill({ json: {
  conversationId: 'gesture-history', messages: Array.from({ length: 24 }, (_, i) => ({
   id: i + 1, role: i % 2 ? 'user' : 'assistant', content: `第 ${i + 1} 条对话，和搭子一起回忆今天听过的音乐。`,
  })),
 } }));
 await page.goto('/');
 await page.getByRole('button', { name: '和音乐搭子聊天', exact: true }).click();
 const content = page.locator('.chat-messages');
 await expect(content.locator('.chat-message')).toHaveCount(25);
 await expect.poll(() => page.locator('.chat-sheet').evaluate(el => el.getAnimations().every(a => a.playState === 'finished'))).toBe(true);
 await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
 const before = await content.evaluate(el => el.scrollTop);
 expect(before).toBeGreaterThan(300);
 const rect = await content.boundingBox();
 const start = { x: rect!.x + 8, y: rect!.y + 60 };
 await swipe(page, start, { x: 0, y: 140 });
 await expect(page.locator('.chat-sheet')).toBeVisible();
 await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeLessThan(before);
 await content.evaluate(el => { el.scrollTop = 0; });
 await swipe(page, start, { x: 0, y: 160 });
 await expect(page.locator('.chat-sheet')).toHaveCount(0);
});

test('键盘可视区域下聊天仍能下拉关闭，输入和历史列表操作不误关闭', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: '和音乐搭子聊天', exact: true }).click();
 await page.getByRole('button', { name: '选择历史对话' }).click();
 const history = page.getByRole('region', { name: '历史对话', exact: true });
 await expect(history).toBeVisible();
 const historyHeader = await history.locator('header strong').boundingBox();
 await swipe(page, { x: historyHeader!.x + 10, y: historyHeader!.y + 8 }, { x: 0, y: 160 });
 await expect(page.locator('.chat-sheet')).toBeVisible();
 await page.getByRole('button', { name: '关闭历史对话' }).click();
 await page.evaluate(() => {
  Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 360 });
  Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 30 });
  window.visualViewport!.dispatchEvent(new Event('resize'));
 });
 const input = page.getByRole('textbox', { name: '对搭子说点什么' });
 await input.fill('键盘下的草稿');
 await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().bottom <= 390)).toBe(true);
 const field = await input.boundingBox();
 await swipe(page, { x: field!.x + 30, y: field!.y + 10 }, { x: 0, y: 120 });
 await expect(page.locator('.chat-sheet')).toBeVisible();
 await expect(input).toHaveValue('键盘下的草稿');
 const header = await page.locator('.sheet-heading h2').boundingBox();
 await swipe(page, { x: header!.x + 20, y: header!.y + 10 }, { x: 0, y: 140 });
 await expect(page.locator('.chat-sheet')).toHaveCount(0);
});
