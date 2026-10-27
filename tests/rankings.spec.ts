import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
 await page.goto('/');
 await page.getByRole('button', { name: '更多玩法', exact: true }).click();
 await page.getByRole('button', { name: '打榜', exact: true }).click();
 await expect(page.getByRole('heading', { name: '充电榜', exact: true })).toBeVisible();
 await expect(page.locator('[data-ranking-row]')).toHaveCount(50);
}

test('入口、明星搜索切换与完整前1000名分页，不会重复或超出范围', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 await open(page);
 await page.getByRole('textbox', { name: '搜索明星', exact: true }).fill('ZSH');
 await page.getByRole('region', { name: '明星搜索结果' }).getByRole('button', { name: /张韶涵/ }).click();
 await expect(page.locator('.ranking-star-selector')).toContainText('张韶涵');
 await expect(page.locator('.ranking-viewer')).toContainText('我与张韶涵');
 await page.screenshot({ path: 'test-results/ranking-star-mobile.png' });
 for (let count = 50; count < 1000; count += 50) {
  await page.getByRole('button', { name: /加载更多/ }).click();
  await expect(page.locator('[data-ranking-row]')).toHaveCount(count + 50);
 }
 await expect(page.getByRole('button', { name: /加载更多/ })).toHaveCount(0);
 await expect(page.getByText('已展示前 1000 名 · 陪伴不止于名次')).toBeVisible();
 const ranks = await page.locator('[data-ranking-row]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-ranking-row'))).sort((a,b) => a-b));
 expect(ranks).toEqual(Array.from({length:1000},(_,i)=>i+1));
 await page.getByRole('button', { name: '返回更多玩法', exact: true }).click();
 await expect(page.getByRole('heading', { name: '更多玩法', exact: true })).toBeVisible();
 expect(errors).toEqual([]);
});

test('个人榜前100名，搜索定位原排名，榜外有提示且不插入榜单', async ({ page, request }) => {
 await open(page);
 await page.getByRole('tab', { name: '个人榜', exact: true }).click();
 await expect(page.locator('[data-ranking-row]')).toHaveCount(100);
 const data = await (await request.get('/api/rankings/personal')).json();
 const target = data.entries[86];
 await page.getByRole('textbox', { name: '搜索明星，定位个人排名' }).fill(target.star.name);
 await page.getByRole('region', { name: '个人榜搜索结果' }).getByRole('button', { name: new RegExp(target.star.name) }).click();
 const row = page.locator(`#ranking-${target.star.id}`);
 await expect(row).toHaveClass(/is-located/);
 await expect(row).toBeInViewport();
 await expect(row).toHaveAttribute('data-ranking-row', '87');
 const stars = (await (await request.get('/api/rankings/stars')).json()).stars;
 const outside = stars.find((star: {id:string}) => !data.entries.some((item: {star:{id:string}}) => item.star.id === star.id));
 await page.getByRole('textbox', { name: '搜索明星，定位个人排名' }).fill(outside.name);
 await page.getByRole('region', { name: '个人榜搜索结果' }).getByRole('button', { name: new RegExp(outside.name) }).click();
 await expect(page.locator('.ranking-locate-note')).toContainText('未进入前 100');
 await expect(page.locator('[data-ranking-row]')).toHaveCount(100);
 await page.getByRole('button', { name: '关闭定位提示' }).click();
 await page.locator('.rankings-scroll').evaluate(el => el.scrollTo(0,0));
 await page.screenshot({ path: 'test-results/ranking-personal-mobile.png' });
});

test('搜索空结果、清空与榜单规则，切换tab时不保留搜索层', async ({ page }) => {
 await open(page);
 await page.getByRole('textbox', { name: '搜索明星', exact: true }).fill('不存在的明星');
 await expect(page.getByText('没有找到这位明星，换个关键词试试')).toBeVisible();
 await page.getByRole('button', { name: '清空搜索' }).click();
 await expect(page.getByRole('region', { name: '明星搜索结果' })).toHaveCount(0);
 await expect(page.locator('[data-ranking-row]')).toHaveCount(50);
 await page.getByRole('button', { name: '切换明星' }).click();
 await expect(page.getByRole('region', { name: '明星搜索结果' })).toBeVisible();
 await page.getByRole('tab', { name: '个人榜', exact: true }).click();
 await expect(page.getByRole('region', { name: '明星搜索结果' })).toHaveCount(0);
 await page.getByRole('button', { name: '榜单规则' }).click();
 await expect(page.getByRole('dialog')).toContainText('虚构示例');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('首次加载和加载更多失败可重试，保留已加载排名', async ({ page }) => {
 let fail = true;
 await page.route('**/api/rankings/star?*', route => fail ? route.fulfill({status:503,json:{error:'测试网络失败'}}) : route.continue());
 await page.goto('/#/rankings');
 await expect(page.getByRole('alert')).toContainText('测试网络失败');
 fail = false; await page.getByRole('button', {name:'重新加载'}).click();
 await expect(page.locator('[data-ranking-row]')).toHaveCount(50);
 fail = true; await page.getByRole('button', {name:/加载更多/}).click();
 await expect(page.getByRole('alert')).toContainText('测试网络失败');
 await expect(page.locator('[data-ranking-row]')).toHaveCount(50);
 fail = false; await page.getByRole('button', {name:'重试加载'}).click();
 await expect(page.locator('[data-ranking-row]')).toHaveCount(100);
});

test('窄屏、灵动岛和横屏在播放器开启时榜单和搜索仍可操作', async ({ page, request }) => {
 await request.post('/api/favorites', {data:{songId:'sunny-window',favorite:true}});
 for (const device of [{width:320,height:568,top:20,bottom:0},{width:393,height:852,top:59,bottom:34},{width:844,height:390,top:0,bottom:21}]) {
  await page.setViewportSize(device); await page.goto('/');
  await page.evaluate(({top,bottom})=>{document.documentElement.style.setProperty('--safe-top',`${top}px`);document.documentElement.style.setProperty('--safe-bottom',`${bottom}px`);},device);
  await page.getByRole('button',{name:'收藏',exact:true}).click();
  await page.getByRole('button',{name:'播放窗边的晴天',exact:true}).click();
  await page.getByRole('button',{name:'关闭面板',exact:true}).click();
  await page.getByRole('button',{name:'更多玩法',exact:true}).click();
  await page.getByRole('button',{name:'打榜',exact:true}).click();
  await expect(page.locator('[data-ranking-row]')).toHaveCount(50);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.ranking-nav').evaluate((el,top)=>el.getBoundingClientRect().top>=top,device.top)).toBe(true);
  expect(await page.locator('.rankings-scroll').evaluate(el=>el.clientHeight>50)).toBe(true);
  expect(await page.locator('.ranking-viewer').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.mini-player')!.getBoundingClientRect().top)).toBe(true);
  await page.getByRole('textbox',{name:'搜索明星',exact:true}).fill('周杰伦');
  await page.getByRole('region',{name:'明星搜索结果'}).getByRole('button',{name:/周杰伦/}).click();
  await expect(page.locator('.ranking-star-selector')).toContainText('周杰伦');
  await page.screenshot({path:`test-results/ranking-device-${device.width}.png`});
 }
});

test('明星使用本地真人头像并聚焦脸部，个人榜和搜索一致，加载失败回退首字', async ({ page }) => {
 await open(page);
 const selected = page.locator('.ranking-star-selector img');
 await expect(selected).toHaveAttribute('src', '/assets/star-portraits/lyn.jpg');
 await expect.poll(() => selected.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth >= 150)).toBe(true);
 await expect(selected).toHaveAttribute('style', /scale/);
 await expect(page.locator('.ranking-list .ranking-avatar img')).toHaveCount(0);
 await page.getByRole('tab', { name: '个人榜', exact: true }).click();
 await expect(page.locator('[data-ranking-row]')).toHaveCount(100);
 await expect(page.locator('.ranking-podium img')).toHaveCount(3);
 await page.locator('.ranking-podium img').evaluateAll(async images => Promise.all(images.map(img => (img as HTMLImageElement).decode())));
 await page.screenshot({ path: 'test-results/ranking-personal-portraits.png' });
 await page.getByRole('textbox', { name: '搜索明星，定位个人排名' }).fill('张韶涵');
 await expect(page.getByRole('region', { name: '个人榜搜索结果' }).locator('img')).toHaveAttribute('src', '/assets/star-portraits/zsh.jpg');
 await page.getByRole('button', { name: '清空搜索' }).click();
 await page.route('**/assets/star-portraits/lyn.jpg', route => route.abort());
 await page.reload();
 await expect(page.locator('.ranking-star-selector .ranking-avatar')).toHaveText('刘');
 await expect(page.locator('.ranking-star-selector img')).toHaveCount(0);
});
