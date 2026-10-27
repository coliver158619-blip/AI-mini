import { test, expect, type Page } from '@playwright/test';

async function enterSpace(page: Page) {
 await page.goto('/');
 await page.getByRole('button', { name: /听歌充电/ }).click();
 await page.goto('/#/more'); await page.getByRole('button', { name: '陪伴空间', exact: true }).click();
 await expect(page.getByRole('heading', { name: '陪伴空间', exact: true })).toBeVisible();
 await expect(page.locator('.bottom-sheet')).toHaveCount(0);
}

test('火花双人形象、同排入口与一起听预留接口', async ({ page, request }) => {
 const profile = (await (await request.get('/api/bootstrap')).json()).profile;
 await page.goto('/'); await page.getByRole('button', { name: /听歌充电/ }).click();
 await expect(page.locator('.streak-couple img')).toHaveCount(2);
 await expect(page.locator('.streak-couple .couple-boy')).toHaveAttribute('src', `/assets/characters/web-v1/${profile.characterOutfitIds.lyn}.webp`);
 await expect(page.locator('.streak-couple .couple-girl')).toHaveAttribute('src', `/assets/characters/web-v1/${profile.characterOutfitIds.zsh}.webp`);
 const [title, share] = await page.locator('.relationship-header h1, .charge-share').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2 }; }));
 expect(title.x).toBeLessThan(share.x); expect(Math.abs(title.y - share.y)).toBeLessThan(1);
 await page.locator('.streak-couple img').evaluateAll(imgs => Promise.all(imgs.map(img => (img as HTMLImageElement).decode())));
 await page.screenshot({ path: 'test-results/streak-couple.png', animations: 'disabled' });
 await page.goto('/#/more'); await page.getByRole('button', { name: '陪伴空间', exact: true }).click();
 const entryRequest = page.waitForResponse('**/api/listen-together/entry');
 await page.locator('.space-listen').click();
 expect((await (await entryRequest).json()).available).toBe(false);
 await expect(page.getByRole('status')).toContainText('一起听即将上线');
 await expect(page.getByRole('heading', { name: '陪伴空间', exact: true })).toBeVisible();
 await page.getByRole('button', { name: '返回音乐小屋' }).click();
 await expect(page.getByRole('button', { name: /听歌充电/ })).toBeVisible();
});

test('陪伴空间多屏布局与接口失败重试及配置后跳转', async ({ page }) => {
 await enterSpace(page);
 for (const viewport of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  await page.setViewportSize(viewport);
  await page.locator('.space-couple-button img').evaluateAll(imgs => Promise.all(imgs.map(img => (img as HTMLImageElement).decode())));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/companion-space-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
 }
 await page.route('**/api/listen-together/entry', route => route.fulfill({ status: 503, json: { error: '入口暂时连接不上' } }));
 await page.locator('.space-listen').click();
 await expect(page.getByRole('status')).toContainText('入口暂时连接不上');
 await expect(page.locator('.space-listen')).toBeEnabled();
 await page.unroute('**/api/listen-together/entry');
 await page.route('**/api/listen-together/entry', route => route.fulfill({ json: { available: true, url: '/future-together' } }));
 await page.route('**/future-together', route => route.fulfill({ contentType: 'text/html', body: '<h1>Future destination test</h1>' }));
 await page.locator('.space-listen').click();
 await expect(page).toHaveURL(/\/future-together$/);
});

test('锁图标放大居中且没有圆形边框', async ({ page }) => {
 await page.goto('/');
 await page.getByRole('button', { name: /听歌充电/ }).click();
 await page.getByRole('button', { name: '形象', exact: true }).click();
 const lock = page.locator('.wardrobe-lock').first();
 await expect(lock).toBeVisible();
 const style = await lock.evaluate(el => {
  const svg = el.querySelector('svg')!, icon = svg.getBoundingClientRect(), card = el.getBoundingClientRect(), css = getComputedStyle(svg);
  return { centerX: icon.x + icon.width / 2, cardX: card.x + card.width / 2, centerY: icon.y + icon.height / 2, cardY: card.y + card.height / 2, width: icon.width, border: css.borderTopWidth, radius: css.borderRadius };
 });
 expect(style.width).toBeGreaterThanOrEqual(38);
 expect(Math.abs(style.centerX - style.cardX)).toBeLessThan(2);
 expect(Math.abs(style.centerY - style.cardY)).toBeLessThan(14);
 expect(style.border).toBe('0px'); expect(style.radius).toBe('0px');
 await page.locator('.wardrobe-outfit-heading').evaluate(el => el.scrollIntoView({ block: 'start' }));
 await page.screenshot({ path: 'test-results/wardrobe-new-lock.png', animations: 'disabled' });
});
