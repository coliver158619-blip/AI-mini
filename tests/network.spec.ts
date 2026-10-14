import { test, expect } from '@playwright/test';

test('首页和日记读取短暂中断后恢复，图片使用轻量版本', async ({ page }) => {
 let bootstrapCalls = 0, diaryCalls = 0;
 await page.route('**/api/bootstrap', route => ++bootstrapCalls === 1 ? route.abort('connectionreset') : route.continue());
 await page.route('**/api/diary', route => ++diaryCalls === 1 ? route.fulfill({ status: 502, contentType: 'text/html', body: 'Bad Gateway' }) : route.continue());
 await page.goto('/');
 await expect(page.getByRole('button', { name: '日记', exact: true })).toBeVisible();
 expect(bootstrapCalls).toBe(2);
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/companion.webp');
 await expect.poll(() => page.locator('.companion img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
 await page.getByRole('button', { name: '日记', exact: true }).click();
 await expect(page.locator('.diary-paper')).toBeVisible();
 expect(diaryCalls).toBe(2);
});

test('聊天断网显示可理解的提示，不自动重复发送', async ({ page }) => {
 let posts = 0;
 await page.route('**/api/chat', route => { posts++; return route.abort('connectionreset'); });
 await page.goto('/');
 await page.getByRole('button', { name: '和音乐搭子聊天' }).click();
 await page.getByLabel('对搭子说点什么').fill('今天想听歌');
 await page.getByRole('button', { name: '发送消息' }).click();
 await expect(page.getByRole('alert')).toContainText('网络连接中断');
 await expect(page.getByLabel('对搭子说点什么')).toBeEnabled();
 expect(posts).toBe(1);
});

test('登录失效不重复请求，显示重新登录提示', async ({ page }) => {
 let calls = 0;
 await page.route('**/api/bootstrap', route => { calls++; return route.fulfill({ status: 401, body: '' }); });
 await page.goto('/');
 await expect(page.getByText('登录已失效，请重新打开页面并输入访问账号和密码。')).toBeVisible();
 expect(calls).toBe(1);
});
