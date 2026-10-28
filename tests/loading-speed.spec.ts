import { test, expect } from '@playwright/test';

test('首页先显示，聊天记录晚到不会阻塞首页', async ({ page }) => {
 let release!: () => void;
 const historyGate = new Promise<void>(resolve => { release = resolve; });
 await page.route('**/api/messages', async route => {
  await historyGate;
  await route.fulfill({ json: { messages: [], conversationId: 'test-history' } });
 });
 try {
  await page.goto('/');
  await expect(page.locator('.streak-pill')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.companion')).toBeVisible();
  await page.screenshot({ path: 'test-results/optimized-home.png' });
  await page.getByRole('button', { name: '和音乐搭子聊天', exact: true }).click();
  await expect(page.getByText('正在加载聊天记录…')).toBeVisible();
  release();
  await expect(page.getByText('正在加载聊天记录…')).toHaveCount(0);
 } finally {
  release();
 }
});
