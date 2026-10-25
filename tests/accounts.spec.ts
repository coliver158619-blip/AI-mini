import { test, expect, type Page } from '@playwright/test';

const freshName = (prefix: string) => prefix + Date.now().toString(36);
async function register(page: Page, nickname: string, gender: '男生' | '女生') {
 await page.goto('/');
 await page.getByLabel('AI 形象昵称', { exact: true }).fill(nickname);
 await page.getByRole('button', { name: new RegExp(gender) }).click();
 await page.getByRole('button', { name: '遇见我的音乐搭子' }).click();
 await expect(page.getByText('正在检测您的音乐歌单', { exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: '进入我的小屋' })).toBeEnabled({ timeout: 12000 });
}

test('new nickname generates correct gender, six free outfits, persistent unlock and logout', async ({ page, context }) => {
 const nickname = freshName('蓝');
 await register(page, nickname, '男生');
 const state = await (await context.request.get('/api/auth/session')).json();
 expect(state.user.gender).toBe('male');
 expect(state.user.onboardingComplete).toBe(false);
 await page.screenshot({ path: 'output/accounts-generation-mobile.png', fullPage: true });
 await page.getByRole('button', { name: '进入我的小屋' }).click();
 await expect(page.locator('.home-page')).toBeVisible();
 let outfits = await (await context.request.get('/api/outfits')).json();
 expect(outfits.outfits.filter((o: any) => o.unlocked)).toHaveLength(6);
 const locked = outfits.outfits.find((o: any) => !o.unlocked);
 await context.request.post('/api/outfit/unlock', { data: { outfitId: locked.id } });
 await context.request.post('/api/outfit', { data: { outfitId: locked.id } });
 await page.goto('/#more');
 await page.getByRole('button', { name: '退出当前小屋' }).click();
 await expect(page.getByLabel('AI 形象昵称', { exact: true })).toBeVisible();
 expect((await context.request.get('/api/bootstrap')).status()).toBe(401);
 await page.getByLabel('AI 形象昵称', { exact: true }).fill(nickname);
 await page.getByRole('button', { name: '遇见我的音乐搭子' }).click();
 await expect(page.locator('.home-page')).toBeVisible();
 await expect(page.locator('.entry-generation')).toHaveCount(0);
 outfits = await (await context.request.get('/api/outfits')).json();
 expect(outfits.profile.outfitId).toBe(locked.id);
 expect(outfits.outfits.filter((o: any) => o.unlocked)).toHaveLength(7);
});

test('different devices start at entry; nickname restores only its own room', async ({ page, browser }) => {
 const nickname = freshName('粉');
 await register(page, nickname, '女生');
 await page.getByRole('button', { name: '进入我的小屋' }).click();
 await expect(page.locator('.home-page')).toBeVisible();
 const first = await (await page.request.get('/api/bootstrap')).json();
 const device = await browser.newContext({ viewport: { width: 393, height: 852 } });
 const other = await device.newPage();
 await other.goto('http://127.0.0.1:5190/');
 await expect(other.getByLabel('AI 形象昵称', { exact: true })).toBeVisible();
 await other.getByLabel('AI 形象昵称', { exact: true }).fill(nickname);
 await other.getByRole('button', { name: '遇见我的音乐搭子' }).click();
 await expect(other.locator('.home-page')).toBeVisible();
 const restored = await (await device.request.get('http://127.0.0.1:5190/api/bootstrap')).json();
 expect(restored.profile.appearance).toEqual(first.profile.appearance);
 await device.close();
});

test('entry responsive and music pairs remain centered with matching actions', async ({ page, context }) => {
 await page.goto('/');
 for (const width of [320, 393, 1024]) {
  await page.setViewportSize({ width, height: 844 });
  await expect(page.getByRole('heading', { name: '给陪伴，起个名字' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 }
 await page.setViewportSize({ width: 393, height: 852 });
 await page.screenshot({ path: 'output/accounts-entry-mobile.png', fullPage: true });
 await context.request.post('/api/auth/login', { data: { nickname: freshName('验证'), gender: 'female' } });
 await context.request.post('/api/auth/complete');
 await page.goto('/#personality');
 await page.reload();
 await expect(page.getByRole('heading', { name: '音乐形象', exact: true })).toBeVisible();
 const catalog = await (await context.request.get('/api/personalities')).json();
 expect(catalog.personalities.filter((p: any) => p.gender === 'male')).toHaveLength(8);
 expect(catalog.personalities.filter((p: any) => p.gender === 'female')).toHaveLength(8);
 for (const [label, id] of [['查看 古风 · 男生','ISTJ'], ['查看 古风 · 女生','ISFJ'], ['查看 古典 · 男生','ESFJ']]) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const character = page.locator(`.personality-stage [data-character="${id}"]`);
  await expect(character).toHaveAttribute('data-motion-ready', 'true');
  await page.locator('.personality-greet').scrollIntoViewIfNeeded();
  const before = await character.boundingBox();
  await page.locator('.personality-greet').click();
  await page.waitForTimeout(500);
  expect(await character.boundingBox()).toEqual(before);
  expect(await character.locator('canvas').evaluate((canvas: HTMLCanvasElement) => { const bytes = canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data; return bytes.some((v,i) => i % 4 === 3 && v > 128); })).toBe(true);
 }
 await page.screenshot({ path: 'output/accounts-paired-music.png', fullPage: true });
});
