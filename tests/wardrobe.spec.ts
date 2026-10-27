import { test, expect, type Page } from '@playwright/test';

async function openWardrobe(page: Page) {
 await page.getByRole('button', { name: /听歌充电/ }).click();
 await page.getByRole('button', { name: '形象', exact: true }).click();
 await expect(page.getByRole('heading', { name: '形象衣橱' })).toBeVisible();
 await expect(page.getByRole('group', { name: '选择形象' }).getByRole('button')).toHaveCount(2);
}

test.beforeEach(async ({ request }) => {
 await request.post('/api/outfit', { data: { outfitId: 'lyn28' } });
 await request.post('/api/personality', { data: { personalityId: 'ENTJ' } });
});

test('六套初始形象、解锁弹窗、失败重试与解锁后的持久穿戴', async ({ page, request }) => {
 const catalog = await (await request.get('/api/outfits')).json();
 expect(catalog.outfits.filter((item: { unlocked: boolean }) => item.unlocked)).toHaveLength(6);
 const before = await (await request.get('/api/widget/appearance')).json();
 await page.goto('/'); await openWardrobe(page);
 await expect(page.locator('.wardrobe-card.is-locked')).toHaveCount(11);
 await expect(page.getByRole('button', { name: '试穿黑曜主场', exact: true })).toBeVisible();
 await page.getByRole('button', { name: '解锁银翼摇滚', exact: true }).click();
 const dialog = page.getByRole('dialog');
 await expect(dialog).toContainText('当前装扮尚未解锁，是否解锁？');
 await expect(dialog).not.toContainText('演示');
 await page.screenshot({ path: 'test-results/unlock-confirm.png' });
 await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
 expect(await (await request.get('/api/widget/appearance')).json()).toEqual(before);
 let fail = true; let writes = 0;
 await page.route('**/api/outfit/unlock', route => {
  writes++;
  return fail ? route.fulfill({ status: 503, json: { error: '连接中断，请重试' } }) : route.continue();
 });
 await page.getByRole('button', { name: '解锁银翼摇滚', exact: true }).click();
 await dialog.getByRole('button', { name: '是，解锁吧' }).click();
 await expect(dialog.getByRole('alert')).toContainText('连接中断');
 await expect(page.getByRole('button', { name: '解锁银翼摇滚', exact: true })).toHaveClass(/is-locked/);
 fail = false;
 await dialog.getByRole('button', { name: '是，解锁吧' }).click();
 await expect(dialog).toContainText('已检测出陪伴能量充足，正在解锁');
 await expect(page.locator('.unlock-celebration')).toBeVisible();
 await expect(dialog.getByRole('button', { name: '正在解锁…', exact: true })).toBeDisabled();
 await page.screenshot({ path: 'test-results/unlock-effects.png' });
 await dialog.getByRole('button', { name: '好耶，去试穿' }).click();
 expect(writes).toBe(2);
 await expect(page.getByRole('button', { name: '试穿银翼摇滚', exact: true })).not.toHaveClass(/is-locked/);
 expect(await (await request.get('/api/widget/appearance')).json()).toEqual(before);
 await page.getByRole('button', { name: '穿上这套', exact: true }).click();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/web-v1/lyn29.webp');
 expect((await (await request.get('/api/widget/image')).json()).imageName).toBe('lyn29.png');
 await page.reload(); await openWardrobe(page);
 await expect(page.getByRole('button', { name: '试穿银翼摇滚', exact: true })).not.toHaveClass(/is-locked/);
 await page.getByRole('button', { name: '解锁奶油晴天', exact: true }).click();
 await dialog.getByRole('button', { name: '是，解锁吧' }).click();
 await expect(dialog).toContainText('已检测到相关专辑，正在解锁');
 await dialog.getByRole('button', { name: '好耶，去试穿' }).click();
 await expect(page.getByRole('button', { name: '试穿奶油晴天', exact: true })).not.toHaveClass(/is-locked/);
});

test('两个人物的31套装扮可试穿，确认后返回首页并更新接口，保留音乐人格', async ({ page, request }) => {
 const catalog = await (await request.get('/api/outfits')).json();
 for (const outfit of catalog.outfits) await request.post('/api/outfit/unlock', { data: { outfitId: outfit.id } });
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 await page.goto('/'); await openWardrobe(page);
 const { characters, outfits } = await (await request.get('/api/outfits')).json();
 for (const character of characters) {
  await page.getByRole('group', { name: '选择形象' }).getByRole('button', { name: new RegExp(character.name) }).click();
  const visible = outfits.filter((item: { characterId: string }) => item.characterId === character.id);
  await expect(page.locator('.wardrobe-card')).toHaveCount(visible.length);
  const referenceNames = character.id === 'lyn'
   ? ['黑曜主场', '银翼摇滚', '蓝焰电音', '月白清歌', '金风侠影', '墨金江湖', '暖阳漫步', '暖阳开唱', '金色琴音']
   : ['云朵白裙', '纯白恋歌', '月光琴语', '晴蓝微风', '蓝莓甜心', '绮梦熊语', '酷黑假日', '暗夜主唱', '绯红电音'];
  expect((await page.locator('.wardrobe-card > strong').allTextContents()).slice(0, 9)).toEqual(referenceNames);
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
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/web-v1/zsh08.webp');
 await expect(page.locator('.streak-avatar-character img')).toHaveAttribute('src', '/assets/characters/web-v1/zsh08.webp');
 expect((await (await request.get('/api/personality/image')).json()).imageName).toBe('zsh08.png');
 expect((await (await request.get('/api/bootstrap')).json()).profile.personalityId).toBe('ENTJ');
 await page.getByRole('button', { name: /听歌充电/ }).click();
 await expect(page.locator('.streak-couple .couple-girl')).toHaveAttribute('src', '/assets/characters/web-v1/zsh08.webp');
 await expect(page.locator('.streak-couple img')).toHaveCount(2);
 await page.getByRole('button', { name: '返回音乐小屋' }).click();
 await page.reload(); await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/web-v1/zsh08.webp');
 await openWardrobe(page);
 await expect(page.getByRole('button', { name: '已穿戴', exact: true })).toBeDisabled();
 await page.screenshot({ path: 'test-results/wardrobe-zsh.png', fullPage: true, animations: 'disabled' });
 await page.getByRole('button', { name: /KUGUY 14 套装扮/ }).click();
 await page.getByRole('button', { name: '试穿绯红乐章' }).click();
 await page.getByRole('button', { name: '穿上这套', exact: true }).click();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/web-v1/lyn26.webp');
 // Restore the saved music personality; the character outfit stays saved.
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '音乐形象', exact: true }).click();
 await expect(page.getByRole('button', { name: '查看 摇滚' })).toHaveAttribute('aria-pressed', 'true');
 await page.getByRole('button', { name: '选择这个音乐形象', exact: true }).click();
 await expect(page.getByRole('button', { name: '当前音乐形象', exact: true })).toBeDisabled();
 const profile = (await (await request.get('/api/bootstrap')).json()).profile;
 expect(profile.outfitId).toBe('lyn26'); expect(profile.appearance.imageName).toBe('ENTJ.png');
 expect(profile.characterOutfitIds).toEqual({ lyn: 'lyn26', zsh: 'zsh08' });
 expect(errors).toEqual([]);
});

test('加载和保存失败可重试，保存中防止重复提交和切换人物', async ({ page, request }) => {
 for (const outfitId of ['lyn22', 'lyn23']) await request.post('/api/outfit/unlock', { data: { outfitId } });
 let failedLoad = true;
 await page.route('**/api/outfits', route => failedLoad ? route.fulfill({ status: 503, json: { error: '衣橱暂时连接不上' } }) : route.continue());
 await page.goto('/'); await openWardrobeWithFailure();
 async function openWardrobeWithFailure() {
  await page.getByRole('button', { name: /听歌充电/ }).click();
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
 await expect(page.getByRole('button', { name: /KUGIRL 17 套装扮/ })).toBeDisabled();
 await expect(page.getByRole('button', { name: '试穿奶油晴天' })).toBeDisabled();
 await expect(page.getByRole('button', { name: '返回更多玩法' })).toBeDisabled();
 expect(writes).toBe(2); resolve();
 await expect(page.locator('.companion img')).toHaveAttribute('src', '/assets/characters/web-v1/lyn23.webp');
});

test('窄屏、桌面和横屏的人物及装扮没有横向溢出', async ({ page }) => {
 await page.goto('/'); await openWardrobe(page);
 await page.getByRole('button', { name: /KUGIRL 17 套装扮/ }).click();
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1100, height: 900 }]) {
  await page.setViewportSize(viewport);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => page.locator('.wardrobe-stage > img').evaluate(img => img.getBoundingClientRect().bottom <= document.querySelector('.wardrobe-preview-copy')!.getBoundingClientRect().top + 1)).toBe(true);
  await expect(page.locator('.wardrobe-wear')).toBeInViewport();
  await page.screenshot({ path: `test-results/wardrobe-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
 }
});
