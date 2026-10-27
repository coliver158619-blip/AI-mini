import {test,expect} from '@playwright/test';

test('陪伴页合入充电页，旧链接兼容，宽窄屏保持布局',async({page},info)=>{
 await page.goto('/');
 await page.getByRole('button',{name:/听歌充电/}).click();
 await expect(page).toHaveURL(/#\/spark$/);
 await expect(page.locator('.star-charge-companion .character-visual')).toHaveCount(1);
 await page.getByRole('button',{name:'返回音乐小屋'}).click();
 await page.locator('.energy-card').click();
 await expect(page.locator('.home-page')).toBeVisible();
 await expect(page.locator('.energy-card > svg')).toHaveCount(0);
 for(const route of ['spark','companion-energy','companion-space']){
  await page.goto(`/#/${route}`);
  if(route!=='companion-space'){
   await expect(page.getByRole('heading',{name:'听歌充电',exact:true})).toBeVisible();
   await expect(page.locator('.charge-milestone')).toHaveCount(4);
  }
  for(const width of [320,393,844,1440]){
   await page.setViewportSize({width,height:852});
   await expect(page.locator('main h1')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(route==='companion-space')await expect(page.locator('.couple-characters').getByRole('img',{name:'跳动的彩色音符'})).toBeVisible();
   else await expect(page.getByRole('listbox',{name:'上下滑动选择明星'})).toBeVisible();
   if(width===393)await page.screenshot({path:`output/relationship-${route}-${info.project.name}.png`,fullPage:true,animations:'disabled'});
  }
 }
});

test('充电沿用个人成长电量，听歌与每日点心保存后同步到首页',async({page,request},info)=>{
 const profile=async()=>(await(await request.get('/api/bootstrap')).json()).profile;
 const initial=await profile();
 await page.goto('/#/spark');
 await expect(page.locator('.spark-number strong')).toHaveText(String(initial.energy));
 const key=`charge-${info.project.name}-${Date.now()}`;
 const result=await request.post('/api/play',{data:{songId:'sunny-window',seconds:120,context:'solo',sessionId:key,eventId:key}});
 expect(result.ok()).toBe(true);
 await page.reload();
 await expect(page.locator('.spark-number strong')).toHaveText(String(Math.min(1600,initial.energy+4)));
 const before=await profile();
 const feed=page.locator('.personal-feed');
 if(!before.fedToday){await feed.click();await expect(feed).toBeDisabled();}
 const after=await profile();
 expect(after.energy).toBe(before.fedToday?before.energy:Math.min(before.energyMax,before.energy+40));
 await request.post('/api/feed',{data:{}});
 expect((await profile()).energy).toBe(after.energy);
 await page.reload();await expect(feed).toBeDisabled();
 await page.getByRole('button',{name:'返回音乐小屋'}).click();
 await expect(page.getByRole('progressbar',{name:'我们的陪伴电量'})).toHaveAttribute('aria-valuenow',String(after.energy));
});

test('加载失败保留成长电量，明星统计不伪装零值且可重试',async({page})=>{
 await page.route('**/api/charge/artists',route=>route.fulfill({status:503,json:{error:'暂时连接不上'}}));
 await page.goto('/#/spark');
 await expect(page.getByRole('alert')).toContainText('暂时连接不上');
 await expect(page.getByRole('progressbar',{name:'陪伴电量进度'})).toBeVisible();
 await page.getByRole('button',{name:'电量值，点击切换明星电量值'}).click();
 await expect(page.locator('.spark-number strong')).toHaveText('—');
 await page.unroute('**/api/charge/artists');
 await page.getByRole('button',{name:'重新加载'}).click();
 await expect(page.locator('.relationship-stats')).toBeVisible();
 await page.getByRole('button',{name:'明星电量值，点击切换电量值'}).click();
 await page.getByRole('button',{name:/聊聊今天/}).click();
 await expect(page.getByRole('dialog',{name:'和音乐搭子聊天'})).toBeVisible();
});
