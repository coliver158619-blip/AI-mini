import {test,expect} from '@playwright/test';

test('独立入口、刷新与浏览器返回；两页和双人空间在各屏宽保持布局',async({page},info)=>{
 await page.goto('/');
 await page.getByRole('button',{name:/听歌续火花/}).click();
 await expect(page).toHaveURL(/#\/spark$/);
 await expect(page.locator('.spark-number strong')).toBeVisible();
 await expect(page.locator('.bottom-sheet')).toHaveCount(0);
 await expect(page.locator('.streak-couple .character-visual')).toHaveCount(2);
 await page.reload();await expect(page.getByRole('heading',{name:'听歌续火花',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'返回音乐小屋'}).click();
 await page.locator('.energy-card').click();
 await expect(page).toHaveURL(/#\/companion-energy$/);
 await expect(page.getByRole('heading',{name:'我们的陪伴能量',exact:true})).toBeVisible();
 await expect(page.locator('.personal-bond .character-visual')).toHaveCount(1);
 await page.reload();await expect(page.locator('.personal-growth')).toBeVisible();
 await page.goBack();await expect(page.locator('.energy-card')).toBeVisible();
 await page.goForward();await expect(page.locator('.personal-growth')).toBeVisible();
 for(const route of ['spark','companion-energy','companion-space']){
  await page.goto(`/#/${route}`);
  for(const width of [320,393,844,1440]){
   await page.setViewportSize({width,height:852});
   await expect(page.locator('main h1')).toBeVisible();
   for(const c of await page.locator('main .character-visual').all())await expect(c).toHaveAttribute('data-motion-ready','true');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(route!=='companion-energy'){
    const pair=page.locator('.couple-characters');
    await expect(pair.getByRole('img',{name:'跳动的彩色音符'})).toBeVisible();
    const [a,b]=await pair.locator('.couple-figure').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
    expect(Math.abs(a-b)).toBeLessThan(1);
   }
   if(width===393)await page.screenshot({path:`output/relationship-${route}-${info.project.name}.png`,fullPage:true,animations:'disabled'});
  }
 }
});

test('共同听歌与共享日记累积火花；个人听歌和点心不混入，保存后可重开',async({page,request},info)=>{
 await page.goto('/#/spark');
 const number=page.locator('.spark-number strong');await expect(number).toBeVisible();
 const initial=Number(await number.innerText());
 const id=`relationship-${info.project.name}-${Date.now()}`;
 const play=async(context:string)=>expect((await request.post('/api/play',{data:{songId:'sunny-window',seconds:120,context,sessionId:id+context,eventId:id+context}})).ok()).toBe(true);
 await play('together');
 await page.reload();await expect(number).toHaveText(String(initial+2));
 const day=info.project.name==='webkit'?'2025-01-03':'2025-01-02';
 const entries=(await(await request.get('/api/shared-diary')).json()).entries;
 let entry=entries.find((e:{date:string})=>e.date===day)||{revision:0};
 const hadDiary=Boolean(entry.note?.trim()||entry.body?.trim());
 let saved=await request.put(`/api/shared-diary/${day}`,{data:{revision:entry.revision,note:'我们一起听音乐',body:'留下共同的回忆'}});expect(saved.ok()).toBe(true);
 entry=(await saved.json()).entry;
 const expected=initial+2+(hadDiary?0:10);
 await page.reload();await expect(number).toHaveText(String(expected));
 saved=await request.put(`/api/shared-diary/${day}`,{data:{...entry,body:'修改后的共同回忆'}});expect(saved.ok()).toBe(true);
 await play('solo');await page.reload();await expect(number).toHaveText(String(expected));
 await page.getByRole('button',{name:'进入陪伴空间',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'双人火花',exact:true})).toHaveAttribute('aria-valuenow',String(expected));
 await page.goto('/#/companion-energy');
 const before=(await(await request.get('/api/bootstrap')).json()).profile;
 await expect(page.getByRole('progressbar',{name:'个人陪伴能量'})).toHaveAttribute('aria-valuenow',String(before.energy));
 const feed=page.locator('.personal-feed');
 if(!before.fedToday){await feed.click();await expect(feed).toBeDisabled();}
 const after=(await(await request.get('/api/bootstrap')).json()).profile;
 expect(after.energy).toBe(before.fedToday?before.energy:Math.min(before.energyMax,before.energy+40));
 await request.post('/api/feed',{data:{}});
 expect((await(await request.get('/api/bootstrap')).json()).profile.energy).toBe(after.energy);
 await page.reload();await expect(feed).toBeDisabled();
 await page.goto('/#/spark');await expect(number).toHaveText(String(expected));
});

test('加载失败可重试，不显示虚假的零火花；个人入口可打开聊天',async({page})=>{
 await page.route('**/api/together/playlist',route=>route.fulfill({status:503,json:{error:'暂时连接不上'}}));
 await page.goto('/#/spark');
 await expect(page.getByRole('alert')).toContainText('暂时连接不上');await expect(page.locator('.spark-number')).toHaveCount(0);
 await page.unroute('**/api/together/playlist');await page.getByRole('button',{name:'重新加载'}).click();await expect(page.locator('.spark-number')).toBeVisible();
 await page.route('**/api/reports?period=week',route=>route.fulfill({status:503,json:{error:'本周时光暂时打不开'}}));
 await page.goto('/#/companion-energy');await expect(page.getByRole('alert')).toContainText('本周时光暂时打不开');
 await expect(page.getByRole('progressbar',{name:'个人陪伴能量'})).toBeVisible();
 await page.unroute('**/api/reports?period=week');await page.getByRole('button',{name:'重新加载'}).click();await expect(page.locator('.personal-week .relationship-stats')).toBeVisible();
 await page.getByRole('button',{name:/聊聊今天/}).click();await expect(page.getByRole('dialog',{name:'和音乐搭子聊天'})).toBeVisible();
});
