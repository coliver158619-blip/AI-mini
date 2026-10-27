import { test, expect, type Page } from '@playwright/test';

const freshName = (prefix: string) => prefix + Date.now().toString(36);

test('充电新手提示按昵称持久保存，任务入口和宽窄屏布局', async ({ page, context, browser }) => {
 const nickname = freshName('充电');
 await context.request.post('/api/auth/login', { data: { nickname, gender: 'male' } });
 await context.request.post('/api/auth/complete');
 await page.goto('/');
 await expect(page.getByRole('status',{name:'首次充电，电量加一'})).toBeVisible();
 await expect(page.getByRole('status',{name:'首次充电，电量加一'})).toContainText('+1');
 await expect(page.locator('.charge-intro')).toBeVisible();
 expect((await (await context.request.get('/api/bootstrap')).json()).profile.energy).toBe(1);
 const originalWeather=await page.locator('.weather-pill').boundingBox();
 await page.reload();
 await expect(page.locator('.charge-intro')).toBeVisible();
 await expect(page.locator('.charge-welcome')).toHaveCount(0);
 expect((await (await context.request.get('/api/bootstrap')).json()).profile.energy).toBe(1);
 for (const viewport of [{width:320,height:568},{width:393,height:852},{width:844,height:390},{width:1440,height:900}]) {
  await page.setViewportSize(viewport);
  const overlaps = await page.locator('.charge-intro').evaluate(el => {
   const a=el.getBoundingClientRect();
   return [...document.querySelectorAll('.streak-pill,.weather-pill,.home-more-glass,.room-shortcut,.speech-bubble,.energy-card')].filter(other=>{
    const b=other.getBoundingClientRect();return a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
   }).map(el=>el.className);
  });
  expect(overlaps).toEqual([]);
 }
 await page.setViewportSize({width:393,height:852});
 await page.screenshot({path:'output/charging-intro.png',animations:'disabled'});
 await page.route('**/api/charge/intro-seen', route => route.fulfill({status:503,json:{error:'暂时没连上'}}));
 await page.locator('.streak-pill').click();
 await expect(page.locator('.charge-intro')).toBeVisible();
 await expect(page.locator('.toast')).toContainText('暂时没连上');
 await page.unroute('**/api/charge/intro-seen');
 await page.locator('.charge-intro').click();
 await expect(page.getByRole('heading',{name:'听歌充电',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'一起听歌单'})).toHaveCount(0);
 await expect(page.locator('.spark-page')).not.toContainText('火花');
 await expect(page.locator('.charge-task')).toHaveCount(3);
 for (const width of [320,393,844,1440]) {
  await page.setViewportSize({width,height:852});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const [title,share] = await page.locator('.relationship-header h1,.charge-share').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y+r.height/2}}));
  expect(share.x).toBeGreaterThan(title.x);expect(Math.abs(share.y-title.y)).toBeLessThan(1);
  if (width===393) await page.screenshot({path:'output/charging-page.png',fullPage:true,animations:'disabled'});
 }
 await page.getByRole('button',{name:'去听歌',exact:true}).click();
 await expect(page.getByRole('heading',{name:'为你推荐'})).toBeVisible();
 await expect(page.locator('.recommendation-song').first()).toBeVisible();
 await page.getByRole('button',{name:'返回听歌充电'}).click();
 await page.getByRole('button',{name:'去记录',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'两人的共同经历'})).toBeVisible();
 await page.goto('/#/spark');
 await page.getByRole('button',{name:'形象',exact:true}).click();
 await expect(page.getByRole('heading',{name:'形象衣橱'})).toBeVisible();
 await page.goto('/#/more');
 await expect(page.getByRole('button',{name:'形象',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'陪伴空间',exact:true}).click();
 await expect(page.getByRole('heading',{name:'陪伴空间',exact:true})).toBeVisible();
 await page.goto('/');
 await expect(page.locator('.charge-intro')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 const afterWeather=await page.locator('.weather-pill').boundingBox();
 expect(afterWeather?.y).toBeCloseTo(originalWeather!.y,0);
 await expect(page.getByRole('progressbar',{name:'我们的陪伴电量'})).toBeVisible();
 await page.locator('.energy-card').click();
 await expect(page.locator('.home-page')).toBeVisible();
 await expect(page.locator('.energy-card > svg')).toHaveCount(0);
 const other=await browser.newContext({baseURL: new URL(page.url()).origin});
 try {
  await other.request.post('/api/auth/login',{data:{nickname}});
  expect((await (await other.request.get('/api/bootstrap')).json()).profile.chargeIntroPending).toBe(false);
 } finally { await other.close(); }
});

test('明星滚轮联动统计、独立日记与四阶段礼盒',async({page,context})=>{
 await context.request.post('/api/auth/login',{data:{nickname:freshName('星光'),gender:'female'}});
 await context.request.post('/api/auth/complete');
 await context.request.post('/api/charge/welcome');
 const ids=['jay','joker','jj','vae','gem','eason','li-ronghao','wang-sulong','liu-yuning','g-dragon'];
 const names=['周杰伦','薛之谦','林俊杰','许嵩','邓紫棋','陈奕迅','李荣浩','汪苏泷','刘宇宁','权志龙'];
 await page.route('**/api/bootstrap',async route=>{const data=await(await route.fetch()).json();data.profile.energy=1285;await route.fulfill({json:data})});
 await page.route('**/api/charge/artists',route=>route.fulfill({json:{artists:ids.map((id,i)=>({id,name:names[i],minutes:i===0?16033:968+i*71,seconds:(i===0?16033:968+i*71)*60,energy:Math.floor((i===0?16033:968+i*71)/60),songs:8+i,diaries:4+i%4,isDemo:true})),catalog:{}}}));
 await page.goto('/#/spark');
 await expect(page.locator('.spark-number strong')).toHaveText('1285');
 await expect(page.locator('.charge-milestone.is-reached')).toHaveCount(3);
 await page.locator('.charge-milestone').nth(1).getByRole('button').focus();
 await expect(page.getByRole('tooltip')).toHaveCount(1);
 await expect(page.getByRole('tooltip')).toContainText('解锁一天免费会员');
 await page.getByRole('button',{name:'电量值，点击切换明星电量值'}).click();
 const wheel=page.getByRole('listbox',{name:'上下滑动选择明星'});
 await expect(wheel).toBeVisible();
 await expect(page.locator('.charge-mode-toggle svg')).toHaveCount(1);
 await expect(wheel).not.toHaveClass(/is-moving/);
 await expect(wheel.locator('#star-joker')).toHaveCSS('opacity','0');
 await wheel.press('ArrowDown');
 await expect(wheel).toHaveClass(/is-moving/);
 await expect(page.getByRole('option',{name:'薛之谦',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(wheel).not.toHaveClass(/is-moving/);
 await expect(wheel.locator('#star-jay')).toHaveCSS('opacity','0');
 await wheel.press('Home');
 await expect(page.locator('.spark-number strong')).toHaveText('267');
 await expect(page.locator('.relationship-stats > div').first()).toContainText('16033');
 await expect(page.locator('.spark-number')).toContainText('点明星电量');
 await expect(page.locator('.charge-milestone')).toHaveCount(4);
 await expect(page.locator('.charge-milestone.is-reached')).toHaveCount(1);
 await expect(page.getByRole('progressbar',{name:'明星电量进度'})).toHaveAttribute('aria-valuenow','267');
 await expect(page.getByRole('progressbar',{name:'明星电量进度'})).toHaveAttribute('aria-valuemax','1600');
 await expect(page.locator('.relationship-progress-caption')).toContainText('133 点');
 for(let i=0;i<10;i++){
  await wheel.evaluate((el,n)=>{el.scrollTo({top:n*144,behavior:'instant'})},i);
  await expect(page.getByRole('option',{name:names[i],exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.spark-number strong')).toHaveText(String(Math.floor((i===0?16033:968+i*71)/60)));
  await expect(page.locator('.relationship-stats > div').nth(1)).toContainText(String(8+i));
 }
 // Last -> first and first -> last both wrap without changing the surrounding page.
 await wheel.press('ArrowDown');
 await expect(page.getByRole('option',{name:'周杰伦',exact:true})).toHaveAttribute('aria-selected','true');
 await wheel.press('ArrowUp');
 await expect(page.getByRole('option',{name:'权志龙',exact:true})).toHaveAttribute('aria-selected','true');
 await wheel.press('Home');
 await expect(page.getByRole('option',{name:'周杰伦',exact:true})).toHaveAttribute('aria-selected','true');
 for(const width of [320,393,844,1440]){
  await page.setViewportSize({width,height:852});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const bounds=await page.locator('.spark-number').evaluate(el=>({outer:el.getBoundingClientRect().right,last:el.lastElementChild!.getBoundingClientRect().right}));
  expect(bounds.last).toBeLessThanOrEqual(bounds.outer+1);
  await page.locator('.star-charge-companion').focus();
  await expect(page.locator('.star-charge-companion')).toHaveCSS('outline-offset','-6px');
  const gap=await page.locator('.star-charge-note').evaluate(el=>{const note=el.getBoundingClientRect(),person=document.querySelector('.star-charge-companion')!.getBoundingClientRect();return person.left-note.right;});
  expect(gap).toBeGreaterThanOrEqual(0);
  if(width===393)await page.screenshot({path:'output/star-charging-mobile.png',fullPage:true,animations:'disabled'});
  if(width===1440)await page.screenshot({path:'output/star-charging-wide.png',fullPage:true,animations:'disabled'});
 }
 await page.getByRole('button',{name:'去记录',exact:true}).click();
 await expect(page.getByRole('heading',{name:'周杰伦 · 专属日记'})).toBeVisible();
 await page.getByRole('textbox',{name:'听 周杰伦 的歌时的心情'}).fill('今天听晴天，心情轻松了许多');
 await page.getByRole('textbox',{name:'专属日记正文'}).fill('留一段安静的听歌时光给自己。');
 await page.getByRole('button',{name:'保存日记',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('专属日记已保存');
 await page.getByRole('button',{name:'返回听歌充电'}).click();
 await wheel.press('ArrowDown');
 await expect(page.getByRole('option',{name:'薛之谦',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'去记录',exact:true}).click();
 await expect(page.getByRole('heading',{name:'薛之谦 · 专属日记'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'专属日记正文'})).toHaveValue('');
 await page.getByRole('button',{name:'返回听歌充电'}).click();
 await page.getByRole('button',{name:'明星电量值，点击切换电量值'}).click();
 await expect(page.locator('.spark-number strong')).toHaveText('1285');
 await expect(page.locator('.star-charge-companion .character-visual')).toHaveCount(1);
 await expect(page.getByRole('listbox',{name:'上下滑动选择明星'})).toBeVisible();
});

test('failed session check shows nickname entry and can recover by signing in', async ({ page, context }) => {
 const nickname = freshName('重连');
 await context.request.post('/api/auth/login', { data: { nickname, gender: 'female' } });
 await context.request.post('/api/auth/complete');
 await page.route('**/api/auth/session', route => route.abort('failed'));
 await page.goto('/#/companion-space');
 await expect(page.getByLabel('AI 形象昵称', { exact: true })).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('暂时没有连接上');
 await page.unroute('**/api/auth/session');
 await page.getByLabel('AI 形象昵称', { exact: true }).fill(nickname);
 await page.getByRole('button', { name: '遇见我的音乐搭子' }).click();
 await expect(page.locator('.home-page')).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');
});

for (const failure of ['network', 'expired'] as const) {
 test(`room load ${failure} returns to nickname entry without a reload loop`, async ({ page, context }) => {
  await context.request.post('/api/auth/login', { data: { nickname: freshName('恢复'), gender: 'male' } });
  await context.request.post('/api/auth/complete');
  await page.route('**/api/bootstrap', route => failure === 'network' ? route.abort('failed') : route.fulfill({ status: 401, json: { code: 'LOGIN_REQUIRED', error: '先输入昵称，回到你的音乐小屋吧' } }));
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.goto('/');
  await expect(page.getByLabel('AI 形象昵称', { exact: true })).toBeVisible();
  await expect(page.locator('.connection-state')).toHaveCount(0);
  await page.getByLabel('AI 形象昵称', { exact: true }).fill('可以重新输入');
  expect(navigations).toBe(1);
 });
}

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
 await other.goto('http://127.0.0.1:5190/#/reports');
 await expect(other.getByLabel('AI 形象昵称', { exact: true })).toBeVisible();
 await other.getByLabel('AI 形象昵称', { exact: true }).fill(nickname);
 await other.getByRole('button', { name: '遇见我的音乐搭子' }).click();
 await expect(other.locator('.home-page')).toBeVisible();
 expect(new URL(other.url()).hash).toBe('');
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
