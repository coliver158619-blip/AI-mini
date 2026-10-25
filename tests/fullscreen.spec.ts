import { expect, test, type Page } from '@playwright/test';

async function safeArea(page: Page, top: number, bottom: number, left = 0, right = 0) {
 await page.evaluate(insets => {
  for (const [side, value] of Object.entries(insets)) document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`);
 }, { top, bottom, left, right });
}

async function checkHome(page: Page, bottom: number, player = false, _scroll = false) {
 await expect(page.getByRole('button', { name: '热门活动', exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
 expect(await page.locator('.hot-activities').evaluate((el, inset) => el.getBoundingClientRect().bottom <= innerHeight - inset - 23, bottom)).toBe(true);
 await expect.poll(() => page.locator('.speech-bubble').evaluate(el => (() => { const b=el.getBoundingClientRect(),c=document.querySelector('.companion .character-visual')!.getBoundingClientRect(); return b.bottom<=c.top+1 || b.right<=c.left+c.width*.23; })())).toBe(true);
 await expect.poll(() => page.locator('.companion').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.companion-caption')!.getBoundingClientRect().top + 1)).toBe(true);
 if (player) expect(await page.locator('.hot-activities').evaluate(el => el.getBoundingClientRect().bottom < document.querySelector('.mini-player')!.getBoundingClientRect().top)).toBe(true);
}

for (const device of [
 { name: 'island', width: 393, height: 852, top: 59, bottom: 34 },
 { name: 'island-max', width: 440, height: 956, top: 62, bottom: 34 },
 { name: 'notch', width: 390, height: 844, top: 47, bottom: 34 },
 { name: 'small', width: 320, height: 568, top: 20, bottom: 0 },
 { name: 'android', width: 360, height: 800, top: 24, bottom: 24 },
 { name: 'tablet', width: 768, height: 1024, top: 24, bottom: 20 },
 { name: 'wide', width: 1440, height: 900, top: 0, bottom: 0 },
]) {
 test(`首页全屏、安全区和一屏入口 ${device.name}`, async ({ page }) => {
  await page.setViewportSize(device);
  await page.goto('/'); await safeArea(page, device.top, device.bottom);
  await checkHome(page, device.bottom, false, device.height < 700);
  await page.evaluate(() => window.scrollTo(0,0));
  expect(await page.locator('.app-shell').evaluate(el => ({ width: el.getBoundingClientRect().width, radius: getComputedStyle(el).borderRadius }))).toEqual({ width: device.width, radius: '0px' });
  expect(await page.locator('.home-nav').evaluate((el, top) => el.getBoundingClientRect().top >= top, device.top)).toBe(true);
  await expect.poll(() => page.locator('.companion img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: `test-results/fullscreen-${device.name}.png`, animations: 'disabled' });
 });
}

test('灵动岛安全区下播放音乐时底部入口不被播放器覆盖', async ({ page, request }) => {
 await request.post('/api/favorites', { data: { songId: 'sunny-window', favorite: true } });
 await page.setViewportSize({ width: 393, height: 852 });
 await page.goto('/'); await safeArea(page, 59, 34);
 await page.getByRole('button', { name: '收藏', exact: true }).click();
 await page.getByRole('button', { name: '播放窗边的晴天', exact: true }).click();
 await page.getByRole('button', { name: '关闭面板', exact: true }).click();
 await expect(page.locator('.mini-player')).toBeVisible();
 await checkHome(page, 34, true);
 await page.screenshot({ path: 'test-results/fullscreen-player.png', animations: 'disabled' });
});

test('推荐气泡展开时仍然完整显示首页', async ({ page }) => {
 await page.setViewportSize({ width: 393, height: 852 });
 await page.route('**/api/bootstrap', async route => {
  const data = await (await route.fetch()).json();
  await route.fulfill({ json: { ...data, integration: { configured: true, state: 'connected' } } });
 });
 await page.route('**/api/recommendations/hourly', route => route.fulfill({ json: {
  songs: [{ id: 'preview-song', title: '给今天的一首温柔长歌', artist: '音乐搭子', tags: [], color: '#e4af63' }],
  pending: false, createdAt: new Date().toISOString(), nextAt: new Date(Date.now() + 3600000).toISOString(), source: 'kugou',
 } }));
 await page.goto('/'); await safeArea(page, 59, 34);
 await expect(page.locator('.hourly-song')).toBeVisible();
 await checkHome(page, 34, false, true);
 await page.screenshot({ path: 'test-results/fullscreen-hourly.png', animations: 'disabled' });
});

test('横屏侧边安全区、一屏布局及软键盘适配', async ({ page }) => {
 await page.setViewportSize({ width: 844, height: 390 });
 await page.goto('/'); await safeArea(page, 0, 21, 59, 59);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 expect(await page.locator('.room-scene').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 59 && r.right <= innerWidth - 59; })).toBe(true);
 await page.getByRole('button', { name: '热门活动', exact: true }).scrollIntoViewIfNeeded();
 await expect(page.getByRole('button', { name: '热门活动', exact: true })).toBeInViewport();
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: 'AI聊天', exact: true }).click();
 await page.evaluate(() => {
  Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 300 });
  Object.defineProperty(window.visualViewport!, 'offsetTop', { configurable: true, get: () => 20 });
  window.visualViewport!.dispatchEvent(new Event('resize'));
 });
 await expect.poll(() => page.getByRole('textbox', { name: '对搭子说点什么' }).evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 20 && r.bottom <= 320 - 21; })).toBe(true);
});

test('二级页面背景覆盖上下安全区，长页面滚到底也没有露底', async ({ page }) => {
 await page.setViewportSize({ width: 393, height: 852 });
 for (const destination of [
  { action: '', selector: '.more-page' },
  { action: '音乐人格', selector: '.personality-page' },
  { action: '形象', selector: '.wardrobe-page' },
  { action: '音乐报告', selector: '.report-page' },
  { action: '心情选歌', selector: '.recommendation-page' },
  { action: '为你推荐', selector: '.recommendation-page' },
  { action: '日记', selector: '.diary-screen' },
  { action: '天气', selector: '.weather-page' },
 ]) {
  await page.goto('/'); await safeArea(page, 59, 34);
  if (destination.action === '天气') await page.locator('.weather-pill').click();
  else if (destination.action === '日记') await page.getByRole('button', { name: '日记', exact: true }).click();
  else {
   await page.getByRole('button', { name: '更多玩法', exact: true }).click();
   if (destination.action) await page.getByRole('button', { name: destination.action, exact: true }).click();
  }
  const surface = page.locator(destination.selector);
  await expect(surface).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  expect(await surface.evaluate(el => {
   const r = el.getBoundingClientRect();
   return r.top === 0 && r.bottom >= innerHeight && r.width === innerWidth;
  }), destination.action).toBe(true);
  expect(await surface.locator('header').first().evaluate(el => el.getBoundingClientRect().top >= 59)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => surface.evaluate(el => Math.abs(el.getBoundingClientRect().bottom - innerHeight) < 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/safe-background-${destination.action || '更多玩法'}.png`, animations: 'disabled' });
 }
});

test('更多玩法安全区背景连续，播放器下方也不露出浅色条', async ({ page, request }) => {
 await request.post('/api/favorites', { data: { songId: 'sunny-window', favorite: true } });
 await page.setViewportSize({ width: 393, height: 852 });
 for (const player of [false, true]) {
  await page.goto('/'); await safeArea(page, 59, 34);
  if (player) {
   await page.getByRole('button', { name: '收藏', exact: true }).click();
   await page.getByRole('button', { name: '播放窗边的晴天', exact: true }).click();
   await page.getByRole('button', { name: '关闭面板', exact: true }).click();
  }
  await page.getByRole('button', { name: '更多玩法', exact: true }).click();
  const png = await page.screenshot({ path: `test-results/safe-background-more-player-${player}.png`, animations: 'disabled' });
  const differences = await page.evaluate(async ({ data, player }) => {
   const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
   const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
   const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
   const pixel = (y: number) => ctx.getImageData(image.width - 2, y, 1, 1).data;
   const diff = (a: number, b: number) => Math.max(...Array.from(pixel(a)).map((value, i) => Math.abs(value - pixel(b)[i])));
   return { top: diff(1, 60), bottom: diff(image.height - 2, image.height - 35 - (player ? 85 : 0)) };
  }, { data: png.toString('base64'), player });
  expect(differences.top).toBeLessThan(10);
  expect(differences.bottom).toBeLessThan(10);
 }
});

test('天气昼夜景观延伸至四边安全区', async ({ page }) => {
 await page.setViewportSize({ width: 844, height: 390 });
 for (const isDay of [true, false]) {
  await page.route('**/api/bootstrap', async route => {
   const data = await (await route.fetch()).json();
   await route.fulfill({ json: { ...data, weather: {
    city: '广州', temperature: 25, code: 0, condition: '晴', greeting: '和搭子一起听歌',
    updatedAt: new Date().toISOString(), isDay, latitude: 23.13, longitude: 113.26,
   } } });
  });
  await page.goto('/'); await safeArea(page, 0, 21, 59, 59);
  await page.locator('.weather-pill').click();
  await expect(page.locator('.weather-details')).toBeVisible();
  expect(await page.locator('.weather-scene').evaluate(el => {
   const r = el.getBoundingClientRect(); const p = el.parentElement!.getBoundingClientRect();
   return r.left === 0 && r.right === innerWidth && r.top === 0 && Math.abs(r.bottom - p.bottom) < 1;
  })).toBe(true);
  expect(await page.locator('.weather-header').evaluate(el => {
   const r = el.getBoundingClientRect(); return r.left >= 59 && r.right <= innerWidth - 59;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/safe-background-weather-${isDay ? 'day' : 'night'}.png`, animations: 'disabled' });
  await page.unroute('**/api/bootstrap');
 }
});

test('首页蒙版覆盖整张背景，安全区和内容交界没有色差接缝', async ({ page }) => {
 // A flat room fixture isolates tint seams from texture and natural image edges.
 await page.route('**/assets/room.png', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#536d82" d="M0 0h100v100H0z"/></svg>' }));
 for (const device of [
  { width: 393, height: 852, top: 59, bottom: 34, left: 0, right: 0 },
  { width: 320, height: 568, top: 20, bottom: 0, left: 0, right: 0 },
  { width: 844, height: 390, top: 0, bottom: 21, left: 59, right: 59 },
 ]) {
  await page.setViewportSize(device); await page.goto('/');
  await safeArea(page, device.top, device.bottom, device.left, device.right);
  await expect(page.getByRole('button', { name: '热门活动', exact: true })).toBeVisible();
  const boundary = await page.locator('.home-content').evaluate(el => Math.round(el.getBoundingClientRect().top));
  const png = await page.screenshot({ path: `test-results/home-mask-${device.width}.png`, animations: 'disabled' });
  const differences = await page.evaluate(async ({ data, device, boundary }) => {
   const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
   const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
   const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
   const pixel = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data;
   const diff = (x: number, y: number, x2: number, y2: number) => Math.max(...Array.from(pixel(x, y)).map((value, i) => Math.abs(value - pixel(x2, y2)[i])));
   const result = [];
   if (device.top) result.push(diff(image.width - 2, device.top - 1, image.width - 2, device.top));
   if (device.left) result.push(diff(device.left - 1, 2, device.left, 2));
   if (boundary < image.height - 2) result.push(diff(2, boundary - 1, 2, boundary));
   return result;
  }, { data: png.toString('base64'), device, boundary });
  for (const difference of differences) expect(difference).toBeLessThan(3);
 }
});
