import { expect, test, type Page } from '@playwright/test';

async function openPersonality(page: Page) {
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '音乐人格', exact: true }).click();
 await expect(page.getByRole('heading', { name: '音乐人格', exact: true })).toBeVisible();
 await expect(page.getByRole('group', { name: '选择音乐人格' }).getByRole('button')).toHaveCount(16);
}

test.beforeEach(async ({ request }) => { await request.post('/api/personality', { data: { personalityId: 'INFP' } }); });

test('人格分组、预览、保存、刷新以及首页与火花头像联动', async ({ page, request }) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 await openPersonality(page);
 await page.getByRole('group', { name: '人格分组' }).getByRole('button', { name: '分析家', exact: true }).click();
 await expect(page.getByRole('group', { name: '选择音乐人格' }).getByRole('button')).toHaveCount(4);
 await page.getByRole('button', { name: '查看 INTJ 构筑旋律的人', exact: true }).click();
 await expect(page.locator('.personality-details')).toContainText('电子氛围');
 expect((await (await request.get('/api/bootstrap')).json()).profile.personalityId).toBe('INFP');
 await page.getByRole('button', { name: '选择这个音乐人格', exact: true }).click();
 await expect(page.getByRole('button', { name: '当前音乐人格', exact: true })).toBeDisabled();
 await page.getByRole('button', { name: '返回更多玩法' }).click();
 await expect(page.getByRole('button', { name: '音乐人格', exact: true })).toContainText('当前 INTJ');
 await page.getByRole('button', { name: '返回首页' }).click();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/personalities/INTJ.png');
 await expect(page.locator('.streak-avatar-character')).toHaveAttribute('style', /INTJ.png/);
 await page.getByRole('button', { name: /听歌续火花/ }).click();
 await expect(page.locator('.streak-share-card img')).toHaveAttribute('src', '/assets/personalities/INTJ.png');
 await page.getByRole('button', { name: '关闭面板' }).click();
 await page.reload();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/personalities/INTJ.png');
 await page.screenshot({ path: 'test-results/personality-home.png', fullPage: true, animations: 'disabled' });
 await openPersonality(page);
 await expect(page.getByRole('button', { name: '查看 INTJ 构筑旋律的人' })).toHaveAttribute('aria-pressed', 'true');
 expect(errors).toEqual([]);
});

test('加载和保存失败可重试，保存期间阻止重复操作', async ({ page }) => {
 let loadFails = true;
 await page.route('**/api/personalities', route => loadFails ? route.fulfill({ status: 503, json: { error: '人格图鉴暂时连接不上' } }) : route.continue());
 await page.goto('/'); await page.getByRole('button', { name: '更多玩法', exact: true }).click(); await page.getByRole('button', { name: '音乐人格', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('人格图鉴暂时连接不上');
 loadFails = false; await page.getByRole('button', { name: '重新加载' }).click();
 await page.getByRole('button', { name: '查看 ENFP 追风逐拍者' }).click();
 let saveFails = true; let resolve: () => void = () => {};
 const pending = new Promise<void>(done => { resolve = done; });
 await page.route('**/api/personality', async route => { if (saveFails) return route.fulfill({ status: 503, json: { error: '保存暂时失败' } }); await pending; await route.continue(); });
 await page.getByRole('button', { name: '选择这个音乐人格', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('保存暂时失败');
 await expect(page.getByRole('button', { name: '查看 ENFP 追风逐拍者' })).toHaveAttribute('aria-pressed', 'true');
 saveFails = false;
 await page.getByRole('button', { name: '选择这个音乐人格', exact: true }).click();
 await expect(page.getByRole('button', { name: '正在保存…' })).toBeDisabled();
 await expect(page.getByRole('button', { name: '返回更多玩法' })).toBeDisabled();
 resolve(); await expect(page.getByRole('button', { name: '当前音乐人格', exact: true })).toBeDisabled();
});

test('16 张素材均可浏览，手机和横屏布局无溢出', async ({ page }) => {
 await openPersonality(page);
 for (const tile of await page.getByRole('group', { name: '选择音乐人格' }).getByRole('button').all()) {
  await tile.click();
  await expect.poll(() => page.locator('.personality-stage img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
 }
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1100, height: 900 }]) {
  await page.setViewportSize(viewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.personality-stage img').evaluate(img => img.getBoundingClientRect().bottom <= document.querySelector('.personality-intro')!.getBoundingClientRect().top)).toBe(true);
  await expect(page.locator('.personality-footer > button')).toBeInViewport();
  await page.screenshot({ path: `test-results/personality-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
 }
});

test('人格与衣橱的底部遮挡覆盖安全区和播放器预留区，列表不会露出或被误点', async ({ page, request }) => {
 await request.post('/api/favorites', { data: { songId: 'sunny-window', favorite: true } });
 for (const device of [
  { width: 393, height: 852, top: 59, bottom: 34, left: 0, right: 0 },
  { width: 320, height: 568, top: 20, bottom: 0, left: 0, right: 0 },
  { width: 844, height: 390, top: 0, bottom: 21, left: 59, right: 59 },
 ]) {
  await page.setViewportSize(device);
  for (const player of [false, true]) {
   for (const menu of [
    { name: '音乐人格', footer: '.personality-footer', grid: '.personality-grid', color: [250, 247, 240] },
    { name: '形象', footer: '.wardrobe-footer', grid: '.wardrobe-grid', color: [250, 245, 238] },
   ]) {
    await page.goto('/');
    await page.evaluate(({ top, bottom, left, right }) => {
     for (const [side, value] of Object.entries({ top, bottom, left, right })) document.documentElement.style.setProperty(`--safe-${side}`, `${value}px`);
    }, device);
    if (player) {
     await page.getByRole('button', { name: '收藏', exact: true }).click();
     await page.getByRole('button', { name: '播放窗边的晴天', exact: true }).click();
     await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    }
    await page.getByRole('button', { name: '更多玩法', exact: true }).click();
    await page.getByRole('button', { name: menu.name, exact: true }).click();
    const grid = page.locator(menu.grid), footer = page.locator(menu.footer);
    await expect(grid.locator(':scope > button')).toHaveCount(menu.name === '音乐人格' ? 16 : 6);
    await grid.evaluate(el => scrollTo(0, scrollY + el.getBoundingClientRect().top - innerHeight * .6));
    await expect(footer).toBeVisible();
    const coverage = await footer.evaluate((el, selector) => {
     const r = el.getBoundingClientRect();
     const points = [
      [1, Math.ceil(r.top) + 1], [innerWidth - 2, Math.ceil(r.top) + 1],
      [innerWidth / 4, innerHeight - 2], [innerWidth * .75, innerHeight - 2],
      [innerWidth / 2, Math.min(innerHeight - 2, r.bottom + 2)],
     ];
     return points.map(([x, y]) => {
      const target = document.elementFromPoint(x, y);
      return Boolean(target?.closest(selector) || target?.closest('.mini-player'));
     });
    }, menu.footer);
    expect(coverage, `${menu.name}, ${device.width}, player=${player}`).toEqual(coverage.map(() => true));
    // Isolate the footer surface from the player's decorative drop shadow.
    const png = await page.screenshot({ path: `test-results/footer-${menu.name}-${device.width}-player-${player}.png`, animations: 'disabled', style: '.mini-player { box-shadow: none !important; }' });
    const pixels = await page.evaluate(async data => {
     const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
     const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
     const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
     return [1, image.width / 4, image.width / 2, image.width - 2].map(x => Array.from(ctx.getImageData(x, image.height - 2, 1, 1).data).slice(0, 3));
    }, png.toString('base64'));
    for (const pixel of pixels) expect(pixel).toEqual(menu.color);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (player) {
     expect(await footer.locator('button').evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.mini-player')!.getBoundingClientRect().top)).toBe(true);
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    expect(await grid.locator(':scope > button').last().evaluate((el, selector) => el.getBoundingClientRect().bottom <= document.querySelector(selector)!.getBoundingClientRect().top, menu.footer)).toBe(true);
   }
  }
 }
});
