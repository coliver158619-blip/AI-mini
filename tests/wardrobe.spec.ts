import { test, expect, type Page } from '@playwright/test';

async function openWardrobe(page: Page) {
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '形象', exact: true }).click();
 await expect(page.getByRole('heading', { name: '形象衣橱' })).toBeVisible();
 await expect(page.getByRole('group', { name: '选择形象' }).getByRole('button')).toHaveCount(2);
}

test.beforeEach(async ({ request }) => {
 await request.post('/api/outfit', { data: { outfitId: 'lyn22' } });
 await request.post('/api/personality', { data: { personalityId: 'ENTJ' } });
});

test('两个人物的14套装扮可试穿，确认后返回首页并更新接口，保留音乐人格', async ({ page, request }) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 await page.goto('/'); await openWardrobe(page);
 const { characters, outfits } = await (await request.get('/api/outfits')).json();
 for (const character of characters) {
  await page.getByRole('group', { name: '选择形象' }).getByRole('button', { name: new RegExp(character.name) }).click();
  const visible = outfits.filter((item: { characterId: string }) => item.characterId === character.id);
  await expect(page.locator('.wardrobe-card')).toHaveCount(visible.length);
  for (const outfit of visible) {
   const card = page.getByRole('button', { name: `试穿${outfit.name}`, exact: true }); await card.click();
   await expect(card).toHaveAttribute('aria-pressed', 'true');
   const image = page.getByRole('img', { name: `${outfit.name}装扮预览`, exact: true });
   await expect(image).toHaveAttribute('src', outfit.imageUrl);
   await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
   expect((await (await request.get('/api/personality/image')).json()).imageName).toBe('ENTJ.png');
  }
 }
 await page.getByRole('button', { name: '穿上这套', exact: true }).click();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/zsh08.png');
 await expect(page.locator('.streak-avatar-character')).toHaveAttribute('style', /zsh08.png/);
 expect((await (await request.get('/api/personality/image')).json()).imageName).toBe('zsh08.png');
 expect((await (await request.get('/api/bootstrap')).json()).profile.personalityId).toBe('ENTJ');
 await page.getByRole('button', { name: /听歌续火花/ }).click();
 await expect(page.locator('.streak-share-card img')).toHaveAttribute('src', '/assets/characters/zsh08.png');
 await page.getByRole('button', { name: '关闭面板' }).click();
 await page.reload(); await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/zsh08.png');
 await openWardrobe(page);
 await expect(page.getByRole('button', { name: '已穿戴', exact: true })).toBeDisabled();
 await page.screenshot({ path: 'test-results/wardrobe-zsh.png', fullPage: true, animations: 'disabled' });
 await page.getByRole('button', { name: /刘宇宁 6 套装扮/ }).click();
 await page.getByRole('button', { name: '试穿绯红乐章' }).click();
 await page.getByRole('button', { name: '穿上这套', exact: true }).click();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/lyn26.png');
 // Restore the saved music personality; the celebrity outfit stays saved.
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '音乐人格', exact: true }).click();
 await expect(page.getByRole('button', { name: '查看 ENTJ 节奏领航员' })).toHaveAttribute('aria-pressed', 'true');
 await page.getByRole('button', { name: '选择这个音乐人格', exact: true }).click();
 await expect(page.getByRole('button', { name: '当前音乐人格', exact: true })).toBeDisabled();
 const profile = (await (await request.get('/api/bootstrap')).json()).profile;
 expect(profile.outfitId).toBe('lyn26'); expect(profile.appearance.imageName).toBe('ENTJ.png');
 expect(profile.characterOutfitIds).toEqual({ lyn: 'lyn26', zsh: 'zsh08' });
 expect(errors).toEqual([]);
});

test('加载和保存失败可重试，保存中防止重复提交和切换人物', async ({ page, request }) => {
 let failedLoad = true;
 await page.route('**/api/outfits', route => failedLoad ? route.fulfill({ status: 503, json: { error: '衣橱暂时连接不上' } }) : route.continue());
 await page.goto('/'); await openWardrobeWithFailure();
 async function openWardrobeWithFailure() {
  await page.getByRole('button', { name: '更多玩法', exact: true }).click();
  await page.getByRole('button', { name: '形象', exact: true }).click();
 }
 await expect(page.getByRole('alert')).toContainText('衣橱暂时连接不上');
 failedLoad = false; await page.getByRole('button', { name: '重新加载' }).click();
 await page.getByRole('button', { name: '试穿晴空舞台' }).click();
 let failSave = true; let resolve: () => void = () => {};
 const pending = new Promise<void>(done => { resolve = done; }); let writes = 0;
 await page.route('**/api/outfit', async route => {
  writes++; if (failSave) return route.fulfill({ status: 503, json: { error: '保存暂时失败' } });
  await pending; await route.continue();
 });
 await page.getByRole('button', { name: '穿上这套', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('保存暂时失败');
 await expect(page.getByRole('button', { name: '试穿晴空舞台' })).toHaveAttribute('aria-pressed', 'true');
 expect((await (await request.get('/api/personality/image')).json()).imageName).toBe('ENTJ.png');
 failSave = false;
 await page.getByRole('button', { name: '穿上这套', exact: true }).click();
 await expect(page.getByRole('button', { name: '正在保存…', exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: /张韶涵 8 套装扮/ })).toBeDisabled();
 await expect(page.getByRole('button', { name: '试穿奶油晴天' })).toBeDisabled();
 await expect(page.getByRole('button', { name: '返回更多玩法' })).toBeDisabled();
 expect(writes).toBe(2); resolve();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/lyn23.png');
});

test('窄屏、桌面和横屏的人物及装扮没有横向溢出', async ({ page }) => {
 await page.goto('/'); await openWardrobe(page);
 await page.getByRole('button', { name: /张韶涵 8 套装扮/ }).click();
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1100, height: 900 }]) {
  await page.setViewportSize(viewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => page.locator('.wardrobe-stage > img').evaluate(img => img.getBoundingClientRect().bottom <= document.querySelector('.wardrobe-preview-copy')!.getBoundingClientRect().top + 1)).toBe(true);
  await expect(page.locator('.wardrobe-wear')).toBeInViewport();
  await page.screenshot({ path: `test-results/wardrobe-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
 }
});
