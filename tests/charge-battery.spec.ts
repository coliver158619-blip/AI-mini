import { test, expect } from '@playwright/test';

test('陪伴天数切换电池四档，入口保持可点击', async ({ page }) => {
 let days = 99;
 await page.route('**/api/bootstrap', async route => {
  const data = await (await route.fetch()).json();
  data.profile.days = days;
  data.profile.chargeIntroPending = false;
  await route.fulfill({ json: data });
 });
 for (const [value, tier] of [[0, 'calm'], [99, 'calm'], [100, 'spark'], [164, 'spark'], [199, 'spark'], [200, 'surge'], [300, 'surge'], [301, 'max']] as const) {
  days = value;
  await page.goto('/');
  const battery = page.locator('.charge-battery');
  await expect(battery).toHaveClass(`charge-battery charge-battery--${tier}`);
  await expect(battery.locator('b')).toHaveText(String(days));
  await expect(battery.locator('.charge-battery-bolt')).toBeVisible();
  await expect(battery.locator('.charge-battery-bolt')).toHaveAttribute('width', '10');
  const fillRatio = await battery.evaluate(el => el.querySelector('.charge-battery-fill')!.getBoundingClientRect().width / el.querySelector('.charge-battery-track')!.getBoundingClientRect().width);
  expect(fillRatio).toBeCloseTo(Math.min(days / 300, 1), 2);
  await expect(battery.locator('.charge-battery-arcs')).toHaveCount(tier === 'calm' ? 0 : 1);
  await expect(page.getByRole('button', { name: `听歌充电，已陪伴 ${days} 天` })).toBeVisible();
  await page.locator('.streak-pill').screenshot({ path: `test-results/battery-${days}.png` });
 }
 await page.locator('.streak-pill').click();
 await expect(page.getByRole('heading', { name: '听歌充电', exact: true })).toBeVisible();
});

test('窄屏长数值不挤出入口，减少动态设置禁用电弧动画', async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 700 });
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await page.route('**/api/bootstrap', async route => {
  const data = await (await route.fetch()).json();
  data.profile.days = 1234;
  data.profile.chargeIntroPending = false;
  await route.fulfill({ json: data });
 });
 await page.goto('/');
 await expect(page.locator('.charge-battery b')).toHaveText('1234');
 const fits = await page.locator('.charge-battery').evaluate(el => {
  const battery = el.getBoundingClientRect(), pill = el.closest('button')!.getBoundingClientRect();
  return battery.left >= pill.left && battery.right + 5 <= pill.right && pill.right <= innerWidth;
 });
 expect(fits).toBe(true);
 expect(await page.locator('.charge-battery').evaluate(el => [el, ...el.querySelectorAll('*')].every(node => getComputedStyle(node).animationName === 'none'))).toBe(true);
 await page.screenshot({ path: 'test-results/battery-mobile.png' });
});
